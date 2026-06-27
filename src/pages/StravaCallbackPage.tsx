import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import { useStrava } from "../hooks/useStrava";
import { useAuth } from "../contexts/AuthContext";
import { track } from "../services/analytics";

type Step = "verifying" | "exchanging" | "done" | "error";

export default function StravaCallbackPage() {
  const { t } = useTranslation("auth");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { exchangeCode } = useStrava();
  const [step, setStep] = useState<Step>("verifying");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const storedState = sessionStorage.getItem("strava_state");
    const errorParam = searchParams.get("error");

    // Mobile app redirect: state=mobile → redirect to app deep link
    if (state === "mobile") {
      if (code) {
        const scope = searchParams.get("scope") || "";
        window.location.href = `orider://strava/callback?code=${encodeURIComponent(code)}&scope=${encodeURIComponent(scope)}`;
      } else {
        window.location.href = `orider://strava/callback?error=${encodeURIComponent(errorParam || "denied")}`;
      }
      return;
    }

    if (errorParam) {
      setStep("error");
      setErrorMsg(t("stravaCallback.error.denied"));
      return;
    }

    if (!code || !state || state !== storedState) {
      setStep("error");
      setErrorMsg(t("stravaCallback.error.invalidRequest"));
      return;
    }

    // Wait for Firebase Auth to restore the session
    if (!user) return;

    sessionStorage.removeItem("strava_state");

    (async () => {
      try {
        setStep("exchanging");
        await exchangeCode(code);
        // funnel 의 결정적 마일스톤 — first_open → sign_up → strava_connect → first_kudos
        track("strava_connect", { result: "ok" });
        setStep("done");

        // Redirect to stored return path or settings
        const returnTo = sessionStorage.getItem("strava_return_to") || "/settings";
        sessionStorage.removeItem("strava_return_to");
        setTimeout(() => navigate(returnTo), 1500);
      } catch {
        track("strava_connect", { result: "fail" });
        setStep("error");
        setErrorMsg(t("stravaCallback.error.exchangeFailed"));
      }
    })();
     
  }, [user]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="bg-[var(--bg-0)] rounded-[var(--r-lg)] border border-[var(--line-soft)] p-8 max-w-md w-full text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-[var(--bg-2)] flex items-center justify-center">
          {step === "error" ? (
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : step === "done" ? (
            <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <div className="w-8 h-8 border-3 border-[var(--lime)] border-t-transparent rounded-full animate-spin" />
          )}
        </div>

        <h2 className="text-[length:var(--fs-lg)] font-bold text-[var(--ink-0)]">
          {step === "verifying" && t("stravaCallback.step.verifying")}
          {step === "exchanging" && t("stravaCallback.step.exchanging")}
          {step === "done" && t("stravaCallback.step.done")}
          {step === "error" && t("stravaCallback.step.error")}
        </h2>

        <p className="text-[length:var(--fs-sm)] text-[var(--ink-3)]">
          {step === "verifying" && t("stravaCallback.desc.verifying")}
          {step === "exchanging" && t("stravaCallback.desc.exchanging")}
          {step === "done" && t("stravaCallback.desc.done")}
          {step === "error" && errorMsg}
        </p>

        {step === "error" && (
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 bg-[var(--lime)] text-[var(--bg-0)] text-[length:var(--fs-sm)] font-medium rounded-[var(--r-lg)] hover:opacity-90"
          >
            {t("goHome")}
          </button>
        )}

        {/* Progress bar */}
        {step !== "error" && step !== "done" && (
          <div className="w-full bg-[var(--bg-2)] rounded-full h-1.5">
            <div
              className="bg-[var(--lime)] h-1.5 rounded-full transition-all duration-500"
              style={{
                width:
                  step === "verifying" ? "20%" :
                  step === "exchanging" ? "60%" :
                  "100%",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
