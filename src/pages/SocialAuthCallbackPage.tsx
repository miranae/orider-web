import { useEffect, useRef, useState } from "react";
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

type Step = "working" | "error";

/** 서버 HttpsError 코드 → 안내 문구 키. 서버 메시지는 한국어 전용이라 화면 문구는 여기서 고른다. */
export function socialAuthErrorKey(code: string | undefined): string {
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

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    if (!consumeSocialAuthState(state)) {
      setErrorKey("socialCallback.error.denied");
      setStep("error");
      return;
    }
    if (searchParams.get("error") || !code || !state) {
      setErrorKey(searchParams.get("error") ? "socialCallback.error.cancelled" : "socialCallback.error.generic");
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
        navigate(result.returnTo, { replace: true });
      } catch (err) {
        logClientError("SocialAuthCallbackPage.complete", err);
        setErrorKey(socialAuthErrorKey((err as { code?: string })?.code));
        setStep("error");
      }
    })();
  }, [authLoading, navigate, searchParams, showToast, t]);

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
