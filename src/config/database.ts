import { Platform } from "react-native";
import Constants from "expo-constants";
import { AnimalSighting, addSighting as firebaseAdd, getSightings as firebaseGet, deleteSighting as firebaseDelete } from "./firebase";

// In dev (Expo Go), use local API. In production, use Firebase.
const IS_DEV = __DEV__;

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

console.log(`[database] mode=${IS_DEV ? "LOCAL" : "FIREBASE"}, api=${LOCAL_API}`);

// ---- Local API client ----

async function localAddSighting(sighting: Omit<AnimalSighting, "id">): Promise<string> {
  console.log(`[database] POST ${LOCAL_API}/sightings`, sighting);
  const res = await fetch(`${LOCAL_API}/sightings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...sighting,
      timestamp: sighting.timestamp.toISOString(),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || "Failed to save sighting");
  }
  const data = await res.json();
  return data.id;
}

async function localGetSightings(): Promise<AnimalSighting[]> {
  const res = await fetch(`${LOCAL_API}/sightings`);
  if (!res.ok) {
    throw new Error("Failed to fetch sightings");
  }
  const data = await res.json();
  return data.map((item: any) => ({
    ...item,
    timestamp: new Date(item.timestamp),
  }));
}

async function localDeleteSighting(id: string): Promise<void> {
  const res = await fetch(`${LOCAL_API}/sightings/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error("Failed to delete sighting");
  }
}

// ---- Exported unified interface ----

export async function addSighting(sighting: Omit<AnimalSighting, "id">): Promise<string> {
  if (IS_DEV) {
    return localAddSighting(sighting);
  }
  return firebaseAdd(sighting);
}

export async function getSightings(): Promise<AnimalSighting[]> {
  if (IS_DEV) {
    return localGetSightings();
  }
  return firebaseGet();
}

export async function deleteSighting(id: string): Promise<void> {
  if (IS_DEV) {
    return localDeleteSighting(id);
  }
  return firebaseDelete(id);
}

export { IS_DEV, LOCAL_API };
export type { AnimalSighting };
