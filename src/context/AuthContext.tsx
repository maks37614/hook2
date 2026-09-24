import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserProfile } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import { cleanForFirestore } from '../lib/firestoreUtils';
import { verifyAccessCode, normalizeAccessCode } from '../utils/accessCodes';

function getLocalUserId(email: string): string {
  let hash = 0;
  const clean = email.trim().toLowerCase();
  for (let i = 0; i < clean.length; i++) {
    hash = (hash << 5) - hash + clean.charCodeAt(i);
    hash |= 0;
  }
  const prefix = clean.replace(/[^a-z0-9]/g, '').slice(0, 8);
  return `usr_${prefix}_${Math.abs(hash).toString(36)}`;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, name?: string, inviteCode?: string) => Promise<void>;
  updateProfileData: (updates: Partial<UserProfile>) => Promise<void>;
  logout: () => Promise<void>;
  authError: string | null;
  authErrorCode: string | null;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authErrorCode, setAuthErrorCode] = useState<string | null>(null);

  const clearAuthError = () => {
    setAuthError(null);
    setAuthErrorCode(null);
  };

  // Sync or create user profile in Firestore
  const syncUserProfile = async (firebaseUser: User) => {
    const userDocRef = doc(db, 'users', firebaseUser.uid);
    try {
      const snap = await getDoc(userDocRef);
      if (!snap.exists()) {
        const newProfile: UserProfile = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'Користувач'),
          photoURL: firebaseUser.photoURL || '',
          soundAlertsEnabled: true,
          defaultExchange: 'all',
          defaultMarketType: 'all',
          defaultTimeframe: '1h',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await setDoc(userDocRef, cleanForFirestore(newProfile));
        setProfile(newProfile);
      } else {
        setProfile(snap.data() as UserProfile);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
    }
  };

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    // Check existing local session first
    try {
      const sessionRaw = localStorage.getItem('signalhook_local_session');
      if (sessionRaw) {
        const session = JSON.parse(sessionRaw);
        if (session && session.user) {
          setUser(session.user);
          if (session.profile) {
            setProfile(session.profile);
          }
          setLoading(false);
        }
      }
    } catch {}

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Firebase user takes precedence
        setUser(currentUser);
        try {
          localStorage.removeItem('signalhook_local_session');
        } catch {}

        await syncUserProfile(currentUser);

        // Realtime listener for profile changes
        const userDocRef = doc(db, 'users', currentUser.uid);
        unsubscribeProfile = onSnapshot(
          userDocRef,
          (docSnap) => {
            if (docSnap.exists()) {
              setProfile(docSnap.data() as UserProfile);
            }
          },
          (error) => {
            handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
          }
        );
      } else {
        // If not a Firebase user, check if we have an active local session
        const sessionRaw = localStorage.getItem('signalhook_local_session');
        if (sessionRaw) {
          try {
            const session = JSON.parse(sessionRaw);
            if (session?.user) {
              setUser(session.user);
              setProfile(session.profile || null);
            } else {
              setUser(null);
              setProfile(null);
            }
          } catch {
            setUser(null);
            setProfile(null);
          }
        } else {
          setUser(null);
          setProfile(null);
        }

        if (unsubscribeProfile) {
          unsubscribeProfile();
          unsubscribeProfile = null;
        }
      }
      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  const signInWithGoogle = async () => {
    setAuthError(null);
    setAuthErrorCode(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      if (result.user) {
        await syncUserProfile(result.user);
      }
    } catch (err: any) {
      console.error('Google sign in error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setAuthError('Вхід скасовано (вікно було закрите)');
      } else if (err.code === 'auth/cancelled-popup-request') {
        // silently handled
      } else if (err.code === 'auth/popup-blocked') {
        setAuthError('Браузер заблокував спливаюче вікно. Дозвольте pop-up вікна для цього сайту або відкрийте додаток у новій вкладці.');
      } else {
        setAuthError(err.message || 'Помилка авторизації через Google');
      }
      setAuthErrorCode(err.code || null);
      throw err;
    }
  };

  const signInWithEmail = async (email: string, pass: string) => {
    setAuthError(null);
    setAuthErrorCode(null);
    const cleanEmail = email.trim().toLowerCase();

    try {
      const result = await signInWithEmailAndPassword(auth, cleanEmail, pass);
      if (result.user) {
        try {
          localStorage.removeItem('signalhook_local_session');
        } catch {}
        await syncUserProfile(result.user);
      }
      return;
    } catch (err: any) {
      const isNotAllowed =
        err?.code === 'auth/operation-not-allowed' ||
        err?.code === 'auth/admin-restricted-operation' ||
        (typeof err?.message === 'string' && (
          err.message.includes('operation-not-allowed') ||
          err.message.includes('auth/operation-not-allowed') ||
          err.message.includes('CONFIGURATION_NOT_FOUND')
        ));

      if (isNotAllowed) {
        try {
          const accountsRaw = localStorage.getItem('signalhook_local_accounts');
          const accounts = accountsRaw ? JSON.parse(accountsRaw) : {};
          const account = accounts[cleanEmail];

          if (account) {
            if (account.passHash && account.passHash !== btoa(pass)) {
              setAuthError('Невірний пароль для цього email');
              throw new Error('Невірний пароль');
            }
            const uid = account.uid || getLocalUserId(cleanEmail);
            const localUser: any = {
              uid,
              email: cleanEmail,
              displayName: account.displayName || cleanEmail.split('@')[0],
              photoURL: '',
              isLocalUser: true,
            };
            const savedProfileRaw = localStorage.getItem(`signalhook_profile_${uid}`);
            const localProfile: UserProfile = savedProfileRaw
              ? JSON.parse(savedProfileRaw)
              : {
                  uid,
                  email: cleanEmail,
                  displayName: account.displayName || cleanEmail.split('@')[0],
                  photoURL: '',
                  soundAlertsEnabled: true,
                  defaultExchange: 'all',
                  defaultMarketType: 'all',
                  defaultTimeframe: '1h',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                };

            localStorage.setItem('signalhook_local_session', JSON.stringify({ user: localUser, profile: localProfile }));
            setUser(localUser);
            setProfile(localProfile);
            return;
          } else {
            // Auto-register and sign in locally
            const uid = getLocalUserId(cleanEmail);
            const displayName = cleanEmail.split('@')[0];
            accounts[cleanEmail] = {
              uid,
              email: cleanEmail,
              displayName,
              passHash: btoa(pass),
              createdAt: new Date().toISOString(),
            };
            localStorage.setItem('signalhook_local_accounts', JSON.stringify(accounts));

            const localUser: any = {
              uid,
              email: cleanEmail,
              displayName,
              photoURL: '',
              isLocalUser: true,
            };
            const localProfile: UserProfile = {
              uid,
              email: cleanEmail,
              displayName,
              photoURL: '',
              soundAlertsEnabled: true,
              defaultExchange: 'all',
              defaultMarketType: 'all',
              defaultTimeframe: '1h',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

            localStorage.setItem('signalhook_local_session', JSON.stringify({ user: localUser, profile: localProfile }));
            localStorage.setItem(`signalhook_profile_${uid}`, JSON.stringify(localProfile));
            setUser(localUser);
            setProfile(localProfile);
            return;
          }
        } catch (localErr: any) {
          if (localErr.message === 'Невірний пароль') throw localErr;
        }
      }

      setAuthErrorCode(err.code || null);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        setAuthError('Невірний email або пароль');
      } else if (err.code === 'auth/invalid-email') {
        setAuthError('Некоректний формат email адреси');
      } else if (err.code === 'auth/too-many-requests') {
        setAuthError('Забагато невдалих спроб. Спробуйте пізніше.');
      } else {
        setAuthError(err.message || 'Помилка входу');
      }
      throw err;
    }
  };

  const registerWithEmail = async (email: string, pass: string, name?: string, inviteCode?: string) => {
    setAuthError(null);
    setAuthErrorCode(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      const err = new Error('Введіть адресу електронної пошти');
      setAuthError(err.message);
      throw err;
    }

    if (!pass || pass.length < 6) {
      const err = new Error('Пароль повинен містити не менше 6 символів');
      setAuthError(err.message);
      throw err;
    }

    // Access Code Verification: accepts author codes or defaults gracefully
    const codeToVerify = (inviteCode || '').trim() || 'SIGNALHOOK';
    const verification = await verifyAccessCode(codeToVerify);
    const validInviteCode = verification.valid ? verification.normalizedCode : 'SIGNALHOOK';

    try {
      const result = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
      if (name && name.trim() && result.user) {
        await updateProfile(result.user, { displayName: name.trim() });
      }
      if (result.user) {
        try {
          localStorage.removeItem('signalhook_local_session');
        } catch {}
        const userDocRef = doc(db, 'users', result.user.uid);
        const newProfile: UserProfile = {
          uid: result.user.uid,
          email: result.user.email || '',
          displayName: name?.trim() || cleanEmail.split('@')[0],
          photoURL: '',
          soundAlertsEnabled: true,
          defaultExchange: 'all',
          defaultMarketType: 'all',
          defaultTimeframe: '1h',
          watchlist: [],
          metaScalpSettings: { enabled: true, port: 17845, binding: '001', autoSwitchOnClick: true },
          inviteCode: validInviteCode,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await setDoc(userDocRef, cleanForFirestore(newProfile));
        setProfile(newProfile);
      }
    } catch (err: any) {
      const isNotAllowed =
        err?.code === 'auth/operation-not-allowed' ||
        err?.code === 'auth/admin-restricted-operation' ||
        (typeof err?.message === 'string' && (
          err.message.includes('operation-not-allowed') ||
          err.message.includes('auth/operation-not-allowed') ||
          err.message.includes('CONFIGURATION_NOT_FOUND')
        ));

      if (isNotAllowed) {
        const uid = getLocalUserId(cleanEmail);
        const displayName = name?.trim() || cleanEmail.split('@')[0];

        try {
          const accountsRaw = localStorage.getItem('signalhook_local_accounts');
          const accounts = accountsRaw ? JSON.parse(accountsRaw) : {};
          accounts[cleanEmail] = {
            uid,
            email: cleanEmail,
            displayName,
            passHash: btoa(pass),
            inviteCode: validInviteCode,
            createdAt: new Date().toISOString(),
          };
          localStorage.setItem('signalhook_local_accounts', JSON.stringify(accounts));
        } catch {}

        const localUser: any = {
          uid,
          email: cleanEmail,
          displayName,
          photoURL: '',
          isLocalUser: true,
        };

        const localProfile: UserProfile = {
          uid,
          email: cleanEmail,
          displayName,
          photoURL: '',
          soundAlertsEnabled: true,
          defaultExchange: 'all',
          defaultMarketType: 'all',
          defaultTimeframe: '1h',
          watchlist: [],
          metaScalpSettings: { enabled: true, port: 17845, binding: '001', autoSwitchOnClick: true },
          inviteCode: validInviteCode,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        try {
          localStorage.setItem('signalhook_local_session', JSON.stringify({ user: localUser, profile: localProfile }));
          localStorage.setItem(`signalhook_profile_${uid}`, JSON.stringify(localProfile));
        } catch {}

        setUser(localUser);
        setProfile(localProfile);
        return;
      }

      console.error('Email registration error:', err);
      setAuthErrorCode(err.code || null);
      if (err.code === 'auth/email-already-in-use') {
        setAuthError('Користувач з таким email вже зареєстрований. Увійдіть у свій профіль.');
      } else if (err.code === 'auth/weak-password') {
        setAuthError('Пароль занадто простий (мінімум 6 символів)');
      } else if (err.code === 'auth/invalid-email') {
        setAuthError('Некоректний формат email адреси');
      } else {
        setAuthError(err.message || 'Помилка реєстрації');
      }
      throw err;
    }
  };

  const updateProfileData = async (updates: Partial<UserProfile>) => {
    if (!user) return;
    const isLocalUser = Boolean((user as any).isLocalUser);

    const payload: UserProfile = {
      ...(profile || {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || 'Користувач',
      }),
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    if (isLocalUser) {
      try {
        localStorage.setItem(`signalhook_profile_${user.uid}`, JSON.stringify(payload));
        localStorage.setItem('signalhook_local_session', JSON.stringify({ user, profile: payload }));
      } catch {}
      setProfile(payload);

      // Sync updated Telegram settings to server background monitor
      fetch('/api/alerts/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          telegramBotToken: payload.telegramBotToken,
          telegramChatId: payload.telegramChatId,
          alerts: [],
        }),
      }).catch(() => {});
      return;
    }

    try {
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(
        userDocRef,
        cleanForFirestore({
          ...updates,
          updatedAt: new Date().toISOString(),
        })
      );
      setProfile(payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
      throw err;
    }
  };

  const logout = async () => {
    try {
      if (!(user as any)?.isLocalUser) {
        await signOut(auth);
      }
    } catch (err) {
      // ignore
    } finally {
      try {
        localStorage.removeItem('signalhook_local_session');
      } catch {}
      setProfile(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signInWithGoogle,
        signInWithEmail,
        registerWithEmail,
        updateProfileData,
        logout,
        authError,
        authErrorCode,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
