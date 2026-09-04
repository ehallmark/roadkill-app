# 🦌 Roadkill Tracker

A React Native (Expo) Android app for logging animal sightings as you drive across the country. Features voice input, GPS geolocation, and cloud storage via Firebase.

## Features

- **Voice Input** — Tap the mic and say the animal name hands-free
- **GPS Geolocation** — Automatically tags each sighting with coordinates and reverse-geocoded address
- **Date & Time** — Every sighting is timestamped
- **Cloud Storage** — All data stored in Firebase Cloud Firestore
- **Works Offline** — Sightings save to the device instantly and sync themselves once you're back in range
- **Sighting History** — Browse, pull-to-refresh, and delete past sightings

## Setup

### 1. Prerequisites

- Node.js 18+
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- An Android phone with [Expo Go](https://play.google.com/store/apps/details?id=host.exp.exponent) installed, **or** Android Studio for emulator
- A [Firebase](https://console.firebase.google.com/) account

### 2. Firebase Configuration

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **Add project** and follow the wizard
3. In your project, go to **Build → Firestore Database** and click **Create database**
   - Choose **Start in test mode** for development
   - Pick a region close to you
4. Go to **Project Settings → General → Your apps** and click the **Web** (`</>`) icon
5. Register the app and copy the `firebaseConfig` object
6. Open `src/config/firebase.ts` and replace the placeholder config:

```typescript
const firebaseConfig = {
  apiKey: "YOUR_ACTUAL_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef",
};
```

### 3. Install & Run

```bash
npm install
npx expo start
```

Then scan the QR code with Expo Go on your Android phone, or press `a` to open in Android emulator.

> **Note:** Voice recognition and GPS require a physical device for best results. Emulators may have limited support.

### 4. Development Build (for full native features)

Speech recognition requires a development build (not Expo Go):

```bash
npx expo prebuild
npx expo run:android
```

## Project Structure

```
roadkill-app/
├── App.tsx                          # Root with tab navigation
├── src/
│   ├── components/
│   │   └── SyncStatusBar.tsx        # Offline / pending sync indicator
│   ├── config/
│   │   ├── firebase.ts              # Firebase init + Firestore CRUD
│   │   ├── remote.ts                # Backend transport + request timeouts
│   │   └── database.ts              # Offline-first data facade (used by screens)
│   ├── storage/
│   │   └── localStore.ts            # On-device cache + unsynced outbox
│   ├── sync/
│   │   ├── syncEngine.ts            # Background sync loop
│   │   └── useSyncStatus.ts         # Sync state hook
│   ├── hooks/
│   │   ├── useLocation.ts           # GPS + reverse geocoding hook
│   │   └── useSpeechRecognition.ts  # Voice input hook
│   ├── screens/
│   │   ├── LogSightingScreen.tsx    # Main logging screen
│   │   ├── MapScreen.*.tsx          # Leaflet map (native WebView / web iframe)
│   │   └── HistoryScreen.tsx        # Sighting history list
│   └── theme/
│       └── colors.ts                # App color palette
├── app.json                         # Expo config with permissions
└── package.json
```

## Offline Mode

Saving never waits on the network. Every sighting is written to device storage and
returns immediately, then a background sync engine uploads it whenever a connection is
available — so logging works normally through a dead zone and nothing is lost.

- A status pill above the tab bar shows `📴 Offline · N queued` while anything is
  waiting. Tap it to force a sync attempt; long-press for the error detail.
- Unsynced sightings appear in History right away with a `⏳ PENDING` badge, and on the
  Map as dashed markers. History and the Map read from a local cache, so they keep
  working with no signal.
- Queued sightings survive force-quitting the app. Nothing is ever discarded: a record
  that keeps failing to upload is marked `⚠️ NOT SYNCED` and retried with backoff
  rather than dropped.
- Deleting works offline too — the delete is queued and applied on the next sync.
- Firestore writes use a client-generated document id, so a retried upload can never
  create a duplicate.
- The Map tab needs a connection for its tiles, so it shows a placeholder offline;
  your sightings are still stored and appear once you reconnect.
- Voice input falls back to Android's on-device recognizer when there's no connection.
  The English model (~30–50 MB, stored by Google's Speech Services, not in the APK) is
  fetched once on a connected launch — so open the app while you still have signal
  before a long trip.

## Tech Stack

- **React Native** with **Expo SDK 54**
- **TypeScript**
- **AsyncStorage** for the offline cache and sync queue
- **expo-network** for connectivity detection
- **Firebase Cloud Firestore** for cloud database
- **expo-location** for GPS
- **expo-speech-recognition** for voice input
- **React Navigation** (bottom tabs)
