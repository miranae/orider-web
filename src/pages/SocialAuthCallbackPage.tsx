import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { signInWithCustomToken } from "firebase/auth";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { auth } from "../services/firebase";
import { track } from "../services/analytics";
import { logClientError } from "../services/errorLogger";
import { completeSocialAuth, consumeSocialAuthState } from "../services/socialAuth";
import { Button } from "../theme/components";
import { stravaSignupGuidancePath } from "../utils/stravaSignup";

type Step = "working" | "error";

/** 서버 HttpsError 코드 → 안내 문구 키. 서버 메시지는 한국어 전용이라 화면 문구는 여기서 고른다. */
export function socialAuthErrorKey(code: string | undefined, reason?: string): string {
  if (code === "functions/failed-precondition" && reason === "social-account-recovery-required") return "socialCallback.error.accountRecovery";
  if (reason === "strava-existing-account-link-required") return "socialCallback.error.existingStravaAccount";
  if (reason === "strava-owner-conflict") return "socialCallback.error.alreadyLinked";
  if (reason === "strava-sync-reauth-required") return "socialCallback.error.stravaSyncReauth";
  switch (code) {
    case "functions/already-exists": return "socialCallback.error.alreadyLinked";
    case "functions/failed-precondition": return "socialCallback.error.providerInUse";
    case "functions/not-found":
    case "functions/deadline-exceeded": return "socialCallback.error.expired";
    case "functions/permission-denied": return "socialCallback.error.denied";
    default: return "socialCallback.error.generic";
  }
}

export default function SocialAuthCallbackPage() {
  const { t } = useTranslation("auth");
  const [searchParams] = useSearchParams();
  const [callbackParams] = useState(() => new URLSearchParams(searchParams));
  useLayoutEffect(() => {
    // code/state 는 교환·실패 후에도 주소나 오류 텔레메트리에 남지 않게 캡처 직후 제거한다.
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }, []);
  const navigate = useNavigate();
  const { loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [step, setStep] = useState<Step>("working");
  const [errorKey, setErrorKey] = useState("socialCallback.error.generic");
  const startedRef = useRef(false);

  useEffect(() => {
    // 계정 연결은 서버가 현재 로그인 사용자를 확인하므로 세션 복원이 끝난 뒤에 교환한다.
    if (authLoading || startedRef.current) return;
    startedRef.current = true;

    const code = callbackParams.get("code");
    const state = callbackParams.get("state");
    if (!consumeSocialAuthState(state)) {
      setErrorKey("socialCallback.error.denied");
      setStep("error");
      return;
    }
    if (callbackParams.get("error") || !code || !state) {
      setErrorKey(callbackParams.get("error") ? "socialCallback.error.cancelled" : "socialCallback.error.generic");
      setStep("error");
      return;
    }

    void (async () => {
      try {
        const result = await completeSocialAuth(code, state);
        if (result.mode === "login") {
          await signInWithCustomToken(auth, result.token);
          track(result.isNewUser ? "sign_up" : "login", { method: result.provider });
        } else {
          track("social_link", { provider: result.provider });
          showToast(t("socialCallback.linked"), "success");
        }
        if (result.stravaSyncReauthRequired) showToast(t("socialCallback.stravaSyncReauth"), "info");
        const target = result.mode === "login" && result.provider === "strava" && result.isNewUser
          ? `/onboarding?${new URLSearchParams({ stravaSignup: "1", returnTo: stravaSignupGuidancePath(result.returnTo) })}`
          : result.returnTo;
        navigate(target, { replace: true });
      } catch (err) {
        logClientError("SocialAuthCallbackPage.complete", err);
        const error = err as { code?: string; details?: { reason?: string } };
        setErrorKey(socialAuthErrorKey(error?.code, error?.details?.reason));
        setStep("error");
      }
    })();
  }, [authLoading, navigate, callbackParams, showToast, t]);

  return (
    <div data-testid="A2-C" className="flex items-center justify-center min-h-[60vh]">
      <div className="bg-[var(--bg-0)] rounded-[var(--r-lg)] border border-[var(--line-soft)] p-8 max-w-md w-full text-center space-y-4">
        {step === "working" ? (
          <>
            <div className="w-8 h-8 mx-auto border-3 border-[var(--lime)] border-t-transparent rounded-full animate-spin" />
            <p className="text-[var(--ink-2)]">{t("socialCallback.working")}</p>
          </>
        ) : (
          <>
            <h2 className="text-[length:var(--fs-lg)] font-bold text-[var(--ink-0)]">{t("socialCallback.errorTitle")}</h2>
            <p role="alert" className="text-[var(--ink-2)]">{t(errorKey)}</p>
            <Button data-testid="A2-C-1" variant="secondary" onClick={() => navigate("/", { replace: true })}>{t("goHome")}</Button>
          </>
        )}
      </div>
    </div>
  );
}
