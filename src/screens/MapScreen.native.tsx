import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { WebView } from "react-native-webview";
import { useFocusEffect } from "@react-navigation/native";
import { colors } from "../theme/colors";
import { AnimalSighting, getSightings } from "../config/database";

const DEFAULT_CENTER = { latitude: 39.8283, longitude: -98.5795 };

export default function MapScreen() {
  const [sightings, setSightings] = useState<AnimalSighting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      getSightings()
        .then((data) => {
          setSightings(data);
          setError(null);
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }, [])
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading map...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>⚠️ {error}</Text>
      </View>
    );
  }

  const validSightings = sightings.filter(
    (s) => s.latitude !== 0 || s.longitude !== 0
  );

  const center =
    validSightings.length > 0
      ? {
          latitude:
            validSightings.reduce((sum, s) => sum + s.latitude, 0) /
            validSightings.length,
          longitude:
            validSightings.reduce((sum, s) => sum + s.longitude, 0) /
            validSightings.length,
        }
      : DEFAULT_CENTER;

  const markersJs = validSightings
    .map((s) => {
      const label = (s.animal || "").replace(/'/g, "\\'");
      const desc = (s.address || `${(s.latitude ?? 0).toFixed(4)}, ${(s.longitude ?? 0).toFixed(4)}`).replace(/'/g, "\\'");
      const dateStr = s.timestamp ? new Date(s.timestamp).toLocaleDateString() : "";
      return `L.marker([${s.latitude ?? 0}, ${s.longitude ?? 0}]).addTo(map).bindPopup('<b>${label}</b><br/>${desc}<br/>${dateStr}');`;
    })
    .join("\n");

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body { margin: 0; padding: 0; }
        #map { width: 100%; height: 100vh; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map').setView([${center.latitude}, ${center.longitude}], ${validSightings.length > 0 ? 5 : 4});
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap'
        }).addTo(map);
        ${markersJs}
      </script>
    </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🗺️ Sighting Map</Text>
        <Text style={styles.subtitle}>
          {validSightings.length} sighting
          {validSightings.length !== 1 ? "s" : ""} on map
        </Text>
      </View>
      <WebView
        style={styles.map}
        originWhitelist={["*"]}
        source={{ html }}
        javaScriptEnabled
      />
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
    paddingBottom: 12,
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
  map: {
    flex: 1,
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
  errorText: {
    color: colors.danger,
    fontSize: 16,
    textAlign: "center",
  },
});
