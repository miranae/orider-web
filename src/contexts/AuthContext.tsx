import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signOut,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  getAdditionalUserInfo,
  type User,
  type UserCredential,
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, ensureAppCheckReady, firestore, functions, googleProvider } from "../services/firebase";
import { track } from "../services/analytics";
import { logClientError } from "../services/errorLogger";
import type { UserProfile } from "@shared/types";

/**
 * Firebase 표준 `sign_up` vs `login` 분기 발사.
 * `getAdditionalUserInfo(result).isNewUser` 는 Firebase Auth 가 직접 판정하는 신뢰
 * 가능한 신호 — metadata timestamp 비교 (race 가능) 보다 정확.
 */
function emitAuthEvent(result: UserCredential, method: string) {
  const info = getAdditionalUserInfo(result);
  if (info?.isNewUser) {
    track("sign_up", { method });
  } else {
    track("login", { method });
  }
}

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  loading: true,
  signInWithGoogle: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Listen to auth state
  useEffect(() => {
    let cancelled = false;

    async function callWithRetry(fn: () => Promise<unknown>, retries = 3): Promise<unknown> {
      for (let i = 0; i < retries; i++) {
        try { return await fn(); }
        catch (err) {
          if (i === retries - 1) throw err;
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
        }
      }
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (cancelled) return;
      setUser(firebaseUser);
      if (firebaseUser) {
        // 프로필 생성 — 3회 지수 백오프 retry
        try {
          await callWithRetry(async () => {
            await ensureAppCheckReady();
            const ensureProfile = httpsCallable(functions, "ensureUserProfile");
            return ensureProfile();
          });
        } catch (err) {
          logClientError("AuthContext.ensureUserProfile", err, { uid: firebaseUser.uid });
          if (!cancelled) setProfile(null);
        }
      } else {
        if (!cancelled) {
          setProfile(null);
        }
      }
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Subscribe to user profile
  useEffect(() => {
    if (!user) return;

    return onSnapshot(
      doc(firestore, "users", user.uid),
      (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
        }
      },
    );
  }, [user]);

  const signInWithGoogle = useCallback(async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      emitAuthEvent(result, "google");
    } catch (err: any) {
      if (err.code === 'auth/popup-blocked') {
        // redirect 흐름 — result 는 다음 page load 에서 getRedirectResult 가 회수.
        await signInWithRedirect(auth, googleProvider);
      } else {
        throw err;
      }
    }
  }, []);

  // redirect 로그인 후 첫 로드에서 결과 회수 → sign_up vs login funnel 닫기.
  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => {
        if (result) emitAuthEvent(result, "google_redirect");
      })
      .catch(() => { /* 비치명 — 에러는 로그인 흐름 자체에서 별도 처리됨 */ });
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    setProfile(null);
    track("logout");
  }, []);

  const value = useMemo(
    () => ({ user, profile, loading, signInWithGoogle, logout }),
    [user, profile, loading, signInWithGoogle, logout],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
