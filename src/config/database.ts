import {
  StoredSighting,
  enqueueCreateMany,
  enqueueDelete,
  fromStored,
  readCache,
  readOutbox,
  replaceCacheFromRemote,
} from "../storage/localStore";
import { AnimalSighting, IS_DEV, LOCAL_API, remoteGet } from "./remote";
import { getSyncState, requestSync, syncNow } from "../sync/syncEngine";

/**
 * Offline-first data facade. Screens import the same three functions they always
 * did; what changed is that none of them block on the network.
 *
 * Writes go to device storage and return immediately. Reads always resolve from the
 * local cache merged with anything still queued, refreshing from the server in the
 * background when it's reachable.
 */

export interface SightingView extends AnimalSighting {
  id: string;
  pending?: boolean;
  failed?: boolean;
}

function toView(
  stored: StoredSighting,
  flags?: { pending?: boolean; failed?: boolean }
): SightingView {
  return { ...fromStored(stored), id: stored.id, ...flags } as SightingView;
}

/**
 * Cache first, then anything still in the outbox that isn't already represented,
 * minus anything with a queued delete. Because commitCreateSuccess moves a record
 * from outbox to cache under a single lock, a record can never appear in both — so
 * this can't double-count.
 */
async function mergeLocal(): Promise<SightingView[]> {
  const [cache, outbox] = await Promise.all([readCache(), readOutbox()]);

  const deleted = new Set(
    outbox.filter((e) => e.op === "delete" && e.targetId).map((e) => e.targetId!)
  );

  const byId = new Map<string, SightingView>();
  for (const record of cache.records) {
    if (!deleted.has(record.id)) byId.set(record.id, toView(record));
  }
  for (const entry of outbox) {
    if (entry.op !== "create" || !entry.payload) continue;
    if (deleted.has(entry.payload.id) || byId.has(entry.payload.id)) continue;
    byId.set(
      entry.payload.id,
      toView(entry.payload, {
        pending: entry.status === "pending",
        failed: entry.status === "failed",
      })
    );
  }

  return [...byId.values()].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );
}

/** Queues a sighting locally and returns its id immediately. Never hits the network. */
export async function addSighting(
  sighting: Omit<AnimalSighting, "id">
): Promise<string> {
  const [created] = await enqueueCreateMany([sighting]);
  requestSync("save");
  return created.id;
}

/**
 * Queues several sightings in one atomic write. LogSightingScreen can create both a
 * "dead" and a "live" record from one tap, and this keeps them from half-landing.
 */
export async function addSightings(
  sightings: Omit<AnimalSighting, "id">[]
): Promise<string[]> {
  const created = await enqueueCreateMany(sightings);
  requestSync("save");
  return created.map((c) => c.id);
}

/**
 * Refreshes from the server when possible, but ALWAYS resolves from local data.
 * Being offline is not an error here — it only rejects if device storage fails.
 */
export async function getSightings(): Promise<SightingView[]> {
  // Skip the round trip entirely when we already know we're offline, so a
  // pull-to-refresh returns at once instead of spinning out the request timeout.
  if (getSyncState().online) {
    try {
      const remote = await remoteGet();
      await replaceCacheFromRemote(remote);
    } catch (err: any) {
      console.log(`[database] remote fetch unavailable, using cache: ${err.message}`);
    }
  }
  requestSync("focus");
  return mergeLocal();
}

/** Local-only read, for an instant first paint before the network is consulted. */
export async function getSightingsLocal(): Promise<SightingView[]> {
  return mergeLocal();
}

export async function deleteSighting(id: string): Promise<void> {
  const { dropped } = await enqueueDelete(id);
  if (!dropped) requestSync("save");
}

export { IS_DEV, LOCAL_API, syncNow, getSyncState };
export type { AnimalSighting };
