import { useEffect, useRef, useState } from "react";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import type { Activity } from "@shared/types";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import { useStrava } from "../hooks/useStrava";
import { useAuth } from "../contexts/AuthContext";
import { firestore } from "../services/firebase";
import { track } from "../services/analytics";
import { logClientError } from "../services/errorLogger";
import { buildOriderSharePayload, shareOrCopy } from "../features/share/oriderShareText";

type Step = "verifying" | "exchanging" | "done" | "error";

const AUTH_RESTORE_TIMEOUT_MS = 5000;
const SETTINGS_CONNECTIONS_PATH = "/settings?section=connections";
const SUMMARY_POLL_ATTEMPTS = 4;
const SUMMARY_POLL_DELAY_MS = 1200;

interface StravaSuccessSummary {
  activityCount: number;
  totalDistanceM: number;
  totalElevationM: number;
  fitnessCurveReady: boolean;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatDistance(meters: number, locale: string): string {
  if (meters >= 1000) return `${(meters / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })} km`;
  return `${Math.round(meters).toLocaleString(locale)} m`;
}

async function loadStravaSuccessSummary(uid: string): Promise<StravaSuccessSummary> {
  const snap = await getDocs(query(
    collection(firestore, "activities"),
    where("userId", "==", uid),
    where("deletedAt", "==", null),
    orderBy("createdAt", "desc"),
    limit(200),
  ));
  const activities = snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as Activity)
    .filter((activity) => activity.source === "strava" && activity.summary != null);

  return {
    activityCount: activities.length,
    totalDistanceM: activities.reduce((sum, activity) => sum + (activity.summary.distance ?? 0), 0),
    totalElevationM: activities.reduce((sum, activity) => sum + (activity.summary.elevationGain ?? 0), 0),
    fitnessCurveReady: activities.some((activity) => typeof activity.summary.tss === "number" && activity.summary.tss > 0),
  };
}

async function pollStravaSuccessSummary(uid: string): Promise<StravaSuccessSummary> {
  let latest: StravaSuccessSummary = {
    activityCount: 0,
    totalDistanceM: 0,
    totalElevationM: 0,
    fitnessCurveReady: false,
  };
  for (let attempt = 0; attempt < SUMMARY_POLL_ATTEMPTS; attempt += 1) {
    latest = await loadStravaSuccessSummary(uid);
    if (latest.activityCount > 0) return latest;
    if (attempt < SUMMARY_POLL_ATTEMPTS - 1) await wait(SUMMARY_POLL_DELAY_MS);
  }
  return latest;
}

export default function StravaCallbackPage() {
  const { t, i18n } = useTranslation("auth");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { connectStrava, exchangeCode } = useStrava();
  const [step, setStep] = useState<Step>("verifying");
  const [errorMsg, setErrorMsg] = useState("");
  const [successSummary, setSuccessSummary] = useState<StravaSuccessSummary | null>(null);
  const [continuePath, setContinuePath] = useState(SETTINGS_CONNECTIONS_PATH);
  const [shared, setShared] = useState(false);
  const exchangeStartedRef = useRef(false);

  const retryStravaConnection = () => {
    const returnTo = sessionStorage.getItem("strava_return_to") || SETTINGS_CONNECTIONS_PATH;
    connectStrava(returnTo);
  };

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

    if (exchangeStartedRef.current) return;

    if (!code || !state || state !== storedState) {
      setStep("error");
      setErrorMsg(t("stravaCallback.error.invalidRequest"));
      return;
    }

    // Wait for Firebase Auth to restore the session
    if (!user) {
      if (authLoading) return;
      const timeout = window.setTimeout(() => {
        setStep("error");
        setErrorMsg(t("stravaCallback.error.sessionExpired"));
      }, AUTH_RESTORE_TIMEOUT_MS);
      return () => window.clearTimeout(timeout);
    }
    exchangeStartedRef.current = true;

    sessionStorage.removeItem("strava_state");

    (async () => {
      try {
        setStep("exchanging");
        const grantedScope = searchParams.get("scope");
        if (grantedScope) await exchangeCode(code, grantedScope);
        else await exchangeCode(code);
        // funnel 의 결정적 마일스톤 — first_open → sign_up → strava_connect → first_kudos
        track("strava_connect", { result: "ok" });
        setStep("done");
        const returnTo = sessionStorage.getItem("strava_return_to") || SETTINGS_CONNECTIONS_PATH;
        setContinuePath(returnTo);
        sessionStorage.removeItem("strava_return_to");
        try {
          setSuccessSummary(await pollStravaSuccessSummary(user.uid));
        } catch (err) {
          logClientError("StravaCallbackPage.successSummary", err, { uid: user.uid });
          setSuccessSummary({
            activityCount: 0,
            totalDistanceM: 0,
            totalElevationM: 0,
            fitnessCurveReady: false,
          });
        }
      } catch {
        track("strava_connect", { result: "fail" });
        setStep("error");
        setErrorMsg(t("stravaCallback.error.exchangeFailed"));
      }
    })();

  }, [authLoading, exchangeCode, navigate, searchParams, t, user]);

  const shareSuccess = async () => {
    const body = t("stravaCallback.share.text", {
      count: successSummary?.activityCount ?? 0,
      distance: formatDistance(successSummary?.totalDistanceM ?? 0, i18n.language),
    });
    const payload = buildOriderSharePayload({
      title: t("stravaCallback.share.title"),
      body,
      url: window.location.origin,
      language: i18n.language,
    });
    const result = await shareOrCopy(payload);
    setShared(result === "shared" || result === "copied");
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="bg-[var(--bg-0)] rounded-[var(--r-lg)] border border-[var(--line-soft)] p-8 max-w-md w-full text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-[var(--bg-2)] flex items-center justify-center">
          {step === "error" ? (
            <svg className="w-8 h-8 text-[var(--rose)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : step === "done" ? (
            <svg className="w-8 h-8 text-[var(--lime)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

        {step === "done" && (
          <div className="space-y-4 text-left">
            <div className="rounded-[var(--r-lg)] border border-[var(--line-soft)] bg-[var(--bg-1)] p-4">
              <p className="text-[length:var(--fs-xs)] uppercase tracking-[0.08em] text-[var(--ink-4)]">
                {t("stravaCallback.summary.eyebrow")}
              </p>
              <p className="mt-1 text-[length:var(--fs-base)] font-semibold text-[var(--ink-0)]">
                {successSummary
                  ? t("stravaCallback.summary.title", { count: successSummary.activityCount })
                  : t("stravaCallback.summary.loading")}
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-[var(--r-md)] bg-[var(--bg-0)] p-3">
                  <p className="font-mono text-[length:var(--fs-lg)] font-semibold text-[var(--lime)]">
                    {successSummary ? successSummary.activityCount.toLocaleString(i18n.language) : "—"}
                  </p>
                  <p className="mt-1 text-[length:var(--fs-xs)] text-[var(--ink-4)]">{t("stravaCallback.summary.activities")}</p>
                </div>
                <div className="rounded-[var(--r-md)] bg-[var(--bg-0)] p-3">
                  <p className="font-mono text-[length:var(--fs-lg)] font-semibold text-[var(--lime)]">
                    {successSummary ? formatDistance(successSummary.totalDistanceM, i18n.language) : "—"}
                  </p>
                  <p className="mt-1 text-[length:var(--fs-xs)] text-[var(--ink-4)]">{t("stravaCallback.summary.distance")}</p>
                </div>
                <div className="rounded-[var(--r-md)] bg-[var(--bg-0)] p-3">
                  <p className="font-mono text-[length:var(--fs-lg)] font-semibold text-[var(--lime)]">
                    {successSummary ? `${Math.round(successSummary.totalElevationM).toLocaleString(i18n.language)} m` : "—"}
                  </p>
                  <p className="mt-1 text-[length:var(--fs-xs)] text-[var(--ink-4)]">{t("stravaCallback.summary.elevation")}</p>
                </div>
              </div>
              <p className="mt-3 text-[length:var(--fs-sm)] text-[var(--ink-3)]">
                {successSummary?.fitnessCurveReady
                  ? t("stravaCallback.summary.curveReady")
                  : t("stravaCallback.summary.curvePending")}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => navigate(continuePath)}
                className="flex-1 px-4 py-2 bg-[var(--lime)] text-[var(--bg-0)] text-[length:var(--fs-sm)] font-medium rounded-[var(--r-lg)] hover:opacity-90"
              >
                {t("stravaCallback.action.continue")}
              </button>
              <button
                onClick={shareSuccess}
                className="flex-1 px-4 py-2 border border-[var(--line-soft)] text-[var(--ink-1)] text-[length:var(--fs-sm)] font-medium rounded-[var(--r-lg)] hover:bg-[var(--bg-1)]"
              >
                {shared ? t("stravaCallback.action.shared") : t("stravaCallback.action.share")}
              </button>
            </div>
          </div>
        )}

        {step === "error" && (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
            <button
              onClick={retryStravaConnection}
              className="px-4 py-2 bg-[var(--lime)] text-[var(--bg-0)] text-[length:var(--fs-sm)] font-medium rounded-[var(--r-lg)] hover:opacity-90"
            >
              {t("stravaCallback.action.retry")}
            </button>
            <button
              onClick={() => navigate(SETTINGS_CONNECTIONS_PATH)}
              className="px-4 py-2 border border-[var(--line-soft)] text-[var(--ink-1)] text-[length:var(--fs-sm)] font-medium rounded-[var(--r-lg)] hover:bg-[var(--bg-1)]"
            >
              {t("stravaCallback.action.settings")}
            </button>
          </div>
        )}

        {step === "error" && (
          <button
            onClick={() => navigate("/")}
            className="text-[length:var(--fs-sm)] text-[var(--ink-3)] underline-offset-4 hover:underline"
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
