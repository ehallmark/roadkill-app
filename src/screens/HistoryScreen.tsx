import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { colors } from "../theme/colors";
import { AnimalSighting, getSightings, deleteSighting } from "../config/database";

export default function HistoryScreen() {
  const [sightings, setSightings] = useState<AnimalSighting[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSightings = useCallback(async () => {
    try {
      setError(null);
      const data = await getSightings();
      setSightings(data);
    } catch (err: any) {
      setError(err.message || "Failed to load sightings");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchSightings();
    }, [fetchSightings])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchSightings();
  };

  const handleDelete = (sighting: AnimalSighting) => {
    Alert.alert(
      "Delete Sighting",
      `Remove "${sighting.animal}" from your log?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (sighting.id) {
              try {
                await deleteSighting(sighting.id);
                setSightings((prev) => prev.filter((s) => s.id !== sighting.id));
              } catch (err: any) {
                Alert.alert("Error", "Failed to delete sighting.");
              }
            }
          },
        },
      ]
    );
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const renderItem = ({ item }: { item: AnimalSighting }) => (
    <TouchableOpacity
      style={styles.card}
      onLongPress={() => handleDelete(item)}
      activeOpacity={0.8}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.animalName}>{item.animal}</Text>
        <View style={styles.dateBadge}>
          <Text style={styles.dateText}>{formatDate(item.timestamp)}</Text>
        </View>
      </View>

      <View style={styles.detailRow}>
        <Text style={styles.detailIcon}>🕐</Text>
        <Text style={styles.detailText}>{formatTime(item.timestamp)}</Text>
      </View>

      <View style={styles.detailRow}>
        <Text style={styles.detailIcon}>📍</Text>
        <Text style={styles.detailText}>
          {item.address || `${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`}
        </Text>
      </View>

      {item.address && (
        <View style={styles.detailRow}>
          <Text style={styles.detailIcon}>🌐</Text>
          <Text style={styles.coordDetailText}>
            {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
          </Text>
        </View>
      )}

      {item.notes && (
        <View style={styles.detailRow}>
          <Text style={styles.detailIcon}>📝</Text>
          <Text style={styles.detailText}>{item.notes}</Text>
        </View>
      )}

      <Text style={styles.deleteHint}>Long press to delete</Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading sightings...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorEmoji}>⚠️</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchSightings}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>📋 Sighting History</Text>
        <Text style={styles.subtitle}>
          {sightings.length} sighting{sightings.length !== 1 ? "s" : ""} logged
        </Text>
      </View>

      {sightings.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🦌</Text>
          <Text style={styles.emptyTitle}>No sightings yet</Text>
          <Text style={styles.emptySubtitle}>
            Go to the Log tab to record your first animal sighting!
          </Text>
        </View>
      ) : (
        <FlatList
          data={sightings}
          keyExtractor={(item) => item.id || Math.random().toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  listContent: {
    padding: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  animalName: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
    flex: 1,
  },
  dateBadge: {
    backgroundColor: colors.primaryDark,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dateText: {
    color: colors.primaryLight,
    fontSize: 12,
    fontWeight: "600",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 6,
    gap: 8,
  },
  detailIcon: {
    fontSize: 14,
    marginTop: 1,
  },
  detailText: {
    fontSize: 14,
    color: colors.textSecondary,
    flex: 1,
  },
  coordDetailText: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: "monospace",
    flex: 1,
  },
  deleteHint: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: "right",
    marginTop: 8,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  loadingText: {
    color: colors.textSecondary,
    marginTop: 12,
    fontSize: 16,
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  errorText: {
    color: colors.danger,
    fontSize: 16,
    textAlign: "center",
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryButtonText: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 16,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
});
