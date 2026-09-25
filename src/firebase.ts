import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Critical constraint: Validate connection to Firestore on boot gracefully
export async function testConnection() {
  try {
    await Promise.race([
      getDocFromServer(doc(db, 'test', 'connection')),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore connection timeout')), 3000))
    ]);
  } catch (error) {
    // Graceful offline fallback / notice
    console.debug('Firestore running in offline or sandbox mode.');
  }
}
testConnection();
