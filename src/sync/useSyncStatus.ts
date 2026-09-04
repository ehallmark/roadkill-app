import { useSyncExternalStore } from "react";
import { SyncState, getSyncState, subscribe } from "./syncEngine";

/** Subscribes a component to the sync engine's state. */
export function useSyncStatus(): SyncState {
  return useSyncExternalStore(subscribe, getSyncState, getSyncState);
}
