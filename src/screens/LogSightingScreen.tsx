import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { colors } from "../theme/colors";
import { useLocation } from "../hooks/useLocation";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { addSighting } from "../config/database";

export default function LogSightingScreen() {
  const [animal, setAnimal] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const location = useLocation();
  const speech = useSpeechRecognition();

  // Sync speech transcript into the animal field
  useEffect(() => {
    if (speech.transcript) {
      setAnimal(speech.transcript);
    }
  }, [speech.transcript]);

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const handleSave = async () => {
    console.log("[save] triggered", { animal, lat: location.latitude, lng: location.longitude, loading: location.loading, error: location.error });
    if (!animal.trim()) {
      Alert.alert("Missing Animal", "Please enter or say the animal name.");
      return;
    }

    // Use 0,0 as fallback if location isn't available (e.g. web/emulator)
    const lat = location.latitude ?? 0;
    const lng = location.longitude ?? 0;

    setSaving(true);
    try {
      console.log("[save] calling addSighting...");
      await addSighting({
        animal: animal.trim(),
        latitude: lat,
        longitude: lng,
        address: location.address || undefined,
        timestamp: new Date(),
        notes: notes.trim() || undefined,
      });
      const savedName = animal.trim();
      setLastSaved(savedName);
      setAnimal("");
      setNotes("");
      speech.clearTranscript();
      console.log("[save] success:", savedName);
      Alert.alert("Saved!", `"${savedName}" logged successfully.`);
    } catch (err: any) {
      console.error("[save] error:", err);
      Alert.alert("Error", err.message || "Failed to save sighting.");
    } finally {
      setSaving(false);
    }
  };

  const handleMicPress = () => {
    if (speech.isListening) {
      speech.stopListening();
    } else {
      speech.startListening();
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>🦌 Log Sighting</Text>
          <Text style={styles.subtitle}>Tap the mic or type below</Text>
        </View>

        {/* Date & Time Card */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>DATE & TIME</Text>
          <Text style={styles.cardValue}>{dateStr}</Text>
          <Text style={styles.cardValueSmall}>{timeStr}</Text>
        </View>

        {/* Location Card */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>LOCATION</Text>
          {location.loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingText}>Getting GPS fix...</Text>
            </View>
          ) : location.error ? (
            <View>
              <Text style={styles.errorText}>{location.error}</Text>
              <TouchableOpacity onPress={location.refresh}>
                <Text style={styles.retryText}>Tap to retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              {location.address && (
                <Text style={styles.cardValue}>{location.address}</Text>
              )}
              <Text style={styles.coordText}>
                {location.latitude?.toFixed(5)}, {location.longitude?.toFixed(5)}
              </Text>
            </View>
          )}
        </View>

        {/* Animal Input */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>ANIMAL</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="e.g. Deer, Raccoon, Hawk..."
              placeholderTextColor={colors.textMuted}
              value={animal}
              onChangeText={setAnimal}
              autoCapitalize="words"
              returnKeyType="done"
            />
            <TouchableOpacity
              style={[
                styles.micButton,
                speech.isListening && styles.micButtonActive,
              ]}
              onPress={handleMicPress}
              activeOpacity={0.7}
            >
              <Text style={styles.micIcon}>
                {speech.isListening ? "⏹" : "🎤"}
              </Text>
            </TouchableOpacity>
          </View>
          {speech.isListening && (
            <Text style={styles.listeningText}>Listening...</Text>
          )}
          {speech.error && (
            <Text style={styles.errorText}>Voice error: {speech.error}</Text>
          )}
        </View>

        {/* Notes Input */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>NOTES (optional)</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            placeholder="Any additional details..."
            placeholderTextColor={colors.textMuted}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.saveButtonText}>Save Sighting</Text>
          )}
        </TouchableOpacity>

        {lastSaved && (
          <Text style={styles.lastSavedText}>
            Last saved: {lastSaved}
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.text,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
    letterSpacing: 1,
    marginBottom: 8,
  },
  cardValue: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
  },
  cardValueSmall: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  coordText: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginTop: 4,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
  },
  retryText: {
    color: colors.primary,
    fontSize: 14,
    marginTop: 4,
    fontWeight: "600",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  notesInput: {
    minHeight: 80,
  },
  micButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.primary,
  },
  micButtonActive: {
    backgroundColor: colors.recording,
    borderColor: colors.recording,
  },
  micIcon: {
    fontSize: 24,
  },
  listeningText: {
    color: colors.recording,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 8,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    padding: 18,
    alignItems: "center",
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "700",
  },
  lastSavedText: {
    color: colors.success,
    textAlign: "center",
    marginTop: 12,
    fontSize: 14,
  },
});
