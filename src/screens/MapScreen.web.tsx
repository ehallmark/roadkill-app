import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { colors } from "../theme/colors";
import { AnimalSighting, getSightings } from "../config/database";

const DEFAULT_CENTER = { latitude: 39.8283, longitude: -98.5795 };
const DEFAULT_ZOOM = 4;

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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🗺️ Sighting Map</Text>
        <Text style={styles.subtitle}>
          {validSightings.length} sighting
          {validSightings.length !== 1 ? "s" : ""} on map
        </Text>
      </View>
      <LeafletMap sightings={validSightings} center={center} />
    </View>
  );
}

function LeafletMap({
  sightings,
  center,
}: {
  sightings: AnimalSighting[];
  center: { latitude: number; longitude: number };
}) {
  const mapRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  const initMap = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || mapRef.current) return;

      // Load Leaflet CSS
      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      const loadLeaflet = () => {
        if ((window as any).L) {
          createMap((window as any).L, node);
          return;
        }
        const script = document.createElement("script");
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.onload = () => createMap((window as any).L, node);
        document.head.appendChild(script);
      };

      const createMap = (L: any, container: HTMLDivElement) => {
        const map = L.map(container).setView(
          [center.latitude, center.longitude],
          sightings.length > 0 ? 5 : DEFAULT_ZOOM
        );

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map);

        const markers: any[] = [];
        sightings.forEach((s) => {
          const markerColor = s.status === "dead" ? "#dc2626" : "#16a34a";
          const fillColor = s.status === "dead" ? "#fca5a5" : "#86efac";
          const marker = L.circleMarker([s.latitude, s.longitude], {
            radius: 10,
            color: markerColor,
            fillColor: fillColor,
            fillOpacity: 0.8,
            weight: 2,
          }).addTo(map);
          const dateStr = s.timestamp.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
          const timeStr = s.timestamp.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          });
          const statusLabel = s.status === "dead" ? "💀 ROADKILL" : "🦌 LIVE";
          const statusColor = s.status === "dead" ? "#dc2626" : "#16a34a";
          marker.bindPopup(
            `<div style="font-family:sans-serif;">` +
              `<strong style="font-size:16px;">${s.animal}</strong> ` +
              `<span style="background:${statusColor};color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;">${statusLabel}</span><br/>` +
              `<span style="color:#666;">📍 ${s.address || `${s.latitude.toFixed(4)}, ${s.longitude.toFixed(4)}`}</span><br/>` +
              `<span style="color:#666;">🕐 ${dateStr} ${timeStr}</span>` +
              (s.notes ? `<br/><span style="color:#888;">📝 ${s.notes}</span>` : "") +
              `</div>`
          );
          markers.push(marker);
        });

        if (markers.length > 0) {
          const group = L.featureGroup(markers);
          map.fitBounds(group.getBounds().pad(0.2));
        }

        mapRef.current = map;
        setReady(true);
      };

      loadLeaflet();
    },
    [sightings, center]
  );

  return (
    <View style={styles.mapContainer}>
      {!ready && (
        <View style={styles.mapLoading}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingText}>Loading map...</Text>
        </View>
      )}
      <div
        ref={initMap}
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 12,
          overflow: "hidden",
        }}
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
  mapContainer: {
    flex: 1,
    margin: 16,
    marginTop: 4,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  mapLoading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    backgroundColor: colors.surface,
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
