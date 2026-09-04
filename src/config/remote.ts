import { Platform } from "react-native";
import Constants from "expo-constants";
import {
  AnimalSighting,
  addSightingWithId as firebaseAdd,
  getSightings as firebaseGet,
  deleteSighting as firebaseDelete,
} from "./firebase";

// In dev (Expo Go), use local API. In production, use Firebase.
const IS_DEV = __DEV__;

/**
 * Hard ceiling on any single remote call.
 *
 * This is not just politeness. The Firebase JS SDK does NOT reject when the device
 * is offline: addDoc/setDoc queue the write in memory and the promise simply never
 * settles. Without this the sync drain would wedge forever on its first entry.
 */
export const REQUEST_TIMEOUT_MS = 12_000;

export class TimeoutError extends Error {
  readonly kind = "timeout";
  constructor(label: string) {
    super(`${label} timed out after ${REQUEST_TIMEOUT_MS}ms`);
    this.name = "TimeoutError";
  }
}

function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  // The losing promise is abandoned, not cancelled. Swallow its eventual rejection
  // so it never surfaces as an unhandled rejection, and never let it touch state.
  p.catch(() => {});
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new TimeoutError(label)), REQUEST_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer!)) as Promise<T>;
}

// Detect the correct API host depending on platform:
// - Web: use the same hostname the browser is on (localhost)
// - Native device: use Expo's hostUri to get the dev machine IP
// - Android emulator: fallback to 10.0.2.2
function getLocalApiUrl(): string {
  // Web: just use the browser's current hostname
  if (Platform.OS === "web") {
    const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
    return `http://${host}:3001`;
  }

  // Native: try to get the host IP from Expo's dev server
  const debuggerHost =
    Constants.expoConfig?.hostUri ?? Constants.manifest2?.extra?.expoGo?.debuggerHost;
  if (debuggerHost) {
    const ip = debuggerHost.split(":")[0];
    return `http://${ip}:3001`;
  }

  // Fallback for Android emulator
  return "http://10.0.2.2:3001";
}

const LOCAL_API = getLocalApiUrl();

console.log(`[remote] mode=${IS_DEV ? "LOCAL" : "FIREBASE"}, api=${LOCAL_API}`);

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err: any) {
    // A real abort tears down the socket, unlike the Promise.race above.
    throw err?.name === "AbortError" ? new TimeoutError(url) : err;
  } finally {
    clearTimeout(timer);
  }
}

// ---- Local API client ----

async function localAddSighting(
  id: string,
  sighting: Omit<AnimalSighting, "id">
): Promise<string> {
  console.log(`[remote] POST ${LOCAL_API}/sightings`, sighting);
  const res = await fetchWithTimeout(`${LOCAL_API}/sightings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...sighting,
      clientId: id,
      timestamp: sighting.timestamp.toISOString(),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new HttpError(res.status, err.error || "Failed to save sighting");
  }
  const data = await res.json();
  return data.id;
}

async function localGetSightings(): Promise<AnimalSighting[]> {
  const res = await fetchWithTimeout(`${LOCAL_API}/sightings`);
  if (!res.ok) {
    throw new HttpError(res.status, "Failed to fetch sightings");
  }
  const data = await res.json();
  return data.map((item: any) => ({
    ...item,
    timestamp: new Date(item.timestamp),
  }));
}

async function localDeleteSighting(id: string): Promise<void> {
  const res = await fetchWithTimeout(`${LOCAL_API}/sightings/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new HttpError(res.status, "Failed to delete sighting");
  }
}

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

// ---- Exported transport ----

/** Writes at the given id. Returns the id the backend actually stored it under. */
export async function remoteAdd(
  id: string,
  sighting: Omit<AnimalSighting, "id">
): Promise<string> {
  if (IS_DEV) {
    return localAddSighting(id, sighting);
  }
  return withTimeout(firebaseAdd(id, sighting), "firestore setDoc");
}

export async function remoteGet(): Promise<AnimalSighting[]> {
  if (IS_DEV) {
    return localGetSightings();
  }
  return withTimeout(firebaseGet(), "firestore getDocs");
}

export async function remoteDelete(id: string): Promise<void> {
  if (IS_DEV) {
    return localDeleteSighting(id);
  }
  return withTimeout(firebaseDelete(id), "firestore deleteDoc");
}

/**
 * "network" — worth retrying, and a signal the connection is down, so the drain
 * should stop rather than hammer the rest of the queue.
 * "permanent" — retrying won't help; mark the entry failed and move on.
 */
export function classifyError(err: any): "network" | "permanent" {
  if (err instanceof TimeoutError) return "network";

  if (err instanceof HttpError) {
    // 4xx is us; 5xx and 408/429 are worth another go.
    if (err.status === 408 || err.status === 429) return "network";
    return err.status >= 400 && err.status < 500 ? "permanent" : "network";
  }

  const code = String(err?.code || "").toLowerCase();
  if (
    code.includes("unavailable") ||
    code.includes("deadline-exceeded") ||
    code.includes("resource-exhausted") ||
    code.includes("aborted") ||
    code.includes("internal") ||
    code.includes("cancelled")
  ) {
    return "network";
  }
  if (
    code.includes("permission-denied") ||
    code.includes("invalid-argument") ||
    code.includes("not-found") ||
    code.includes("unauthenticated") ||
    code.includes("failed-precondition")
  ) {
    return "permanent";
  }

  const message = String(err?.message || "").toLowerCase();
  if (
    message.includes("network request failed") ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("offline")
  ) {
    return "network";
  }

  // Unknown failures are treated as retryable. Queued data is never dropped for a
  // reason we don't understand.
  return "network";
}

export { IS_DEV, LOCAL_API };
export type { AnimalSighting };
