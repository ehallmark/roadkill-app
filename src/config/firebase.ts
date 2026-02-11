import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  deleteDoc,
  doc,
  Timestamp,
} from "firebase/firestore";

// Firebase config is loaded from environment variables.
// For local dev: create a .env.local file (see README).
// For CI/CD: set these as GitHub secrets.
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "YOUR_API_KEY",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "YOUR_PROJECT.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "YOUR_PROJECT.appspot.com",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "YOUR_SENDER_ID",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "YOUR_APP_ID",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export interface AnimalSighting {
  id?: string;
  animal: string;
  latitude: number;
  longitude: number;
  address?: string;
  timestamp: Date;
  notes?: string;
}

const COLLECTION_NAME = "sightings";

export async function addSighting(
  sighting: Omit<AnimalSighting, "id">
): Promise<string> {
  const docRef = await addDoc(collection(db, COLLECTION_NAME), {
    ...sighting,
    timestamp: Timestamp.fromDate(sighting.timestamp),
  });
  return docRef.id;
}

export async function getSightings(): Promise<AnimalSighting[]> {
  const q = query(
    collection(db, COLLECTION_NAME),
    orderBy("timestamp", "desc")
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      animal: data.animal,
      latitude: data.latitude,
      longitude: data.longitude,
      address: data.address,
      timestamp: data.timestamp.toDate(),
      notes: data.notes,
    };
  });
}

export async function deleteSighting(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION_NAME, id));
}

export { db };
