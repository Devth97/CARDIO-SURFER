import { useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { auth } from './config';

export interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<User>;
  signOut: () => Promise<void>;
}

async function signInNative(): Promise<User> {
  // Reverted to the default Credential Manager path (useCredentialManager:
  // true). The earlier NoCredentialException that motivated falling back to
  // the deprecated legacy GoogleSignInClient flow is commonly caused by
  // stale/corrupted Google Play Services data — which has since been
  // cleared on test devices while chasing an unrelated DEVELOPER_ERROR(10)
  // from the legacy path. Google Play services docs confirm the legacy API
  // is deprecated and being removed, and may not reliably support newly
  // created (2026) OAuth clients — worth testing Credential Manager again
  // now that the original blocker may no longer reproduce.
  const result = await FirebaseAuthentication.signInWithGoogle();
  const idToken = result.credential?.idToken;
  if (!idToken) throw new Error('Native Google Sign-In did not return an ID token');
  const credential = GoogleAuthProvider.credential(idToken);
  const userCredential = await signInWithCredential(auth, credential);
  return userCredential.user;
}

async function signInWeb(): Promise<User> {
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  return result.user;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async (): Promise<User> => {
    return Capacitor.isNativePlatform() ? signInNative() : signInWeb();
  };

  const signOut = async (): Promise<void> => {
    if (Capacitor.isNativePlatform()) {
      await FirebaseAuthentication.signOut().catch((err) => {
        console.error('Native sign-out failed, still clearing local session:', err);
      });
    }
    await firebaseSignOut(auth);
  };

  return { user, loading, signIn, signOut };
}
