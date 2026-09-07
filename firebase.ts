import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "jobcrafting-bbf83.firebaseapp.com",
  projectId: "jobcrafting-bbf83",
  storageBucket: "jobcrafting-bbf83.firebasestorage.app",
  messagingSenderId: "938524165129",
  appId: "1:938524165129:web:7c1a97805eac9b1c0a64d8",
  measurementId: "G-2042B8X2NV"
};

// Initialize Firebase only if not already initialized
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Analytics only initializes in browser environments
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
