import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

// Firebase configuration interface
interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

// Firebase configuration - Your actual Firebase config
const firebaseConfig: FirebaseConfig = {
  apiKey: "AIzaSyDQaB0pa-264W5TrjykZ9nbWSvWOh9-smY",
  authDomain: "ikamba-1c669.firebaseapp.com",
  projectId: "ikamba-1c669",
  storageBucket: "ikamba-1c669.appspot.com",
  messagingSenderId: "292805645688",
  appId: "1:292805645688:web:38d0f17d55c36f6255648d",
};

// Initialize Firebase
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let isFirebaseConfigured = false;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  isFirebaseConfigured = true;
  console.log('✓ Firebase initialized successfully');
} catch (error) {
  console.error('Firebase initialization error:', error);
  isFirebaseConfigured = false;
}

export { app, auth, db, isFirebaseConfigured };
