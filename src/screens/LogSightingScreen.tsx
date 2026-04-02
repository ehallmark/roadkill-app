import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { colors } from "../theme/colors";
import { useLocation } from "../hooks/useLocation";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { addSighting } from "../config/database";

type ActiveField = "roadkill" | "live" | "notes" | null;

export default function LogSightingScreen() {
  const [roadkillAnimal, setRoadkillAnimal] = useState("");
  const [liveAnimal, setLiveAnimal] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeField, setActiveField] = useState<ActiveField>(null);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const location = useLocation();
  const speech = useSpeechRecognition();

  // Refresh location on focus and every 60 seconds while on screen
  useFocusEffect(
    useCallback(() => {
      location.refresh();
      const interval = setInterval(() => {
        location.refresh();
      }, 60 * 1000);
      return () => clearInterval(interval);
    }, [])
  );

  // Route speech transcript to the active field
  useEffect(() => {
    if (speech.transcript && activeField) {
      switch (activeField) {
        case "roadkill":
          setRoadkillAnimal(speech.transcript);
          break;
        case "live":
          setLiveAnimal(speech.transcript);
          break;
        case "notes":
          setNotes(speech.transcript);
          break;
      }
    }
  }, [speech.transcript, activeField]);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    toastOpacity.setValue(1);
    Animated.timing(toastOpacity, {
      toValue: 0,
      duration: 500,
      delay: 2500,
      useNativeDriver: true,
    }).start(() => setToast(null));
  };

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const handleMicPress = (field: ActiveField) => {
    if (speech.isListening && activeField === field) {
      speech.stopListening();
      setActiveField(null);
    } else {
      if (speech.isListening) {
        speech.stopListening();
      }
      setActiveField(field);
      speech.clearTranscript();
      speech.startListening();
    }
  };

  const handleSave = async (status: "dead" | "live") => {
    const animal = status === "dead" ? roadkillAnimal : liveAnimal;
    if (!animal.trim()) {
      showToast(`Enter an animal name in the ${status === "dead" ? "Roadkill" : "Live"} field`, "error");
      return;
    }

    const lat = location.latitude ?? 0;
    const lng = location.longitude ?? 0;

    setSaving(true);
    try {
      await addSighting({
        animal: animal.trim(),
        status,
        latitude: lat,
        longitude: lng,
        address: location.address || null,
        timestamp: new Date(),
        notes: notes.trim() || null,
      });
      showToast(`"${animal.trim()}" saved!`, "success");
      if (status === "dead") setRoadkillAnimal("");
      else setLiveAnimal("");
      setNotes("");
      speech.clearTranscript();
    } catch (err: any) {
      showToast(err.message || "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setRoadkillAnimal("");
    setLiveAnimal("");
    setNotes("");
    speech.clearTranscript();
    if (speech.isListening) speech.stopListening();
    setActiveField(null);
  };

  const locationLine = location.loading
    ? "Getting GPS fix..."
    : location.error
    ? location.error
    : [
        location.address,
        location.latitude != null
          ? `${location.latitude.toFixed(5)}, ${location.longitude?.toFixed(5)}`
          : null,
      ]
        .filter(Boolean)
        .join(" — ");

  const renderMicButton = (field: ActiveField) => {
    const isActive = speech.isListening && activeField === field;
    return (
      <TouchableOpacity
        style={[styles.micButton, isActive && styles.micButtonActive]}
        onPress={() => handleMicPress(field)}
        activeOpacity={0.7}
      >
        <Text style={styles.micIcon}>{isActive ? "⏹" : "🎤"}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <StatusBar style="light" />

      {/* Toast */}
      {toast && (
        <Animated.View
          style={[
            styles.toast,
            toast.type === "success" ? styles.toastSuccess : styles.toastError,
            { opacity: toastOpacity },
          ]}
        >
          <Text style={styles.toastText}>
            {toast.type === "success" ? "✓ " : "✗ "}
            {toast.message}
          </Text>
        </Animated.View>
      )}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header: Date/Time/Location */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Text style={styles.headerDate}>{dateStr}</Text>
            <Text style={styles.headerTime}>{timeStr}</Text>
          </View>
          <View style={styles.headerLocationRow}>
            <Text style={styles.headerLocation} numberOfLines={1}>
              {locationLine}
            </Text>
            {location.lastUpdated && (
              <Text style={styles.headerUpdated}>
                {location.lastUpdated.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            )}
          </View>
        </View>

        {/* Two-column body */}
        <View style={styles.body}>
          {/* Left column: inputs */}
          <View style={styles.leftColumn}>
            {/* Roadkill input */}
            <View style={styles.fieldCard}>
              <Text style={styles.fieldLabel}>ROADKILL</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  placeholder="Animal name..."
                  placeholderTextColor={colors.textMuted}
                  value={roadkillAnimal}
                  onChangeText={setRoadkillAnimal}
                  autoCapitalize="words"
                  returnKeyType="done"
                />
                {renderMicButton("roadkill")}
              </View>
            </View>

            {/* Live input */}
            <View style={styles.fieldCard}>
              <Text style={styles.fieldLabel}>LIVE</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  placeholder="Animal name..."
                  placeholderTextColor={colors.textMuted}
                  value={liveAnimal}
                  onChangeText={setLiveAnimal}
                  autoCapitalize="words"
                  returnKeyType="done"
                />
                {renderMicButton("live")}
              </View>
            </View>

            {/* Notes input */}
            <View style={styles.fieldCard}>
              <Text style={styles.fieldLabel}>NOTES</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, styles.notesInput]}
                  placeholder="Details..."
                  placeholderTextColor={colors.textMuted}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  textAlignVertical="top"
                />
                {renderMicButton("notes")}
              </View>
            </View>

            {speech.isListening && (
              <Text style={styles.listeningText}>
                Listening ({activeField})...
              </Text>
            )}
            {speech.error && (
              <Text style={styles.errorText}>Voice: {speech.error}</Text>
            )}
          </View>

          {/* Right column: buttons */}
          <View style={styles.rightColumn}>
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.buttonDisabled]}
              onPress={() => {
                // Save whichever field has content; prefer roadkill
                if (roadkillAnimal.trim()) handleSave("dead");
                else if (liveAnimal.trim()) handleSave("live");
                else showToast("Enter an animal name first", "error");
              }}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.buttonText}>Save</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancel}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
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
    padding: 16,
    paddingTop: 50,
    paddingBottom: 40,
  },

  // Toast
  toast: {
    position: "absolute",
    top: 50,
    left: 20,
    right: 20,
    zIndex: 100,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  toastSuccess: {
    backgroundColor: "#166534",
  },
  toastError: {
    backgroundColor: "#991b1b",
  },
  toastText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "600",
  },

  // Header
  header: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  headerDate: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  headerTime: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  headerLocationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerLocation: {
    fontSize: 13,
    color: colors.textMuted,
    flex: 1,
    marginRight: 8,
  },
  headerUpdated: {
    fontSize: 11,
    color: colors.textMuted,
  },

  // Body two-column layout
  body: {
    flexDirection: "row",
    gap: 12,
  },
  leftColumn: {
    flex: 1,
  },
  rightColumn: {
    width: 80,
    justifyContent: "flex-start",
    gap: 12,
  },

  // Field cards
  fieldCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
    letterSpacing: 1,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  notesInput: {
    minHeight: 80,
  },

  // Mic button
  micButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
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
    fontSize: 20,
  },

  // Buttons
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "700",
  },

  // Status text
  listeningText: {
    color: colors.recording,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
    marginTop: 4,
  },
});
