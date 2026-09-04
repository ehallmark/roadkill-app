import AsyncStorage from "@react-native-async-storage/async-storage";
import { AnimalSighting, IS_DEV } from "../config/remote";
import type { SightingStatus } from "../config/firebase";

/**
 * The only module that touches AsyncStorage.
 *
 * Two blobs are persisted: a cache of server truth (rebuildable, safe to discard)
 * and an outbox of local writes that haven't reached the server yet (NOT safe to
 * discard — it is the user's data and the whole reason this layer exists).
 */

// Namespaced by backend: __DEV__ flips between Mongo ObjectIds and Firestore ids,
// and mixing the two id spaces in one cache would produce phantom duplicates.
const NS = IS_DEV ? "local" : "fb";
const K_CACHE = `@roadkill/v1/${NS}/cache`;
const K_OUTBOX = `@roadkill/v1/${NS}/outbox`;
const K_META = `@roadkill/v1/${NS}/meta`;
const K_OUTBOX_CORRUPT = `@roadkill/v1/${NS}/outbox.corrupt`;
export const K_VOICE_MODEL = "@roadkill/v1/offlineVoiceModel";

const MAX_CACHED = 2000;
const RECENT_WINDOW_MS = 120_000;
export const MAX_ATTEMPTS = 8;

type ISODate = string;

/** AnimalSighting with timestamp flattened to ISO — the only shape ever JSON'd. */
export interface StoredSighting {
  id: string;
  animal: string;
  status: SightingStatus;
  latitude: number;
  longitude: number;
  address: string | null;
  timestamp: ISODate;
  notes: string | null;
}

export interface CacheBlob {
  version: 1;
  updatedAt: ISODate | null;
  records: StoredSighting[];
  recentlySynced: StoredSighting[];
}

export type OutboxOp = "create" | "delete";
export type OutboxStatus = "pending" | "failed";

export interface OutboxEntry {
  localId: string;
  seq: number;
  op: OutboxOp;
  payload: StoredSighting | null;
  targetId: string | null;
  createdAt: ISODate;
  attempts: number;
  nextAttemptAt: ISODate;
  lastError: string | null;
  status: OutboxStatus;
  deleteAfterSync?: boolean;
}

interface SyncMeta {
  version: 1;
  seq: number;
  lastSyncAt: ISODate | null;
  lastError: string | null;
}

const EMPTY_CACHE: CacheBlob = {
  version: 1,
  updatedAt: null,
  records: [],
  recentlySynced: [],
};
const EMPTY_META: SyncMeta = { version: 1, seq: 0, lastSyncAt: null, lastError: null };

// ---- Mutex ----

// Single JS runtime, so chaining every read-modify-write onto one promise fully
// serializes the save path against the sync drain. Network I/O deliberately stays
// OUTSIDE the lock, so a save never waits behind a 12s timeout.
let chain: Promise<unknown> = Promise.resolve();

export function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn); // run even if the previous op rejected
  chain = run.catch(() => {}); // a rejection must not poison the chain
  return run;
}

// ---- Serialization ----

export function makeLocalId(): string {
  return `lcl${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function toStored(
  sighting: Omit<AnimalSighting, "id">,
  id: string
): StoredSighting {
  return {
    id,
    animal: sighting.animal,
    status: sighting.status,
    latitude: sighting.latitude,
    longitude: sighting.longitude,
    address: sighting.address ?? null,
    timestamp: sighting.timestamp.toISOString(),
    notes: sighting.notes ?? null,
  };
}

export function fromStored(stored: StoredSighting): AnimalSighting {
  const parsed = new Date(stored.timestamp);
  return {
    id: stored.id,
    animal: stored.animal || "Unknown",
    status: stored.status === "dead" ? "dead" : "live",
    latitude: stored.latitude ?? 0,
    longitude: stored.longitude ?? 0,
    address: stored.address ?? undefined,
    // A corrupted timestamp must not produce an Invalid Date that crashes
    // toLocaleDateString() in the History list.
    timestamp: isNaN(parsed.getTime()) ? new Date(0) : parsed,
    notes: stored.notes ?? undefined,
  };
}

// ---- Raw reads (unlocked; callers below wrap them) ----

async function loadCache(): Promise<CacheBlob> {
  try {
    const raw = await AsyncStorage.getItem(K_CACHE);
    if (!raw) return { ...EMPTY_CACHE };
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1 || !Array.isArray(parsed.records)) {
      return { ...EMPTY_CACHE };
    }
    return { ...EMPTY_CACHE, ...parsed, recentlySynced: parsed.recentlySynced ?? [] };
  } catch (err: any) {
    // The cache is rebuildable from the server, so discarding it is safe.
    console.warn(`[store] cache unreadable, discarding: ${err.message}`);
    return { ...EMPTY_CACHE };
  }
}

async function loadOutbox(): Promise<OutboxEntry[]> {
  const raw = await AsyncStorage.getItem(K_OUTBOX);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("outbox is not an array");
    return parsed;
  } catch (err: any) {
    // Unlike the cache, this is unsynced user data. Quarantine it rather than
    // dropping it, so it can be recovered by hand if it ever happens.
    console.error(`[store] outbox unreadable, quarantining: ${err.message}`);
    await AsyncStorage.setItem(K_OUTBOX_CORRUPT, raw);
    await AsyncStorage.setItem(K_OUTBOX, "[]");
    return [];
  }
}

async function loadMeta(): Promise<SyncMeta> {
  try {
    const raw = await AsyncStorage.getItem(K_META);
    if (!raw) return { ...EMPTY_META };
    const parsed = JSON.parse(raw);
    return parsed?.version === 1 ? parsed : { ...EMPTY_META };
  } catch {
    return { ...EMPTY_META };
  }
}

const saveCache = (c: CacheBlob) => AsyncStorage.setItem(K_CACHE, JSON.stringify(c));
const saveOutbox = (o: OutboxEntry[]) => AsyncStorage.setItem(K_OUTBOX, JSON.stringify(o));
const saveMeta = (m: SyncMeta) => AsyncStorage.setItem(K_META, JSON.stringify(m));

function pruneRecent(recent: StoredSighting[], now: number): StoredSighting[] {
  return recent.filter((r) => {
    const t = new Date(r.timestamp).getTime();
    return !isNaN(t) && now - t < RECENT_WINDOW_MS;
  });
}

// ---- Public API (all lock-wrapped) ----

export function readCache(): Promise<CacheBlob> {
  return withLock(loadCache);
}

export function readOutbox(): Promise<OutboxEntry[]> {
  return withLock(loadOutbox);
}

/**
 * Replaces the cache with a fresh server fetch, unioning back in anything we pushed
 * in the last two minutes. Without that, a GET already in flight when a push landed
 * would make the record briefly vanish from History.
 */
export function replaceCacheFromRemote(records: AnimalSighting[]): Promise<CacheBlob> {
  return withLock(async () => {
    const prev = await loadCache();
    const now = Date.now();
    const stored = records.map((r) => toStored(r, r.id!));
    const seen = new Set(stored.map((r) => r.id));
    const recent = pruneRecent(prev.recentlySynced, now);

    for (const r of recent) {
      if (!seen.has(r.id)) stored.push(r);
    }

    stored.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const next: CacheBlob = {
      version: 1,
      updatedAt: new Date(now).toISOString(),
      records: stored.slice(0, MAX_CACHED),
      recentlySynced: recent,
    };
    await saveCache(next);
    return next;
  });
}

/** Queues one or more creates atomically, so a two-row save can't half-land. */
export function enqueueCreateMany(
  items: Omit<AnimalSighting, "id">[]
): Promise<StoredSighting[]> {
  return withLock(async () => {
    const outbox = await loadOutbox();
    const meta = await loadMeta();
    const now = new Date().toISOString();
    const created: StoredSighting[] = [];

    for (const item of items) {
      const localId = makeLocalId();
      const payload = toStored(item, localId);
      created.push(payload);
      outbox.push({
        localId,
        seq: ++meta.seq,
        op: "create",
        payload,
        targetId: null,
        createdAt: now,
        attempts: 0,
        nextAttemptAt: now,
        lastError: null,
        status: "pending",
      });
    }

    await saveOutbox(outbox);
    await saveMeta(meta);
    console.log(`[store] queued ${created.length} create(s), outbox=${outbox.length}`);
    return created;
  });
}

/**
 * Removes a record locally and, if it ever reached the server, queues the remote
 * delete. Returns dropped=true when the record was never synced, in which case
 * there is nothing for the sync engine to do.
 */
export function enqueueDelete(id: string): Promise<{ dropped: boolean }> {
  return withLock(async () => {
    const outbox = await loadOutbox();
    const meta = await loadMeta();
    const now = new Date().toISOString();

    const pendingCreate = outbox.find((e) => e.op === "create" && e.localId === id);
    if (pendingCreate) {
      if (pendingCreate.attempts > 0) {
        // It may already be committing on the server. Let the create finish, then
        // delete it — otherwise the row resurrects on the next fetch.
        pendingCreate.deleteAfterSync = true;
        await saveOutbox(outbox);
        return { dropped: false };
      }
      await saveOutbox(outbox.filter((e) => e !== pendingCreate));
      console.log(`[store] dropped unsynced create ${id}`);
      return { dropped: true };
    }

    outbox.push({
      localId: makeLocalId(),
      seq: ++meta.seq,
      op: "delete",
      payload: null,
      targetId: id,
      createdAt: now,
      attempts: 0,
      nextAttemptAt: now,
      lastError: null,
      status: "pending",
    });

    const cache = await loadCache();
    cache.records = cache.records.filter((r) => r.id !== id);
    cache.recentlySynced = cache.recentlySynced.filter((r) => r.id !== id);

    await saveOutbox(outbox);
    await saveMeta(meta);
    await saveCache(cache);
    return { dropped: false };
  });
}

/**
 * Atomically moves a synced create out of the outbox and into the cache. Doing both
 * under one lock is what guarantees a record is never in both places at once, which
 * is what would otherwise show it twice in History.
 */
export function commitCreateSuccess(localId: string, remoteId: string): Promise<void> {
  return withLock(async () => {
    const outbox = await loadOutbox();
    const entry = outbox.find((e) => e.localId === localId);
    const cache = await loadCache();
    const meta = await loadMeta();

    if (entry?.payload) {
      const synced: StoredSighting = { ...entry.payload, id: remoteId };
      cache.records = [synced, ...cache.records.filter((r) => r.id !== remoteId)]
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, MAX_CACHED);
      cache.recentlySynced = [
        synced,
        ...pruneRecent(cache.recentlySynced, Date.now()).filter((r) => r.id !== remoteId),
      ];
    }

    let next = outbox.filter((e) => e.localId !== localId);

    // The user deleted this while it was in flight; now that it exists remotely, it
    // can actually be removed.
    if (entry?.deleteAfterSync) {
      next.push({
        localId: makeLocalId(),
        seq: ++meta.seq,
        op: "delete",
        payload: null,
        targetId: remoteId,
        createdAt: new Date().toISOString(),
        attempts: 0,
        nextAttemptAt: new Date().toISOString(),
        lastError: null,
        status: "pending",
      });
      cache.records = cache.records.filter((r) => r.id !== remoteId);
      cache.recentlySynced = cache.recentlySynced.filter((r) => r.id !== remoteId);
    }

    meta.lastSyncAt = new Date().toISOString();
    await saveOutbox(next);
    await saveCache(cache);
    await saveMeta(meta);
  });
}

export function commitDeleteSuccess(localId: string): Promise<void> {
  return withLock(async () => {
    const outbox = await loadOutbox();
    const meta = await loadMeta();
    meta.lastSyncAt = new Date().toISOString();
    await saveOutbox(outbox.filter((e) => e.localId !== localId));
    await saveMeta(meta);
  });
}

/**
 * Records a failed attempt. Note this never removes the entry: a permanently failing
 * record stays visible with a badge rather than silently disappearing, which is the
 * exact bug this whole feature exists to fix.
 */
export function markOutboxFailure(
  localId: string,
  message: string,
  permanent: boolean
): Promise<void> {
  return withLock(async () => {
    const outbox = await loadOutbox();
    const entry = outbox.find((e) => e.localId === localId);
    if (!entry) return;

    entry.attempts += 1;
    entry.lastError = message;
    entry.status = permanent || entry.attempts >= MAX_ATTEMPTS ? "failed" : "pending";

    const base = Math.min(5_000 * 2 ** (entry.attempts - 1), 30 * 60_000);
    const jitter = base * (0.8 + Math.random() * 0.4);
    entry.nextAttemptAt = new Date(Date.now() + jitter).toISOString();

    const meta = await loadMeta();
    meta.lastError = message;

    await saveOutbox(outbox);
    await saveMeta(meta);
    console.log(
      `[store] ${localId} attempt ${entry.attempts} failed (${entry.status}), ` +
        `next in ~${Math.round(jitter / 1000)}s: ${message}`
    );
  });
}

/** Clears every backoff gate, e.g. the moment connectivity returns. */
export function resetBackoff(): Promise<void> {
  return withLock(async () => {
    const outbox = await loadOutbox();
    if (outbox.length === 0) return;
    const now = new Date().toISOString();
    for (const entry of outbox) entry.nextAttemptAt = now;
    await saveOutbox(outbox);
  });
}

export function readMeta(): Promise<SyncMeta> {
  return withLock(loadMeta);
}

export async function getFlag(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setFlag(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch (err: any) {
    console.warn(`[store] could not persist flag ${key}: ${err.message}`);
  }
}
