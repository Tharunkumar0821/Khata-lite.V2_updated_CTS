// Multi-device sync, built on Firebase Firestore + anonymous auth.
//
// Model: one "sync code" = one Firestore document holding the ENTIRE
// local db blob (same shape as a backup). The first phone creates a
// code; any other phone enters that code to download the same data and
// stay linked. After that, every local change is pushed up (debounced),
// and remote changes are pulled down automatically in real time.
//
// This is deliberately simple: there's no per-field merging, so if two
// phones edit at the exact same moment, the phone that saves last wins
// for anything conflicting. For one business run from a couple of
// phones, that's a reasonable trade-off for how much simpler it keeps
// everything.
//
// IMPORTANT: fill in firebaseConfig below with your own project's
// config (see README) before this will work.

import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'REPLACE_ME',
  authDomain: 'REPLACE_ME',
  projectId: 'REPLACE_ME',
  storageBucket: 'REPLACE_ME',
  messagingSenderId: 'REPLACE_ME',
  appId: 'REPLACE_ME',
};

let appRef = null;
function getFirebaseApp() {
  if (!getApps().length) appRef = initializeApp(firebaseConfig);
  return appRef || getApps()[0];
}

let signedInPromise = null;
function ensureSignedIn() {
  if (!signedInPromise) {
    const app = getFirebaseApp();
    const auth = getAuth(app);
    signedInPromise = signInAnonymously(auth).catch((e) => {
      signedInPromise = null; // let the next call retry
      throw new Error('Could not connect to sync. Check your internet connection and try again.');
    });
  }
  return signedInPromise;
}

function db() {
  return getFirestore(getFirebaseApp());
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I, easy to read aloud
function genCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

function friendlyError(e) {
  if (e && e.message && /Check your internet/.test(e.message)) return e;
  if (e && e.code === 'unavailable') return new Error('No internet connection. Try again once you\u2019re online.');
  if (e && e.code === 'permission-denied') return new Error('Sync is not set up correctly yet (Firestore rules). See the README.');
  return new Error((e && e.message) || 'Something went wrong. Please try again.');
}

// Creates a brand new sync code holding `data`, and returns the code.
export async function createSyncCode(data) {
  try {
    await ensureSignedIn();
    for (let i = 0; i < 5; i++) {
      const code = genCode();
      const ref = doc(db(), 'khataSync', code);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, { data, updatedAt: Date.now() });
        return code;
      }
    }
    throw new Error('Could not create a sync code right now. Please try again.');
  } catch (e) {
    throw friendlyError(e);
  }
}

// Downloads the data currently stored under `code`.
export async function fetchSyncCode(code) {
  try {
    await ensureSignedIn();
    const ref = doc(db(), 'khataSync', code);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('That code was not found. Check it and try again.');
    return snap.data().data;
  } catch (e) {
    throw friendlyError(e);
  }
}

// Uploads `data` under an existing `code`. Fire-and-forget from the
// caller's point of view; failures are swallowed (offline edits still
// save locally and will sync again once online / on the next change).
export async function pushSyncData(code, data) {
  try {
    await ensureSignedIn();
    await setDoc(doc(db(), 'khataSync', code), { data, updatedAt: Date.now() });
  } catch (e) {
    // Intentionally quiet — local storage already has the data safe.
  }
}

// Subscribes to live changes for `code`. Returns an unsubscribe function.
export function listenSyncCode(code, onData) {
  let unsub = () => {};
  ensureSignedIn()
    .then(() => {
      unsub = onSnapshot(
        doc(db(), 'khataSync', code),
        (snap) => { if (snap.exists()) onData(snap.data().data); },
        () => {} // connection hiccups are silent; local data is unaffected
      );
    })
    .catch(() => {});
  return () => unsub();
}
