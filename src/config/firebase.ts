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

// TODO: Replace with your own Firebase config from https://console.firebase.google.com
// 1. Create a new Firebase project
// 2. Add a Web app to the project
// 3. Copy the firebaseConfig object here
// 4. Enable Cloud Firestore in the Firebase console
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
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
