import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
// AuthProvider 는
// 임베드에서 마운트되지 않는다(AppRoot 가 임베드 경로를 AuthProvider 없이 렌더하고,
// 임베드는 AuthContextProvider 에 세션을 직접 주입한다). 이 모듈이 임베드 폐포에 든 것은
// 타입·AuthContextProvider 때문이다.
// eslint-disable-next-line design-system/no-firebase-singleton-in-embed
import { auth, ensureAppCheckReady, firestore, functions, googleProvider } from "../services/firebase";
import { track } from "../services/analytics";
import { getRuntimeConfig } from "../services/runtimeConfig";
import { logClientError } from "../services/errorLogger";
import type { UserProfile } from "@shared/types";
import { SignInDialog } from "../components/auth/SignInDialog";
import { signInCancelledError } from "../utils/signInCancelled";

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

export interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  profileLoading: boolean;
  loading: boolean;
  /** 로그인 방식 선택 창(Google·네이버·카카오·Strava)을 연다. Google 로 로그인되면 resolve, 창을 닫으면 reject. */
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  profileLoading: true,
  loading: true,
  signIn: async () => {},
  logout: async () => {},
});

/** Supplies an already-authorized session without mounting the normal web auth/profile listeners. */
export function AuthContextProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: AuthContextValue;
}) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [signInOpen, setSignInOpen] = useState(false);
  const profileOwnerRef = useRef<string | null>(null);
  const pendingSignInRef = useRef<{ resolve: () => void; reject: (err: unknown) => void } | null>(null);

  // Listen to auth state
  useEffect(() => {
    let cancelled = false;
    let authGeneration = 0;

    async function callWithRetry<T>(fn: () => Promise<T>, generation: number, retries = 3): Promise<T> {
      for (let i = 0; ; i++) {
        if (cancelled || generation !== authGeneration) throw new Error("auth/session-changed");
        try { return await fn(); }
        catch (err) {
          if (cancelled || generation !== authGeneration || i >= retries - 1) throw err;
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
        }
      }
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (cancelled) return;
      const generation = ++authGeneration;
      const isCurrent = () => !cancelled && generation === authGeneration;
      const nextUid = firebaseUser?.uid ?? null;
      if (profileOwnerRef.current !== nextUid) setProfile(null);
      profileOwnerRef.current = nextUid;
      setUser(firebaseUser);
      setProfileLoading(Boolean(firebaseUser));
      if (firebaseUser && getRuntimeConfig().appEnvironment !== "stage") {
        // 프로필 생성 — 3회 지수 백오프 retry
        try {
          const { data: ensuredProfile } = await callWithRetry(async () => {
            await ensureAppCheckReady();
            const ensureProfile = httpsCallable<void, UserProfile>(functions, "ensureUserProfile");
            return ensureProfile();
          }, generation);
          // 서버가 이미 확인한 정본을 첫 live snapshot 전에 표시한다. 늦게 도착한
          // 이전 계정 응답은 버리고, 현재 계정의 최신 snapshot 을 덮어쓰지 않는다.
          if (isCurrent() && typeof ensuredProfile?.nickname === "string") {
            setProfile((current) => isCurrent() ? current ?? ensuredProfile : current);
            setProfileLoading(false);
          }
        } catch (err) {
          if (isCurrent()) {
            logClientError("AuthContext.ensureUserProfile", err, { uid: firebaseUser.uid });
          }
        }
      } else if (!firebaseUser) {
        if (!cancelled) {
          setProfile(null);
          setProfileLoading(false);
        }
      }
      if (isCurrent()) setLoading(false);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Subscribe to user profile
  useEffect(() => {
    if (!user) {
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);

    let active = true;
    const unsubscribe = onSnapshot(
      doc(firestore, "users", user.uid),
      (snap) => {
        if (!active || profileOwnerRef.current !== user.uid) return;
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
        } else if (!snap.metadata.fromCache) {
          setProfile(null);
        }
        setProfileLoading(false);
      },
      (err) => {
        if (!active || profileOwnerRef.current !== user.uid) return;
        logClientError("AuthContext.profileSnapshot", err, { uid: user.uid });
        setProfile(null);
        setProfileLoading(false);
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
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

  const signIn = useCallback(() => {
    const pending = new Promise<void>((resolve, reject) => {
      pendingSignInRef.current?.reject(signInCancelledError());
      pendingSignInRef.current = { resolve, reject };
      setSignInOpen(true);
    });
    // 버튼의 fire-and-forget 호출도 정상 취소를 미처리 rejection 으로 보고하지 않는다.
    // 원래 promise 는 유지하므로 await 호출부는 취소를 감지하고 후속 작업을 중단한다.
    void pending.catch(() => {});
    return pending;
  }, []);

  const handleDialogGoogle = useCallback(async () => {
    await signInWithGoogle();
    setSignInOpen(false);
    pendingSignInRef.current?.resolve();
    pendingSignInRef.current = null;
  }, [signInWithGoogle]);

  const handleDialogClose = useCallback(() => {
    setSignInOpen(false);
    pendingSignInRef.current?.reject(signInCancelledError());
    pendingSignInRef.current = null;
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
    () => ({ user, profile, profileLoading, loading, signIn, logout }),
    [user, profile, profileLoading, loading, signIn, logout],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <SignInDialog open={signInOpen} onClose={handleDialogClose} onGoogle={handleDialogGoogle} />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
