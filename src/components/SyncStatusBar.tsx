import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { colors } from "../theme/colors";
import { useSyncStatus } from "../sync/useSyncStatus";
import { syncNow } from "../sync/syncEngine";
import { readOutbox } from "../storage/localStore";

/**
 * Floating sync indicator, rendered once in App.tsx above the tab bar so every
 * screen gets it without per-screen wiring. Invisible whenever everything is synced.
 */
export default function SyncStatusBar() {
  const { online, syncing, pending, failed, lastError } = useSyncStatus();
  const [justSynced, setJustSynced] = useState(false);
  const hadWork = useRef(false);

  // Briefly confirm success, so a sync that completes while you're watching doesn't
  // just silently vanish.
  useEffect(() => {
    const working = pending > 0 || failed > 0 || syncing;
    if (working) {
      hadWork.current = true;
      setJustSynced(false);
      return;
    }
    if (!hadWork.current) return;
    hadWork.current = false;
    setJustSynced(true);
    const timer = setTimeout(() => setJustSynced(false), 2000);
    return () => clearTimeout(timer);
  }, [pending, failed, syncing]);

  const handlePress = () => {
    syncNow().catch(() => {});
  };

  const handleLongPress = async () => {
    if (failed === 0) return;
    const outbox = await readOutbox();
    const names = outbox
      .filter((e) => e.status === "failed")
      .map((e) => e.payload?.animal ?? `delete ${e.targetId}`)
      .join(", ");
    Alert.alert(
      "Not synced yet",
      `${names || "Queued changes"}\n\n${lastError || "Unknown error"}\n\n` +
        `These are saved on this device and will keep retrying.`
    );
  };

  if (pending === 0 && failed === 0 && !syncing) {
    if (justSynced) {
      return (
        <View style={[styles.bar, styles.barSynced]} pointerEvents="none">
          <Text style={styles.text}>✓ Synced</Text>
        </View>
      );
    }
    return null;
  }

  let style = styles.barOffline;
  let label = `📴 Offline · ${pending + failed} queued`;

  if (failed > 0) {
    style = styles.barFailed;
    label = `⚠️ ${failed} not synced · tap to retry`;
  } else if (syncing) {
    style = styles.barSyncing;
    label = `Syncing ${pending}…`;
  } else if (online) {
    style = styles.barSyncing;
    label = `${pending} waiting to sync`;
  }

  return (
    <TouchableOpacity
      style={[styles.bar, style]}
      onPress={handlePress}
      onLongPress={handleLongPress}
      activeOpacity={0.8}
    >
      {syncing && (
        <ActivityIndicator
          size="small"
          color={colors.primaryLight}
          style={styles.spinner}
        />
      )}
      <Text style={styles.text} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 12,
    right: 12,
    // The tab bar is 120px tall but reserves 60px of empty padding below its
    // labels. Sitting in that dead space keeps this clear of both the tab icons
    // and the Log screen's sticky Save/Clear footer.
    bottom: 14,
    zIndex: 200,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  barOffline: {
    backgroundColor: colors.surfaceLight,
    borderColor: colors.border,
  },
  barSyncing: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primary,
  },
  barFailed: {
    backgroundColor: "#991b1b",
    borderColor: "#f87171",
  },
  barSynced: {
    backgroundColor: "#166534",
    borderColor: colors.success,
  },
  spinner: {
    transform: [{ scale: 0.8 }],
  },
  text: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "600",
  },
});
