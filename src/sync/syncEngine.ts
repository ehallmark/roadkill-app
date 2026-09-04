import { AppState, AppStateStatus } from "react-native";
import * as Network from "expo-network";
import * as Location from "expo-location";
import {
  OutboxEntry,
  commitCreateSuccess,
  commitDeleteSuccess,
  fromStored,
  markOutboxFailure,
  readMeta,
  readOutbox,
  resetBackoff,
} from "../storage/localStore";
import { classifyError, remoteAdd, remoteDelete } from "../config/remote";

export type SyncTrigger =
  | "start"
  | "foreground"
  | "focus"
  | "connectivity"
  | "timer"
  | "save"
  | "manual";

export interface SyncState {
  online: boolean;
  syncing: boolean;
  pending: number;
  failed: number;
  lastSyncAt: Date | null;
  lastError: string | null;
}

const TIMER_MS = 60_000;

let state: SyncState = {
  online: true,
  syncing: false,
  pending: 0,
  failed: 0,
  lastSyncAt: null,
  lastError: null,
};

const listeners = new Set<() => void>();
let draining: Promise<void> | null = null;
let rerun = false;
let started = false;

export function getSyncState(): SyncState {
  return state;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setState(patch: Partial<SyncState>) {
  const next = { ...state, ...patch };
  const changed = (Object.keys(patch) as (keyof SyncState)[]).some((k) => {
    const a = next[k];
    const b = state[k];
    return a instanceof Date || b instanceof Date
      ? String(a) !== String(b)
      : a !== b;
  });
  if (!changed) return;
  state = next;
  // Snapshot: a listener that unsubscribes mid-notify must not break the loop.
  for (const listener of [...listeners]) listener();
}

async function refreshCounts() {
  const outbox = await readOutbox();
  const meta = await readMeta();
  setState({
    pending: outbox.filter((e) => e.status === "pending").length,
    failed: outbox.filter((e) => e.status === "failed").length,
    lastSyncAt: meta.lastSyncAt ? new Date(meta.lastSyncAt) : null,
  });
}

/**
 * Cheap pre-flight check. Bailing here is what keeps a tap on the status bar instant
 * while offline instead of blocking for the full 12s request timeout.
 *
 * `undefined` means "unknown" (web, or before the first reading) — treat that as
 * online and let the timeout decide, or the bar falsely reads Offline on cold start.
 */
async function isOnline(): Promise<boolean> {
  try {
    const net = await Network.getNetworkStateAsync();
    return net.isConnected !== false && net.isInternetReachable !== false;
  } catch {
    return true;
  }
}

/**
 * Best-effort address for a record captured with no connection, where
 * reverseGeocodeAsync could not have succeeded. Coordinates are never re-derived —
 * silently relocating a sighting to wherever the phone regained signal would be far
 * worse than leaving the address blank.
 */
async function backfillAddress(entry: OutboxEntry): Promise<string | null> {
  const p = entry.payload;
  if (!p || p.address || (p.latitude === 0 && p.longitude === 0)) return null;
  try {
    const [geo] = await Location.reverseGeocodeAsync({
      latitude: p.latitude,
      longitude: p.longitude,
    });
    if (!geo) return null;
    const parts = [geo.city, geo.region, geo.country].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : null;
  } catch {
    return null;
  }
}

async function pushEntry(entry: OutboxEntry): Promise<void> {
  if (entry.op === "create") {
    if (!entry.payload) {
      await commitDeleteSuccess(entry.localId); // malformed; drop it rather than loop
      return;
    }
    const sighting = fromStored(entry.payload);
    const address = sighting.address ?? (await backfillAddress(entry));
    const remoteId = await remoteAdd(entry.localId, { ...sighting, address });
    await commitCreateSuccess(entry.localId, remoteId);
    console.log(`[sync] created ${entry.localId} -> ${remoteId}`);
    return;
  }

  if (entry.targetId) {
    await remoteDelete(entry.targetId);
  }
  await commitDeleteSuccess(entry.localId);
  console.log(`[sync] deleted ${entry.targetId}`);
}

async function drain(): Promise<void> {
  const online = await isOnline();
  setState({ online });
  if (!online) {
    await refreshCounts();
    return;
  }

  const outbox = await readOutbox();
  if (outbox.length === 0) {
    await refreshCounts();
    return;
  }

  setState({ syncing: true });
  try {
    // Ordered by seq, not createdAt: a device clock change must not reorder a
    // delete ahead of the create it depends on.
    const queue = [...outbox].sort((a, b) => a.seq - b.seq);

    for (const entry of queue) {
      if (new Date(entry.nextAttemptAt).getTime() > Date.now()) continue;

      try {
        await pushEntry(entry);
        setState({ lastError: null });
      } catch (err: any) {
        const kind = classifyError(err);
        const message = err?.message || "Sync failed";
        await markOutboxFailure(entry.localId, message, kind === "permanent");
        setState({ lastError: message });

        if (kind === "network") {
          // The connection is gone. Stop rather than hammer the rest of the queue.
          setState({ online: false });
          break;
        }
      }
    }
  } finally {
    setState({ syncing: false });
    await refreshCounts();
  }
}

export function syncNow(): Promise<SyncState> {
  if (draining) {
    rerun = true;
    return draining.then(() => state);
  }

  draining = (async () => {
    do {
      rerun = false;
      await drain();
    } while (rerun);
  })()
    .catch((err: any) => {
      console.error(`[sync] drain crashed: ${err.message}`);
      setState({ lastError: err.message, syncing: false });
    })
    .finally(() => {
      draining = null;
    });

  return draining.then(() => state);
}

export function requestSync(trigger: SyncTrigger): void {
  syncNow().catch(() => {});
  if (__DEV__) console.log(`[sync] requested by ${trigger}`);
}

export function initSyncEngine(): () => void {
  if (started) return () => {};
  started = true;

  const appStateSub = AppState.addEventListener("change", (next: AppStateStatus) => {
    if (next === "active") requestSync("foreground");
  });

  const networkSub = Network.addNetworkStateListener((net) => {
    const nowOnline = net.isConnected !== false && net.isInternetReachable !== false;
    const wasOffline = !state.online;
    setState({ online: nowOnline });
    if (nowOnline && wasOffline) {
      // The connection just came back: clear every backoff gate, including entries
      // already marked failed, so the queue drains immediately instead of waiting
      // out a 30-minute timer.
      resetBackoff().then(() => requestSync("connectivity"));
    }
  });

  const timer = setInterval(() => {
    // Returns in microseconds when the outbox is empty.
    readOutbox().then((outbox) => {
      if (outbox.length > 0) requestSync("timer");
    });
  }, TIMER_MS);

  refreshCounts();
  requestSync("start");

  return () => {
    appStateSub.remove();
    networkSub.remove();
    clearInterval(timer);
    started = false;
  };
}
