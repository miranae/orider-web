import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import { httpsCallable } from "firebase/functions";
import { doc, getDoc } from "firebase/firestore";
import { firestore, functions } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import { useAuth } from "../contexts/AuthContext";
import { useCourses } from "../hooks/useCourses";
import { GoalDetailsStep, PlanPreviewStep, RunGoalSetupWizard, SwimGoalSetupWizard } from "../components/training";
import DisciplineTabs from "../components/redesign/DisciplineTabs";
import type { GoalDetailsStepValue } from "../components/training/GoalDetailsStep";
import type { FeasibilityLabel } from "@shared/types/goal";

// ── Feasibility 계산 (클라이언트 미리보기용 — 서버 버전이 권위 있는 값) ──────

import { calcFeasibility as calcFeasibilityCore } from "@shared/training/feasibility";
import { Button, Card, Chip, Text } from "../theme/components";

interface FeasibilityResult {
  label: FeasibilityLabel;
  requiredWkg: number;
  sustainableWkg: number;
  gapWkg: number;
  fatigueAdjustmentPct?: number;
}

function calcFeasibility(
  courseDist: number, // km
  courseElev: number, // m
  goalDetails: GoalDetailsStepValue,
  ftpW: number,
  weightKg: number,
  userTsb?: number | null,
): FeasibilityResult {
  const isCompletion = goalDetails.eventType === 'completion'
    || !goalDetails.targetDurationMin
    || goalDetails.targetDurationMin <= 0;
  // 완주는 가상 20km/h로 평가하여 코스 난이도 가시화 (서버는 항상 on_track)
  const targetMin = isCompletion
    ? (courseDist > 0 ? (courseDist / 20) * 60 : 60)
    : goalDetails.targetDurationMin!;
  const r = calcFeasibilityCore({
    course: { dist: courseDist, elev: courseElev },
    target: { eventType: isCompletion ? 'time' : goalDetails.eventType, targetDurationMin: targetMin },
    snap: { ftp: ftpW, weightKg },
    fitness: userTsb != null ? { tsb: userTsb } : null,
  });
  return {
    label: r.label,
    requiredWkg: r.requiredWkg ?? 0,
    sustainableWkg: r.sustainableWkg ?? 0,
    gapWkg: r.gapWkg ?? 0,
    fatigueAdjustmentPct: r.fatigueAdjustmentPct,
  };
}

// ── 난이도 계산 ──────────────────────────────────────────────────────

function getDifficulty(distM: number, elevM: number, labels: { easy: string; mid: string; hard: string; hc: string }): { label: string; color: string } {
  const distKm = distM / 1000;
  if (distKm === 0) return { label: labels.easy, color: "var(--lime)" };
  const mpk = elevM / distKm;
  if (mpk > 20) return { label: labels.hc, color: "var(--rose)" };
  if (mpk > 12) return { label: labels.hard, color: "var(--amber)" };
  if (mpk > 6)  return { label: labels.mid, color: "var(--aqua)" };
  return { label: labels.easy, color: "var(--lime)" };
}

// ── Stepper ───────────────────────────────────────────────────────────

interface StepperProps {
  current: number;
  steps: string[];
}

function Stepper({ current, steps }: StepperProps) {
  const { t } = useTranslation('training');
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        padding: "var(--space-4) var(--space-5)",
        background: "var(--bg-1)",
        border: "1px solid var(--line-soft)",
        borderRadius: "var(--r-lg)",
        marginBottom: 'var(--space-6)',
      }}
    >
      {steps.map((label, idx) => {
        const n = idx + 1;
        const done = current > n;
        const active = current === n;
        const isLast = idx === steps.length - 1;

        return (
          <div key={n} style={{ display: "flex", alignItems: "center", flex: isLast ? 0 : 1 }}>
            {/* Dot + label */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: done
                    ? "var(--lime)"
                    : active
                    ? "var(--bg-2)"
                    : "var(--bg-1)",
                  border: `1px solid ${done || active ? "var(--lime)" : "var(--line-soft)"}`,
                  color: done
                    ? "var(--primary-fg)"
                    : active
                    ? "var(--lime)"
                    : "var(--ink-3)",
                  display: "grid",
                  placeItems: "center",
                  fontSize: "var(--fs-xs)",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {done ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2.5 7l3 3 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  n
                )}
              </div>
              <div>
                <Text as="div" variant="eyebrow" style={{ fontSize: "var(--fs-xs)" }}>{t('goals.stepLabel')} {n}</Text>
                <div
                  style={{
                    fontSize: "var(--fs-sm)",
                    fontWeight: 500,
                    color: active || done ? "var(--ink-0)" : "var(--ink-3)",
                  }}
                >
                  {label}
                </div>
              </div>
            </div>
            {/* Connector */}
            {!isLast && (
              <div
                style={{
                  flex: 1,
                  height: 1,
                  background: done ? "var(--lime)" : "var(--line-soft)",
                  margin: "0 16px",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── CourseSelectStep ─────────────────────────────────────────────────

interface CourseSelectStepProps {
  selectedId: string | null;
  onSelect: (id: string, course: { name: string; dist: number; elev: number }) => void;
}

function CourseSelectStep({ selectedId, onSelect }: CourseSelectStepProps) {
  const { t } = useTranslation('training');
  const { t: tCommon } = useTranslation('common');
  const difficultyLabels = {
    easy: tCommon('difficulty.easy'),
    mid: tCommon('difficulty.mid'),
    hard: tCommon('difficulty.hard'),
    hc: tCommon('difficulty.hc'),
  };
  const { courses, loading, search } = useCourses();
  const [searchQuery, setSearchQuery] = useState("");

  if (loading) {
    return (
      <Card padding="none" style={{ padding: 26 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                height: 100,
                background: "var(--bg-2)",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--line-soft)",
                opacity: 0.6,
              }}
            />
          ))}
        </div>
      </Card>
    );
  }

  if (courses.length === 0) {
    return (
      <Card padding="none" style={{ padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: "var(--fs-5xl)", marginBottom: 'var(--space-3)' }}>🗺️</div>
        <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-1)", marginBottom: 6 }}>
          {t('goals.courseEmpty')}
        </div>
        <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}>
          {t('goals.courseEmptyDesc')}
        </div>
      </Card>
    );
  }

  const filtered = search(searchQuery);

  return (
    <Card padding="none" style={{ padding: 26 }}>
      {/* Section header + 검색 */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
          <div>
            <div style={{ fontSize: "var(--fs-sm)", fontWeight: 700, color: "var(--ink-0)", marginBottom: 'var(--space-1)' }}>
              {t('goals.courseSelectInstructions')}
            </div>
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>
              {t('goals.courseSelectDetail')}
            </div>
          </div>
          <input
            type="text"
            placeholder={t('goals.courseSearchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: 200,
              padding: "6px 10px",
              fontSize: "var(--fs-sm)",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--line)",
              background: "var(--bg-2)",
              color: "var(--ink-1)",
              outline: "none",
            }}
          />
        </div>
      </div>

      {/* Course grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, maxHeight: 400, overflowY: "auto", paddingRight: 'var(--space-1)' }}>
        {filtered.length === 0 && searchQuery && (
          <div style={{ gridColumn: "1 / -1", padding: 'var(--space-5)', textAlign: "center", color: "var(--ink-3)", fontSize: "var(--fs-sm)" }}>
            {t('goals.courseSearchEmpty', { query: searchQuery })}
          </div>
        )}
        {filtered.map((c) => {
          const sel = c.id === selectedId;
          const distKm = (c.distance / 1000).toFixed(1);
          const elevM = Math.round(c.elevationGain);
          const diff = getDifficulty(c.distance, c.elevationGain, difficultyLabels);

          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id, { name: c.name, dist: c.distance / 1000, elev: c.elevationGain })}
              style={{
                textAlign: "left",
                padding: 'var(--space-4)',
                borderRadius: "var(--r-md)",
                background: sel ? "var(--accent-soft-bg)" : "var(--bg-2)",
                border: `${sel ? 2 : 1}px solid ${sel ? "var(--lime)" : "var(--line-soft)"}`,
                cursor: "pointer",
                transition: "border-color .12s, background .12s",
              }}
            >
              {/* Name + difficulty */}
              <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-2)', marginBottom: 6 }}>
                <span
                  style={{
                    fontSize: "var(--fs-sm)",
                    fontWeight: 600,
                    color: "var(--ink-0)",
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.name}
                </span>
                <Chip
                  style={{ color: diff.color, borderColor: diff.color }}
                >
                  {diff.label}
                </Chip>
              </div>

              {/* Region */}
              {c.regions && c.regions.length > 0 && (
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginBottom: 'var(--space-2)' }}>
                  {c.regions.join(" · ")}
                </div>
              )}

              {/* Stats */}
              <div
                style={{
                  display: "flex",
                  gap: 14,
                  fontSize: "var(--fs-xs)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                <span>
                  <span style={{ color: "var(--ink-3)" }}>{t('goals.distanceLabel')} </span>
                  <span style={{ color: "var(--ink-0)" }}>{distKm} km</span>
                </span>
                <span>
                  <span style={{ color: "var(--ink-3)" }}>↑ </span>
                  <span style={{ color: "var(--ink-0)" }}>{elevM} m</span>
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* 새 코스 만들기 */}
      <a
        href="/course/create"
        style={{
          padding: 14,
          background: "var(--bg-2)",
          border: "1px dashed var(--line)",
          borderRadius: "var(--r-md)",
          marginTop: 'var(--space-4)',
          fontSize: "var(--fs-xs)",
          color: "var(--lime)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          cursor: "pointer",
          textDecoration: "none",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-3)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-2)"; }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
          <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {t('goals.courseCreateLink')}
      </a>
    </Card>
  );
}


// ── WizardFooter ─────────────────────────────────────────────────────

interface WizardFooterProps {
  step: number;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onStart: () => void;
}

function WizardFooter({ step, canNext, onPrev, onNext, onStart }: WizardFooterProps) {
  const { t } = useTranslation('training');
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        marginTop: 'var(--space-6)',
        position: "sticky",
        bottom: 0,
        padding: 'var(--space-3) 0',
        background: "linear-gradient(180deg, color-mix(in oklch, var(--bg-1) 0%, transparent) 0%, var(--bg-1) 30%)",
        borderTop: "1px solid var(--line-soft)",
        zIndex: 5,
      }}
    >
      <Button variant="ghost"
        onClick={onPrev}
        style={{ opacity: step === 1 ? 0 : 1, pointerEvents: step === 1 ? "none" : "auto" }}
      >
        {t('footerButtons.prev')}
      </Button>
      <div style={{ flex: 1 }} />
      {step < 3 ? (
        <Button variant="primary"
          onClick={onNext}
          disabled={!canNext}
          style={{ opacity: canNext ? 1 : 0.4, cursor: canNext ? "pointer" : "not-allowed" }}
        >
          {t('footerButtons.next')}
        </Button>
      ) : (
        <Button variant="primary" onClick={onStart}>
          {t('footerButtons.start')}
        </Button>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────

export default function GoalSetupPage() {
  const { t } = useTranslation('training');
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const discipline = (searchParams.get("sport") || "bike") as "bike" | "run" | "swim";
  const [step, setStep] = useState(1);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<{ name: string; dist: number; elev: number } | null>(null);
  const [goalDetails, setGoalDetails] = useState<GoalDetailsStepValue>({
    eventType: "completion",
    eventDate: "",
    targetDurationMin: undefined,
    weeklySessions: 4,
  });
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const userFtp: number = profile?.ftp ?? 200;
  const userWeightKg: number = profile?.weightKg ?? 70;

  // 현재 TSB 로드 (fitness/projection 첫 series의 tsb, 없으면 null) — feasibility에 피로도 반영
  const [userTsb, setUserTsb] = useState<number | null>(null);
  useEffect(() => {
    if (!user) { setUserTsb(null); return; }
    let cancelled = false;
    (async () => {
      try {
        // 종목별 → 호환용 단일 문서 폴백
        const refs = [
          doc(firestore, "users", user.uid, "fitness", `projection_${discipline}`),
          doc(firestore, "users", user.uid, "fitness", "projection"),
        ];
        const STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7일 이상 오래된 projection은 신선도 부족으로 무시
        for (const ref of refs) {
          const snap = await getDoc(ref);
          if (!snap.exists()) continue;
          const data = snap.data() as {
            series?: Array<{ tsb?: number }>;
            currentTsb?: number;
            computedAt?: number;
          };
          if (data.computedAt && Date.now() - data.computedAt > STALE_MS) continue;
          // 서버가 currentTsb를 저장하면 그걸 우선 (실측 현재값), 없으면 series 첫 항목으로 폴백
          const tsb = typeof data.currentTsb === "number" ? data.currentTsb : data.series?.[0]?.tsb;
          if (typeof tsb === "number" && Number.isFinite(tsb)) {
            if (!cancelled) setUserTsb(tsb);
            return;
          }
        }
        if (!cancelled) setUserTsb(null);
      } catch {
        if (!cancelled) setUserTsb(null);
      }
    })();
    return () => { cancelled = true; };
  }, [user, discipline]);

  // Step 3: 실시간 feasibility 계산 (goalDetails 변경 시 재계산)
  const feasibility: FeasibilityResult | null = selectedCourse
    ? calcFeasibility(selectedCourse.dist, selectedCourse.elev, goalDetails, userFtp, userWeightKg, userTsb)
    : null;

  const canNext =
    step === 1 ? selectedCourseId !== null :
    step === 2 ? goalDetails.eventDate !== "" :
    true;

  const handleNext = () => setStep((s) => Math.min(3, s + 1));
  const handlePrev = () => setStep((s) => Math.max(1, s - 1));
  const handleStart = async () => {
    if (!selectedCourseId || submitting) return;
    setSubmitting(true);
    setCreateError(null);
    try {
      const createGoal = httpsCallable(functions, "createGoal");
      const result = await createGoal({
        courseId: selectedCourseId,
        eventType: goalDetails.eventType,
        eventDate: goalDetails.eventDate,
        targetDurationMin: goalDetails.targetDurationMin,
        weeklySessions: goalDetails.weeklySessions,
        discipline: discipline,
      });
      const data = result.data as { goalId: string };
      navigate(`/plan?goalId=${data.goalId}`);
    } catch (err) {
      logClientError('GoalSetupPage.handleStart', err, {
        courseId: selectedCourseId,
        eventType: goalDetails.eventType,
        eventDate: goalDetails.eventDate,
        weeklySessions: goalDetails.weeklySessions,
        discipline,
      });
      setCreateError(t('errors.creationError'));
      setSubmitting(false);
    }
  };

  const pageTitle = t(`goals.wizardTitle.${discipline}`);
  const pageSubtitle = t(`goals.wizardSubtitle.${discipline}`);
  const eyebrowLabel = t(`goals.eyebrowLabel.${discipline}`);

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 24px 48px" }}>
      {/* 공통 헤더 */}
      <div style={{ marginBottom: 'var(--space-6)', paddingTop: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-3)', marginBottom: 6, flexWrap: "wrap" }}>
          <Text as="div" variant="eyebrow">{eyebrowLabel}</Text>
          <DisciplineTabs />
        </div>
        <h1 style={{ fontSize: "var(--fs-xl)", fontWeight: 700, color: "var(--ink-0)", margin: 0 }}>
          {pageTitle}
        </h1>
        <p style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)", marginTop: 6 }}>
          {pageSubtitle}
        </p>
      </div>

      {/* Wizard (discipline에 따라 교체) */}
      {discipline === 'run' && <RunGoalSetupWizard key="run" Stepper={Stepper} />}
      {discipline === 'swim' && <SwimGoalSetupWizard key="swim" Stepper={Stepper} />}
      {discipline === 'bike' && (
        <>
          {/* Stepper */}
          <Stepper current={step} steps={[t('goals.stepLabels.courseSelect'), t('goals.stepLabels.goalDetails'), t('goals.stepLabels.planPreview')]} />

          {/* Step content */}
          {step === 1 && (
            <CourseSelectStep
              selectedId={selectedCourseId}
              onSelect={(id, course) => { setSelectedCourseId(id); setSelectedCourse(course); }}
            />
          )}
          {step === 2 && selectedCourse && (
            <GoalDetailsStep
              courseDist={selectedCourse.dist}
              courseElev={selectedCourse.elev}
              value={goalDetails}
              onChange={setGoalDetails}
              userFtp={userFtp}
              userWeightKg={userWeightKg}
              userTsb={userTsb}
            />
          )}
          {step === 3 && selectedCourse && (
            <PlanPreviewStep
              goal={{
                courseName: selectedCourse.name,
                courseDist: selectedCourse.dist,
                courseElev: selectedCourse.elev,
                eventType: goalDetails.eventType,
                eventDate: goalDetails.eventDate,
                targetDurationMin: goalDetails.targetDurationMin,
                weeklySessions: goalDetails.weeklySessions,
              }}
              feasibility={feasibility ?? { label: "on_track" }}
              loading={submitting}
            />
          )}

          {/* 오류 메시지 */}
          {createError && (
            <div
              style={{
                marginTop: 'var(--space-4)',
                padding: "var(--space-3) var(--space-4)",
                background: "color-mix(in oklch, var(--rose) 10%, var(--bg-1))",
                border: "1px solid var(--rose)",
                borderRadius: "var(--r-md)",
                fontSize: "var(--fs-sm)",
                color: "var(--rose)",
              }}
            >
              {createError}
            </div>
          )}

          {/* Footer nav */}
          <WizardFooter
            step={step}
            canNext={canNext}
            onPrev={handlePrev}
            onNext={handleNext}
            onStart={handleStart}
          />
        </>
      )}
    </div>
  );
}
