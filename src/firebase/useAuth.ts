import { useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { auth } from './config';

export interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<User>;
  signOut: () => Promise<void>;
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
    const result = await signInWithPopup(auth, new GoogleAuthProvider());
    return result.user;
  };

  const signOut = async (): Promise<void> => {
    await firebaseSignOut(auth);
  };

  return { user, loading, signIn, signOut };
}
