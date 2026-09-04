import { useState, useEffect, useCallback } from "react";
import { Platform } from "react-native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { K_VOICE_MODEL, getFlag, setFlag } from "../storage/localStore";
import { getSyncState } from "../sync/syncEngine";

const OFFLINE_LOCALE = "en-US";
// Google's on-device recognizer. Only this package reports installed offline models.
const ON_DEVICE_SERVICE = "com.google.android.as";

/**
 * Makes sure the offline speech model is present, so the mic still works in the same
 * dead zones the sync queue exists for. The model is downloaded by Google's Speech
 * Services onto the device (~30-50MB); it is not bundled in the APK.
 *
 * Runs at most once per outcome, and only while there is a connection to download
 * over — this is useless to attempt once you're already out of range.
 */
async function ensureOfflineModel(): Promise<void> {
  if (Platform.OS !== "android") return;
  if (!getSyncState().online) return;
  if (await getFlag(K_VOICE_MODEL)) return;

  try {
    const { installedLocales } = await ExpoSpeechRecognitionModule.getSupportedLocales({
      androidRecognitionServicePackage: ON_DEVICE_SERVICE,
    });

    // Android 12 and below returns an empty array and has no offline download path.
    if (installedLocales.length === 0) {
      await setFlag(K_VOICE_MODEL, "unsupported");
      return;
    }

    if (installedLocales.includes(OFFLINE_LOCALE)) {
      await setFlag(K_VOICE_MODEL, "installed");
      return;
    }

    const { status } = await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({
      locale: OFFLINE_LOCALE,
    });
    console.log(`[voice] offline model download: ${status}`);
    // "opened_dialog" (Android 13) means the user still has to confirm, so don't
    // record it as settled — check again next launch.
    if (status === "download_success") {
      await setFlag(K_VOICE_MODEL, "installed");
    }
  } catch (err: any) {
    console.warn(`[voice] offline model unavailable: ${err.message}`);
    await setFlag(K_VOICE_MODEL, "unsupported");
  }
}

export function useSpeechRecognition() {
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useSpeechRecognitionEvent("start", () => {
    setIsListening(true);
    setError(null);
  });

  useSpeechRecognitionEvent("end", () => {
    setIsListening(false);
  });

  useSpeechRecognitionEvent("result", (event) => {
    if (event.results && event.results.length > 0) {
      const result = event.results[event.results.length - 1];
      if (result) {
        setTranscript(result.transcript);
      }
    }
  });

  useSpeechRecognitionEvent("error", (event) => {
    const offline = !getSyncState().online;
    if (
      offline &&
      (event.error === "service-not-allowed" ||
        event.error === "language-not-supported" ||
        event.error === "network")
    ) {
      setError("Offline voice unavailable on this device — type the name instead");
    } else {
      setError(event.error);
    }
    setIsListening(false);
  });

  // Pre-fetch the offline model while a connection is still available.
  useEffect(() => {
    ensureOfflineModel();
  }, []);

  const startListening = useCallback(async () => {
    try {
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!result.granted) {
        setError("Microphone permission denied");
        return;
      }

      setTranscript("");
      // Cloud recognition is more accurate, so it stays the default; the on-device
      // model is the fallback for when there's no connection to reach it over.
      const offline = !getSyncState().online;
      ExpoSpeechRecognitionModule.start({
        lang: OFFLINE_LOCALE,
        interimResults: true,
        maxAlternatives: 1,
        requiresOnDeviceRecognition: offline,
      });
    } catch (err: any) {
      setError(err.message || "Failed to start speech recognition");
    }
  }, []);

  const stopListening = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript("");
  }, []);

  return {
    transcript,
    isListening,
    error,
    startListening,
    stopListening,
    clearTranscript,
    setTranscript,
  };
}
