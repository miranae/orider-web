import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { doc, runTransaction } from "firebase/firestore";
import { firestore } from "../../services/firebase";
import type { PlanDay, PlanWeek, WorkoutKind } from "@shared/types/goal";
import { Bike, Footprints, Waves, Moon } from "lucide-react";

// ── 종목별 워크아웃 템플릿 ───────────────────────────────────────────────────

type Discipline = "bike" | "run" | "swim" | "rest";

interface WorkoutTemplate {
  kind: WorkoutKind;
  label: string;
  color: string;
  tss: number;
  durationMin: number;
  desc: string;
}

function buildTemplates(t: (key: string) => string): Record<Exclude<Discipline, "rest">, WorkoutTemplate[]> {
  return {
    bike: [
      { kind: "rec",    label: t('workouts.rec'),    color: "var(--ink-4)",  tss: 25,  durationMin: 45,  desc: t('add.templates.bike.rec') },
      { kind: "z2",     label: t('workouts.z2'),     color: "var(--aqua)",   tss: 65,  durationMin: 90,  desc: t('add.templates.bike.z2') },
      { kind: "z2Long", label: t('workouts.z2Long'), color: "var(--aqua)",   tss: 180, durationMin: 240, desc: t('add.templates.bike.z2Long') },
      { kind: "tempo",  label: t('workouts.tempo'),  color: "var(--amber)",  tss: 85,  durationMin: 75,  desc: t('add.templates.bike.tempo') },
      { kind: "ftp",    label: t('workouts.ftp'),    color: "var(--lime)",   tss: 110, durationMin: 70,  desc: t('add.templates.bike.ftp') },
      { kind: "vo2",    label: t('workouts.vo2Max'), color: "var(--rose)",   tss: 95,  durationMin: 60,  desc: t('add.templates.bike.vo2') },
      { kind: "sim",    label: t('workouts.sim'),    color: "var(--lime)",   tss: 240, durationMin: 300, desc: t('add.templates.bike.sim') },
    ],
    run: [
      { kind: "recoveryRun", label: t('workouts.recoveryRun'), color: "var(--ink-4)", tss: 20,  durationMin: 30,  desc: t('add.templates.run.recoveryRun') },
      { kind: "easyRun",     label: t('workouts.easyRun'),     color: "var(--aqua)",  tss: 40,  durationMin: 45,  desc: t('add.templates.run.easyRun') },
      { kind: "tempoRun",    label: t('workouts.tempoRun'),    color: "var(--amber)", tss: 70,  durationMin: 50,  desc: t('add.templates.run.tempoRun') },
      { kind: "intervalRun", label: t('workouts.intervalRun'), color: "var(--rose)",  tss: 90,  durationMin: 55,  desc: t('add.templates.run.intervalRun') },
      { kind: "longRun",     label: t('workouts.longRun'),     color: "var(--aqua)",  tss: 120, durationMin: 90,  desc: t('add.templates.run.longRun') },
    ],
    swim: [
      { kind: "recoverySwim", label: t('workouts.recoverySwim'), color: "var(--ink-4)", tss: 15,  durationMin: 30,  desc: t('add.templates.swim.recoverySwim') },
      { kind: "easySwim",     label: t('workouts.easySwim'),     color: "var(--aqua)",  tss: 30,  durationMin: 40,  desc: t('add.templates.swim.easySwim') },
      { kind: "drillSwim",    label: t('workouts.drillSwim'),    color: "var(--amber)", tss: 35,  durationMin: 45,  desc: t('add.templates.swim.drillSwim') },
      { kind: "intervalSwim", label: t('workouts.intervalSwim'), color: "var(--rose)",  tss: 60,  durationMin: 50,  desc: t('add.templates.swim.intervalSwim') },
      { kind: "longSwim",     label: t('workouts.longSwim'),     color: "var(--aqua)",  tss: 80,  durationMin: 60,  desc: t('add.templates.swim.longSwim') },
    ],
  };
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface AddPlanSheetProps {
  goalId: string;
  weekId: string;
  days: PlanDay[];
  onClose: () => void;
  onUpdate: () => void;
  /** 미리 선택할 요일 인덱스 (0=월) */
  initialDayIndex?: number;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AddPlanSheet({
  goalId,
  weekId,
  days,
  onClose,
  onUpdate,
  initialDayIndex,
}: AddPlanSheetProps) {
  const { t } = useTranslation('training');
  const { t: tCommon } = useTranslation('common');
  const TEMPLATES_BY_DISCIPLINE = useMemo(() => buildTemplates(t), [t]);
  const DAY_NAMES = useMemo(() => [
    tCommon('weekday.mon'),
    tCommon('weekday.tue'),
    tCommon('weekday.wed'),
    tCommon('weekday.thu'),
    tCommon('weekday.fri'),
    tCommon('weekday.sat'),
    tCommon('weekday.sun'),
  ], [tCommon]);
  const [discipline, setDiscipline] = useState<Discipline | null>(null);
  const [selectedDay, setSelectedDay] = useState<number>(initialDayIndex ?? -1);
  const [loading, setLoading] = useState(false);

  // 휴식일인 요일 목록 (추가 가능한 대상)
  const availableDays = days.map((d, i) => ({
    index: i,
    isRest: d.workout === "rest",
    label: DAY_NAMES[d.dayOfWeek] ?? DAY_NAMES[i],
  }));

  async function handleSelectTemplate(template: WorkoutTemplate) {
    if (selectedDay < 0 || selectedDay >= days.length) return;
    setLoading(true);
    try {
      const ref = doc(firestore, "goals", goalId, "plan", weekId);
      await runTransaction(firestore, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error(t('add.weekDataMissing'));
        const weekData = snap.data() as PlanWeek;
        const updatedDays = [...weekData.days];
        updatedDays[selectedDay] = {
          ...updatedDays[selectedDay]!,
          workout: template.kind,
          plannedTSS: template.tss,
          plannedDurationMin: template.durationMin,
          completed: false,
          skipped: false,
        };
        tx.update(ref, { days: updatedDays });
      });
      onUpdate();
      onClose();
    } catch (err) {
      console.error(t('add.addFailed'), err);
      alert(t('add.addFailedAlert'));
    } finally {
      setLoading(false);
    }
  }

  async function handleSetRest() {
    if (selectedDay < 0 || selectedDay >= days.length) return;
    setLoading(true);
    try {
      const ref = doc(firestore, "goals", goalId, "plan", weekId);
      await runTransaction(firestore, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error(t('add.weekDataMissing'));
        const weekData = snap.data() as PlanWeek;
        const updatedDays = [...weekData.days];
        updatedDays[selectedDay] = {
          ...updatedDays[selectedDay]!,
          workout: "rest" as WorkoutKind,
          plannedTSS: 0,
          plannedDurationMin: 0,
          completed: false,
          skipped: false,
        };
        tx.update(ref, { days: updatedDays });
      });
      onUpdate();
      onClose();
    } catch (err) {
      console.error(t('add.restFailed'), err);
    } finally {
      setLoading(false);
    }
  }

  const templates = discipline && discipline !== "rest" ? TEMPLATES_BY_DISCIPLINE[discipline] : [];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 999 }}
      />

      {/* Bottom sheet */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          background: "var(--bg-1)",
          borderRadius: "16px 16px 0 0",
          border: "1px solid var(--line-soft)",
          borderBottom: "none",
          maxHeight: "80vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{ width: 36, height: 4, background: "var(--line)", borderRadius: 2 }} />
        </div>

        {/* Header */}
        <div style={{ padding: "var(--space-2) var(--space-5) var(--space-4)", borderBottom: "1px solid var(--line-soft)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--ink-0)", margin: 0 }}>
              {t('add.title')}
            </h3>
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", color: "var(--ink-3)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 'var(--space-1)' }}
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ overflow: "auto", flex: 1, padding: "var(--space-4) var(--space-5) var(--space-6)" }}>
          {/* Step 1: 요일 선택 */}
          <div style={{ marginBottom: 'var(--space-5)' }}>
            <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 'var(--space-2)' }}>
              {t('add.selectDay')}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {availableDays.map(({ index, isRest, label }) => (
                <button
                  key={index}
                  onClick={() => setSelectedDay(index)}
                  style={{
                    flex: 1, padding: "10px 0", borderRadius: 6, fontSize: 13, fontWeight: 500,
                    background: selectedDay === index ? "var(--accent-soft-bg)" : "var(--bg-2)",
                    color: selectedDay === index ? "var(--lime)" : isRest ? "var(--ink-3)" : "var(--ink-1)",
                    border: `1px solid ${selectedDay === index ? "var(--accent-soft-border)" : "var(--line-soft)"}`,
                    cursor: "pointer",
                    opacity: isRest ? 1 : 0.7,
                  }}
                >
                  {label}
                  {!isRest && <div style={{ fontSize: 8, marginTop: 2 }}>●</div>}
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: 종목 선택 */}
          {selectedDay >= 0 && (
            <div style={{ marginBottom: 'var(--space-5)' }}>
              <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 'var(--space-2)' }}>
                {t('add.discipline')}
              </div>
              <div style={{ display: "flex", gap: 'var(--space-2)' }}>
                {([
                  { key: "bike" as Discipline, label: t('discipline.bike'), icon: <Bike size={18} />, color: "var(--aqua)" },
                  { key: "run" as Discipline, label: t('discipline.run'), icon: <Footprints size={18} />, color: "var(--amber)" },
                  { key: "swim" as Discipline, label: t('discipline.swim'), icon: <Waves size={18} />, color: "var(--lime)" },
                  { key: "rest" as Discipline, label: t('discipline.rest'), icon: <Moon size={18} />, color: "var(--ink-4)" },
                ]).map(({ key, label, icon, color }) => (
                  <button
                    key={key}
                    onClick={() => {
                      if (key === "rest") {
                        handleSetRest();
                      } else {
                        setDiscipline(key);
                      }
                    }}
                    style={{
                      flex: 1, padding: "var(--space-3) var(--space-2)", borderRadius: 8, fontSize: 12, fontWeight: 500,
                      background: discipline === key ? `color-mix(in oklch, ${color} 12%, var(--bg-2))` : "var(--bg-2)",
                      border: `1px solid ${discipline === key ? color : "var(--line-soft)"}`,
                      color: discipline === key ? color : "var(--ink-2)",
                      cursor: "pointer",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 'var(--space-1)',
                    }}
                  >
                    {icon}
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: 템플릿 선택 */}
          {discipline && discipline !== "rest" && templates.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 'var(--space-2)' }}>
                {t('add.selectWorkout')}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 'var(--space-2)' }}>
                {templates.map((t) => (
                  <button
                    key={t.kind}
                    onClick={() => handleSelectTemplate(t)}
                    disabled={loading || selectedDay < 0}
                    style={{
                      display: "flex", alignItems: "center", gap: 'var(--space-3)',
                      padding: "12px 14px", borderRadius: 8,
                      background: "var(--bg-2)", border: "1px solid var(--line-soft)",
                      cursor: loading ? "not-allowed" : "pointer",
                      textAlign: "left", opacity: loading ? 0.5 : 1,
                    }}
                  >
                    <div style={{ width: 4, height: 32, background: t.color, borderRadius: 2, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-0)" }}>{t.label}</div>
                      <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{t.desc}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: t.color, fontWeight: 600 }}>
                        {t.tss} TSS
                      </div>
                      <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-4)" }}>
                        {t.durationMin}{tCommon('unit.min')}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading && (
            <div style={{ textAlign: "center", padding: "16px 0", fontSize: 13, color: "var(--ink-3)" }}>
              {t('add.saving')}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
