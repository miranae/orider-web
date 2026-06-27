import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import { doc, updateDoc } from "firebase/firestore";
import { firestore } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";
import { track } from "../services/analytics";
import { Bike, Footprints, Triangle, Waves } from "lucide-react";

type Step = "discipline" | "strava" | "goal";

const DISCIPLINES = [
  { key: "tri"  as const, icon: <Triangle size={28} /> },
  { key: "bike" as const, icon: <Bike size={28} /> },
  { key: "run"  as const, icon: <Footprints size={28} /> },
  { key: "swim" as const, icon: <Waves size={28} /> },
];

export default function OnboardingPage() {
  const { t } = useTranslation("auth");
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("discipline");
  // E3 or_onboarding_step_view — 모바일 앱과 동일 이벤트명으로 웹 온보딩 단계 진입 측정.
  // 웹 단계는 discipline/strava/goal (앱은 login/permission/sensor/first_ride) — 이름만 공유, 크로스 퍼널은 합집합.
  // 인증/로딩 게이트 통과(실제 온보딩 UI 노출) 시에만 발화 — 비로그인·로딩 프레임의 헛 카운트로
  // 퍼널 step-1 이 부풀려지는 것 방지.
  useEffect(() => {
    if (loading || !user) return;
    track("or_onboarding_step_view", { step });
  }, [step, loading, user]);
  const [selected, setSelected] = useState<"tri" | "bike" | "run" | "swim" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 비인증 가드
  if (!loading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-0)", color: "var(--ink-3)" }}>
        <div className="text-center">
          <p className="text-[length:var(--fs-lg)] font-semibold mb-2" style={{ color: "var(--ink-1)" }}>{t("loginRequired")}</p>
          <button onClick={() => navigate("/", { replace: true })} className="text-[length:var(--fs-sm)]" style={{ color: "var(--lime)" }}>
            {t("goHome")}
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-0)" }}>
        <div style={{ width: 32, height: 32, border: "3px solid var(--line-soft)", borderTopColor: "var(--lime)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
      </div>
    );
  }

  const userRef = user ? doc(firestore, "users", user.uid) : null;

  const handleDisciplineNext = async () => {
    if (!userRef || !selected) return;
    setSaving(true);
    setError(null);
    try {
      await updateDoc(userRef, { primaryDiscipline: selected, onboardingStep: "strava" });
      setStep("strava");
    } catch (err) {
      console.error("온보딩 저장 실패:", err);
      setError(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleStravaConnect = async () => {
    if (!userRef) return;
    try {
      await updateDoc(userRef, { onboardingStep: "goal" });
      navigate("/settings", { replace: true });
    } catch (err) {
      console.error("온보딩 저장 실패:", err);
      setError(t("saveFailed"));
    }
  };

  const handleStravaSkip = async () => {
    if (!userRef) return;
    setError(null);
    try {
      await updateDoc(userRef, { onboardingStep: "goal" });
      setStep("goal");
    } catch (err) {
      console.error("온보딩 저장 실패:", err);
      setError(t("saveFailed"));
    }
  };

  const handleGoalSkip = async () => {
    if (!userRef) return;
    setError(null);
    try {
      await updateDoc(userRef, { onboardingStep: "done" });
      navigate("/", { replace: true });
    } catch (err) {
      console.error("온보딩 저장 실패:", err);
      setError(t("saveFailed"));
    }
  };

  const handleGoalSetup = async () => {
    if (!userRef) return;
    setError(null);
    try {
      await updateDoc(userRef, { onboardingStep: "done" });
      navigate("/goal-setup", { replace: true });
    } catch (err) {
      console.error("온보딩 저장 실패:", err);
      setError(t("saveFailed"));
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "var(--bg-0)", color: "var(--ink-1)" }}
    >
      <div className="w-full max-w-sm">
        {/* 단계 표시 */}
        <div className="flex items-center gap-2 mb-8">
          {(["discipline", "strava", "goal"] as Step[]).map((s, i) => (
            <div
              key={s}
              className="flex-1 h-1 rounded-full"
              style={{
                background:
                  s === step
                    ? "var(--lime)"
                    : ["discipline", "strava", "goal"].indexOf(step) > i
                    ? "var(--lime)"
                    : "var(--line-soft)",
              }}
            />
          ))}
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-[var(--r-lg)] text-[length:var(--fs-sm)]" style={{ background: "color-mix(in oklch, var(--rose) 10%, var(--bg-1))", color: "var(--rose)", border: "1px solid var(--rose)" }}>
            {error}
          </div>
        )}

        {step === "discipline" && (
          <>
            <h1 className="text-[length:var(--fs-2xl)] font-bold mb-2" style={{ color: "var(--ink-0)" }}>
              {t("onboarding.discipline.title")}
            </h1>
            <p className="text-[length:var(--fs-sm)] mb-6" style={{ color: "var(--ink-3)" }}>
              {t("onboarding.discipline.subtitle")}
            </p>
            <div className="flex flex-col gap-3 mb-8">
              {DISCIPLINES.map(({ key, icon }) => (
                <button
                  key={key}
                  onClick={() => setSelected(key)}
                  className="flex items-center gap-4 px-5 py-4 rounded-[var(--r-xl)] border transition-all"
                  style={{
                    background: selected === key ? "var(--bg-3)" : "var(--bg-1)",
                    borderColor: selected === key ? "var(--lime)" : "var(--line-soft)",
                    color: selected === key ? "var(--lime)" : "var(--ink-1)",
                  }}
                >
                  {icon}
                  <span className="text-[length:var(--fs-base)] font-semibold">{t(`discipline.${key}`)}</span>
                </button>
              ))}
            </div>
            <button
              onClick={handleDisciplineNext}
              disabled={!selected || saving}
              className="w-full py-3 rounded-[var(--r-xl)] font-semibold text-[length:var(--fs-sm)] transition-opacity"
              style={{
                background: "var(--lime)",
                color: "var(--ink-0)",
                opacity: !selected || saving ? 0.4 : 1,
              }}
            >
              {saving ? t("saving") : t("next")}
            </button>
          </>
        )}

        {step === "strava" && (
          <>
            <h1 className="text-[length:var(--fs-2xl)] font-bold mb-2" style={{ color: "var(--ink-0)" }}>
              {t("onboarding.strava.title")}
            </h1>
            <p className="text-[length:var(--fs-sm)] mb-6" style={{ color: "var(--ink-3)" }}>
              {t("onboarding.strava.subtitle")}
            </p>
            <button
              onClick={handleStravaConnect}
              className="w-full py-3 rounded-[var(--r-xl)] font-semibold text-[length:var(--fs-sm)] mb-3"
              style={{ background: "var(--accent)", color: "var(--ink-0)" }}
            >
              {t("onboarding.strava.connect")}
            </button>
            <button
              onClick={handleStravaSkip}
              className="w-full py-3 rounded-[var(--r-xl)] font-semibold text-[length:var(--fs-sm)]"
              style={{ background: "var(--bg-2)", color: "var(--ink-2)" }}
            >
              {t("later")}
            </button>
          </>
        )}

        {step === "goal" && (
          <>
            <h1 className="text-[length:var(--fs-2xl)] font-bold mb-2" style={{ color: "var(--ink-0)" }}>
              {t("onboarding.goal.title")}
            </h1>
            <p className="text-[length:var(--fs-sm)] mb-6" style={{ color: "var(--ink-3)" }}>
              {t("onboarding.goal.subtitle")}
            </p>
            <button
              onClick={handleGoalSetup}
              className="w-full py-3 rounded-[var(--r-xl)] font-semibold text-[length:var(--fs-sm)] mb-3"
              style={{ background: "var(--lime)", color: "var(--ink-0)" }}
            >
              {t("onboarding.goal.setup")}
            </button>
            <button
              onClick={handleGoalSkip}
              className="w-full py-3 rounded-[var(--r-xl)] font-semibold text-[length:var(--fs-sm)]"
              style={{ background: "var(--bg-2)", color: "var(--ink-2)" }}
            >
              {t("later")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
