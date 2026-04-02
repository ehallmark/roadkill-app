import { useState, useEffect } from "react";
import * as Location from "expo-location";

interface LocationState {
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  error: string | null;
  loading: boolean;
  lastUpdated: Date | null;
}

export function useLocation() {
  const [location, setLocation] = useState<LocationState>({
    latitude: null,
    longitude: null,
    address: null,
    error: null,
    loading: true,
    lastUpdated: null,
  });

  const fetchLocation = async () => {
    setLocation((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocation((prev) => ({
          ...prev,
          loading: false,
          error: "Location permission denied",
        }));
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      let address: string | null = null;
      try {
        const [geo] = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        if (geo) {
          const parts = [geo.city, geo.region, geo.country].filter(Boolean);
          address = parts.join(", ");
        }
      } catch {
        // Reverse geocoding may fail, that's okay
      }

      setLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        address,
        error: null,
        loading: false,
        lastUpdated: new Date(),
      });
    } catch (err: any) {
      setLocation((prev) => ({
        ...prev,
        loading: false,
        error: err.message || "Failed to get location",
      }));
    }
  };

  useEffect(() => {
    fetchLocation();
  }, []);

  return { ...location, refresh: fetchLocation };
}
