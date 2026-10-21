import { isSportUiEnabled } from "../../config/sportFeatures";
import GlossaryText from "../common/GlossaryText";
import { useState, useMemo, useRef, useId } from "react";
import { useTranslation } from "react-i18next";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { firestore } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import { useDialog } from "../../contexts/DialogContext";
import type { PlanDay, PlanWeek, WorkoutKind } from "@shared/types/goal";
import { parseWorkoutFile, toIntervalBlocks, estimateWorkoutLoad } from "@shared/training/workoutImport";
import { usesEffectiveExecutionPrescription } from "@shared/training/effectiveExecutionPrescription";
import { Check, SkipForward, RefreshCw, ArrowUpDown, Undo2, Upload } from "lucide-react";

// ── 워크아웃 메타 (PlanPage와 동기화) ─────────────────────────────────

const WORKOUT_COLORS: Record<WorkoutKind, string> = {
  rest: 'transparent',
  rec: 'var(--ink-4)',
  z2: 'var(--aqua)',
  z2Long: 'var(--aqua)',
  tempo: 'var(--amber)',
  ftp: 'var(--rose)',
  vo2: 'var(--rose)',
  hillRepeats: 'var(--amber)',
  sim: 'var(--lime)',
  goal: 'var(--lime)',
  easyRun: 'var(--aqua)',
  tempoRun: 'var(--amber)',
  intervalRun: 'var(--rose)',
  longRun: 'var(--aqua)',
  recoveryRun: 'var(--ink-4)',
  easySwim: 'var(--aqua)',
  drillSwim: 'var(--amber)',
  intervalSwim: 'var(--rose)',
  longSwim: 'var(--aqua)',
  recoverySwim: 'var(--ink-4)',
  stridesRun: 'var(--aqua)',
  progressRun: 'var(--amber)',
  threshRun: 'var(--lime)',
  raceRun: 'var(--lime)',
  kickSwim: 'oklch(0.72 0.10 260)',
  enduranceSwim: 'var(--aqua)',
  cssSwim: 'var(--aqua)',
  racepaceSwim: 'var(--rose)',
  sprintSwim: 'var(--rose)',
  owSwim: 'oklch(0.70 0.09 220)',
  brickSwim: 'var(--amber)',
};

function buildWorkoutMeta(t: (key: string) => string): Record<WorkoutKind, { label: string; color: string }> {
  const labels: Record<WorkoutKind, string> = {
    rest: t('workouts.rest'),
    rec: t('workouts.rec'),
    z2: t('workouts.z2'),
    z2Long: t('workouts.z2Long'),
    tempo: t('workouts.tempo'),
    ftp: t('workouts.ftp'),
    vo2: t('workouts.vo2'),
    hillRepeats: t('workouts.hillRepeats'),
    sim: t('workouts.sim'),
    goal: t('workouts.goal'),
    easyRun: t('workouts.easyRun'),
    tempoRun: t('workouts.tempoRun'),
    intervalRun: t('workouts.intervalRun'),
    longRun: t('workouts.longRun'),
    recoveryRun: t('workouts.recoveryRun'),
    easySwim: t('workouts.easySwim'),
    drillSwim: t('workouts.drillSwim'),
    intervalSwim: t('workouts.intervalSwim'),
    longSwim: t('workouts.longSwim'),
    recoverySwim: t('workouts.recoverySwim'),
    stridesRun: t('workouts.stridesRun'),
    progressRun: t('workouts.progressRun'),
    threshRun: t('workouts.threshRun'),
    raceRun: t('workouts.raceRun'),
    kickSwim: t('workouts.kickSwim'),
    enduranceSwim: t('workouts.enduranceSwim'),
    cssSwim: t('workouts.cssSwim'),
    racepaceSwim: t('workouts.racepaceSwim'),
    sprintSwim: t('workouts.sprintSwim'),
    owSwim: t('workouts.owSwim'),
    brickSwim: t('workouts.brickSwim'),
  };
  const out = {} as Record<WorkoutKind, { label: string; color: string }>;
  (Object.keys(labels) as WorkoutKind[]).forEach((k) => {
    out[k] = { label: labels[k], color: WORKOUT_COLORS[k] };
  });
  return out;
}

const TSS_MAP: Record<WorkoutKind, number> = {
  rest: 0, rec: 25, z2: 65, z2Long: 180, tempo: 85, ftp: 110, vo2: 95, hillRepeats: 58, sim: 240, goal: 0,
  easyRun: 40, tempoRun: 70, intervalRun: 90, longRun: 120, recoveryRun: 20,
  easySwim: 30, drillSwim: 35, intervalSwim: 60, longSwim: 80, recoverySwim: 15,
  stridesRun: 30, progressRun: 95, threshRun: 85, raceRun: 160,
  kickSwim: 25, enduranceSwim: 45, cssSwim: 60, racepaceSwim: 70, sprintSwim: 50, owSwim: 55, brickSwim: 65,
};

const DURATION_MAP: Record<WorkoutKind, number> = {
  rest: 0, rec: 45, z2: 90, z2Long: 240, tempo: 75, ftp: 70, vo2: 60, hillRepeats: 42, sim: 300, goal: 0,
  easyRun: 45, tempoRun: 50, intervalRun: 55, longRun: 90, recoveryRun: 30,
  easySwim: 40, drillSwim: 45, intervalSwim: 50, longSwim: 60, recoverySwim: 30,
  stridesRun: 35, progressRun: 70, threshRun: 55, raceRun: 90,
  kickSwim: 30, enduranceSwim: 50, cssSwim: 45, racepaceSwim: 40, sprintSwim: 30, owSwim: 50, brickSwim: 60,
};

// Selectable workout kinds (휴식·목표일 제외)
const SELECTABLE_KINDS: WorkoutKind[] = [
  'rec', 'z2', 'z2Long', 'tempo', 'ftp', 'vo2', 'hillRepeats', 'sim',
  'easyRun', 'tempoRun', 'intervalRun', 'longRun', 'recoveryRun',
  'stridesRun', 'progressRun', 'threshRun', 'raceRun',
  'easySwim', 'drillSwim', 'intervalSwim', 'longSwim', 'recoverySwim',
  'kickSwim', 'enduranceSwim', 'cssSwim', 'racepaceSwim', 'sprintSwim', 'owSwim', 'brickSwim',
];

import { useTrainingDialog } from "./useTrainingDialog";
import { createPortal } from "react-dom";
import { KINDS_BY_DISCIPLINE } from "../../utils/workoutDiscipline";
import { Button, Text } from "../../theme/components";

// ── Props ─────────────────────────────────────────────────────────────

export interface WorkoutEditModalProps {
  day: PlanDay;
  weekId: string;
  weekAdjustmentReason?: string;
  dayIndex: number;
  goalId: string;
  goalDiscipline?: "bike" | "run" | "swim";
  onClose: () => void;
  onUpdate: () => void;
}

// ── Component ─────────────────────────────────────────────────────────

const SERVER_OUTCOME_FIELDS = [
  "actualActivityId", "actualTSS", "matchMethod", "matchConfidence", "probableActivityId", "probableTSS",
  "probableMatchMethod", "probableMatchConfidence", "executionStatus", "postponedToLocalDate",
] as const;

export default function WorkoutEditModal({
  day,
  weekId,
  weekAdjustmentReason,
  dayIndex,
  goalId,
  goalDiscipline,
  onClose,
  onUpdate,
}: WorkoutEditModalProps) {
  const { t } = useTranslation('training');
  const dialog = useDialog();
  const WORKOUT_META = useMemo(() => buildWorkoutMeta(t), [t]);
  const [loading, setLoading] = useState(false);
  const [showKindPicker, setShowKindPicker] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const modalRef = useTrainingDialog(onClose, loading);
  const titleId = useId();
  const closeIfIdle = () => { if (!loading) onClose(); };
  // Firestore rules 가 거부하는 쓰기를 UI 에서 먼저 막는다 — 러닝 목표, 또는 서버가 활동 연결·
  // 실행 결과를 기록한 날의 completed/skipped 변경은 permission-denied 로 끝난다.
  // 필드 목록은 rules 의 hasExecutionOutcome 과 같다. 서버 전용 필드라 PlanDay 타입에는 없다.
  const serverFields = day as PlanDay & Partial<Record<typeof SERVER_OUTCOME_FIELDS[number], unknown>>;
  const hasServerOutcome = SERVER_OUTCOME_FIELDS.some((field) => serverFields[field] != null);
  const outcomeLocked = hasServerOutcome || goalDiscipline === 'run';

  const meta = WORKOUT_META[day.workout] ?? { label: String(day.workout), color: 'var(--ink-4)' };

  // ── Firestore 헬퍼 ─────────────────────────────────────────────────

  async function readWeek(): Promise<{ ref: ReturnType<typeof doc>; data: PlanWeek }> {
    const ref = doc(firestore, "goals", goalId, "plan", weekId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error(t('edit.weekDataMissing'));
    const data = { id: snap.id, ...snap.data() } as PlanWeek;
    if (!Number.isInteger(dayIndex) || dayIndex < 0 || data.days?.[dayIndex]?.date !== day.date) {
      throw new Error(t('edit.staleDay'));
    }
    return { ref, data };
  }

  async function run(fn: (days: PlanDay[]) => void) {
    setLoading(true);
    try {
      const { ref, data } = await readWeek();
      const days = [...data.days];
      if (dayIndex >= days.length) { throw new Error(t('edit.rangeError')); }
      fn(days);
      await updateDoc(ref, { days });
      onUpdate();
      onClose();
    } catch (err) {
      logClientError("WorkoutEditModal.run", err, { goalId, weekId, dayIndex });
      void dialog.alert(t('edit.saveFailedAlert'), { variant: "danger" });
    } finally {
      setLoading(false);
    }
  }

  // ── 핸들러 ─────────────────────────────────────────────────────────

  function handleToggleCompleted() {
    if (outcomeLocked) return;
    run((days) => {
      const d = days[dayIndex]!;
      days[dayIndex] = { ...d, completed: !d.completed };
    });
  }

  function handleSkip() {
    if (outcomeLocked) return;
    run((days) => {
      const d = days[dayIndex]!;
      days[dayIndex] = { ...d, skipped: !d.skipped };
    });
  }

  async function handleChangeWorkout(newKind: WorkoutKind) {
    await run((days) => {
      const d = days[dayIndex]!;
      days[dayIndex] = {
        ...d,
        workout: newKind,
        executionWorkoutOverride: newKind,
        plannedTSS: TSS_MAP[newKind],
        plannedDurationMin: DURATION_MAP[newKind],
      };
      // 프리셋 선택은 절대 강도 입력이 아니다. 이전 생성기의 구간 증명을 새 프리셋에 붙이지 않는다.
      delete days[dayIndex]!.prescriptionIntensityProvenance;
      delete days[dayIndex]!.adjustedTSS;
      delete days[dayIndex]!.adjustedDurationMin;
      delete (days[dayIndex]! as PlanDay & { closedLoopAdjustment?: unknown }).closedLoopAdjustment;
    });
  }

  // #476 구조화 워크아웃 파일(.zwo/.erg/.mrc) 임포트 → 해당 날짜에 인터벌 저장 + 부하 갱신.
  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 허용
    if (!file) return;
    if (file.size > 1024 * 1024) { void dialog.alert(t('edit.importTooLarge'), { variant: "warning" }); return; }
    setLoading(true);
    // 파일 읽기·파싱·FTP 조회·저장을 단일 try 로 보호 — 어느 단계 실패든 로딩 해제 + alert + 로깅.
    // (이전엔 getDoc 이 catch 밖이라 실패 시 모달이 영구 로딩 고착되고 rejection 이 삼켜짐.)
    try {
      const parsed = parseWorkoutFile(file.name, await file.text());
      if (!parsed) { void dialog.alert(t('edit.importUnsupported'), { variant: "warning" }); setLoading(false); return; }
      // 상대 강도 파일은 현재 계획과 같은 값·출처의 근거로 환산한다. 과거 시작값을 섞지 않는다.
      const goalSnap = await getDoc(doc(firestore, "goals", goalId));
      const goal = goalSnap.data();
      const planInputs = goal?.planInputSources ?? goal?.snapshot;
      const rawFtp = planInputs?.ftp;
      if ((planInputs?.ftpSource === "user" || planInputs?.ftpSource === "pdc_estimate")
        && (typeof rawFtp !== "number" || !Number.isFinite(rawFtp) || rawFtp <= 0)) throw new Error("Invalid plan FTP basis");
      const ftp = (rawFtp as number | undefined) ?? 200;
      const intervals = toIntervalBlocks(parsed, ftp);
      const load = estimateWorkoutLoad(parsed);
      // run() 이 자체 finally 로 로딩 해제 + onClose 처리.
      await run((days) => {
        const d = days[dayIndex]!;
        days[dayIndex] = {
          ...d,
          intervals,
          workoutName: parsed.name ?? file.name.replace(/\.(zwo|erg|mrc)$/i, ""),
          plannedDurationMin: load.durationMin,
          plannedTSS: load.tss,
        };
        // 파일은 FTP 분율을 환산한 값이다. 사용자 절대 입력으로 승격하거나 원래 생성기 증명을 재사용하지 않는다.
        delete days[dayIndex]!.prescriptionIntensityProvenance;
        delete days[dayIndex]!.executionWorkoutOverride;
        delete days[dayIndex]!.adjustedTSS;
        delete days[dayIndex]!.adjustedDurationMin;
        delete (days[dayIndex]! as PlanDay & { closedLoopAdjustment?: unknown }).closedLoopAdjustment;
      });
    } catch (err) {
      logClientError("WorkoutEditModal.handleImportFile", err, { goalId, weekId, dayIndex, fileName: file.name });
      void dialog.alert(t('edit.importFailedAlert'), { variant: "danger" });
      setLoading(false);
    }
  }

  async function handleSwapNext() {
    // 같은 주의 바로 다음 날과 교환 (휴식일 포함)
    setLoading(true);
    try {
      const { ref, data } = await readWeek();
      const days = [...data.days];

      if (dayIndex >= days.length) { throw new Error(t('edit.rangeError')); }
      const nextIdx = dayIndex + 1;
      if (nextIdx >= days.length || !days[nextIdx] || days[nextIdx]!.workout === 'goal' || days[dayIndex]!.workout === 'goal') {
        void dialog.alert(t('edit.swapNoNext'), { variant: "warning" });
        setLoading(false);
        return;
      }

      // workout / plannedTSS / plannedDurationMin 필드만 교환
      const cur = days[dayIndex]!;
      const nxt = days[nextIdx]!;
      days[dayIndex] = {
        ...cur,
        workout: nxt.workout,
        plannedTSS: nxt.plannedTSS,
        plannedDurationMin: nxt.plannedDurationMin,
      };
      days[nextIdx] = {
        ...nxt,
        workout: cur.workout,
        plannedTSS: cur.plannedTSS,
        plannedDurationMin: cur.plannedDurationMin,
      };

      await updateDoc(ref, { days });
      onUpdate();
      onClose();
    } catch (err) {
      logClientError("WorkoutEditModal.handleSwapNext", err, { goalId, weekId, dayIndex });
      void dialog.alert(t('edit.swapFailedAlert'), { variant: "danger" });
    } finally {
      setLoading(false);
    }
  }

  async function handleSwapPrev() {
    // 같은 주의 바로 이전 날과 교환 (휴식일 포함)
    setLoading(true);
    try {
      const { ref, data } = await readWeek();
      const days = [...data.days];

      if (dayIndex >= days.length) { throw new Error(t('edit.rangeError')); }
      if (dayIndex === 0) {
        void dialog.alert(t('edit.swapNoPrev'), { variant: "warning" });
        setLoading(false);
        return;
      }
      const prevIdx = dayIndex - 1;
      if (!days[prevIdx] || days[prevIdx]!.workout === 'goal' || days[dayIndex]!.workout === 'goal') {
        void dialog.alert(t('edit.swapNoPrevValid'), { variant: "warning" });
        setLoading(false);
        return;
      }

      // workout / plannedTSS / plannedDurationMin 필드만 교환
      const cur = days[dayIndex]!;
      const prv = days[prevIdx]!;
      days[dayIndex] = {
        ...cur,
        workout: prv.workout,
        plannedTSS: prv.plannedTSS,
        plannedDurationMin: prv.plannedDurationMin,
      };
      days[prevIdx] = {
        ...prv,
        workout: cur.workout,
        plannedTSS: cur.plannedTSS,
        plannedDurationMin: cur.plannedDurationMin,
      };

      await updateDoc(ref, { days });
      onUpdate();
      onClose();
    } catch (err) {
      logClientError("WorkoutEditModal.handleSwapPrev", err, { goalId, weekId, dayIndex });
      void dialog.alert(t('edit.swapFailedAlert'), { variant: "danger" });
    } finally {
      setLoading(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────

  return createPortal(
    <>
      <div data-dialog-initial-focus data-testid="K4-6-7" onClick={closeIfIdle} className="bg-black/50" style={{ position: 'fixed', inset: 0, zIndex: 117 }} />
      <div className="coach-training-dialog" ref={modalRef} role="dialog" tabIndex={-1} data-testid="K4-6" aria-modal="true" aria-busy={loading} aria-label={meta.label}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 118,
          width: 'min(100% - var(--space-6), 24rem)',
          maxHeight: 'calc(100dvh - var(--space-6))',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          background: 'var(--bg-1)',
          color: 'var(--ink-0)',
          border: '1px solid var(--line-soft)',
          borderRadius: 'var(--r-lg)',
          boxShadow: 'var(--shadow-lg)',
          padding: 'var(--space-5)',
          display: 'flex',
          flexDirection: 'column',
          gap: "var(--space-3)",
        }}
      >
        {/* Header */}
        <div data-testid="K4-6-1" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span
              style={{
                width: 4,
                height: 20,
                background: meta.color,
                borderRadius: "var(--r-xs)",
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            <div>
              <Text as="h2" variant="title" id={titleId} style={{ margin: 0 }}>
                <GlossaryText>{meta.label}</GlossaryText>
              </Text>
              {day.plannedTSS > 0 && (
                <div style={{ fontSize: "var(--fs-md)", color: 'var(--ink-3)' }}>
                  <GlossaryText>{t('edit.minutesAndTss', { tss: day.plannedTSS, minutes: day.plannedDurationMin })}</GlossaryText>
                </div>
              )}
            </div>
          </div>
          <button
            data-dialog-initial-focus data-testid="K4-6-7" onClick={closeIfIdle} disabled={loading}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ink-3)',
              cursor: 'pointer',
              padding: 'var(--space-1)',
              fontSize: "var(--fs-base)",
              lineHeight: 1,
            }}
            aria-label={t('edit.closeAria')}
          >
            ✕
          </button>
        </div>

        {/* 활동 링크 */}
        {day.actualActivityId && (
          <a
            href={`/activity/${day.actualActivityId}`}
            style={{
              fontSize: "var(--fs-md)",
              color: 'var(--lime)',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            {t('edit.linkedActivity')}
          </a>
        )}

        {/* #476 임포트된 구조화 워크아웃 요약 */}
        {!usesEffectiveExecutionPrescription(day, weekAdjustmentReason) && day.intervals && day.intervals.length > 0 && (
          <div style={{ fontSize: "var(--fs-md)", color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Upload size={12} style={{ color: 'var(--aqua)', flexShrink: 0 }} />
            <span>
              {day.workoutName ? `${day.workoutName} · ` : ''}
              {t('edit.importedIntervals', { count: day.intervals.length })}
            </span>
          </div>
        )}

        {/* 액션 버튼들 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {hasServerOutcome && (
            <div style={{ fontSize: "var(--fs-md)", color: 'var(--ink-3)' }}>
              {t('edit.serverOutcomeLocked')}
            </div>
          )}
          {goalDiscipline === 'run' && (
            <div style={{ fontSize: "var(--fs-md)", color: 'var(--ink-3)' }}>
              {t('edit.runningOutcomeLocked')}
            </div>
          )}
          {/* 완료 토글 */}
          <Button variant="secondary" size="sm"
            data-testid="K4-6-2" onClick={handleToggleCompleted}
            disabled={loading || outcomeLocked}
            style={{ justifyContent: 'flex-start', gap: 'var(--space-2)' }}
          >
            {day.completed ? <Undo2 size={14} /> : <Check size={14} />}
            {day.completed ? t('edit.uncheckCompleted') : t('edit.markCompleted')}
          </Button>

          {/* 건너뛰기 / 건너뛰기 취소 */}
          <Button variant="secondary" size="sm"
            data-testid="K4-6-3" onClick={handleSkip}
            disabled={loading || outcomeLocked}
            style={{ justifyContent: 'flex-start', gap: 'var(--space-2)', color: day.skipped ? 'var(--lime)' : 'var(--amber)' }}
          >
            {day.skipped ? <Undo2 size={14} /> : <SkipForward size={14} />}
            {day.skipped ? t('edit.unskip') : t('edit.skip')}
          </Button>

          {/* 워크아웃 변경 */}
          <Button variant="secondary" size="sm"
            data-testid="K4-6-4" onClick={() => setShowKindPicker((v) => !v)}
            disabled={loading}
            style={{ justifyContent: 'flex-start', gap: 'var(--space-2)' }}
          >
            <RefreshCw size={14} /> {t('edit.changeWorkout')}
          </Button>

          {/* 워크아웃 종류 선택 칩 */}
          {showKindPicker && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: "var(--space-2)",
                padding: "var(--space-2) 0 var(--space-1)",
              }}
            >
              {(goalDiscipline ? KINDS_BY_DISCIPLINE[goalDiscipline] ?? SELECTABLE_KINDS : SELECTABLE_KINDS).filter(kind => isSportUiEnabled("swim") || !kind.toLowerCase().includes("swim") || (goalDiscipline === "swim" && kind === day.workout)).map((kind) => {
                const m = WORKOUT_META[kind];
                const isSelected = day.workout === kind;
                return (
                  <Button variant="secondary"
                    key={kind}
                    onClick={() => handleChangeWorkout(kind)}
                    disabled={loading || isSelected}
                    aria-pressed={isSelected}
                    style={{
                      height: "var(--dim-button-height)",
                      minHeight: "var(--dim-button-height)",
                      padding: "0 var(--space-3)",
                      borderRadius: "var(--r-md)",
                      fontSize: "var(--fs-md)",
                      fontWeight: 600,
                      cursor: isSelected ? 'default' : 'pointer',
                      border: `1px solid ${m.color === 'transparent' ? 'var(--line-soft)' : m.color}`,
                      background: isSelected
                        ? m.color === 'transparent' ? 'var(--bg-2)' : m.color
                        : 'transparent',
                      color: isSelected
                        ? (m.color === 'var(--lime)' || m.color === 'var(--aqua)') ? 'var(--primary-fg)' : 'var(--ink-0)'
                        : m.color === 'transparent' ? 'var(--ink-2)' : m.color,
                      opacity: isSelected ? 1 : 0.85,
                    }}
                  >
                    {m.label}
                  </Button>
                );
              })}
            </div>
          )}

          {showKindPicker && <details style={{ fontSize: 'var(--fs-md)', color: 'var(--ink-2)', lineHeight: 1.6 }}>
            <summary>{t('intensity')}</summary>
            <div data-testid="workout-intensity-glossary"><GlossaryText>{"Z1 · Z2 · Z3 · Z4 · Z5 · FTP · VO₂max · SST · LSD · TSS"}</GlossaryText></div>
          </details>}

          {/* 이전 날과 교환 */}
          <Button variant="secondary" size="sm"
            data-testid="K4-6-5" onClick={handleSwapPrev}
            disabled={loading}
            style={{ justifyContent: 'flex-start', gap: 'var(--space-2)' }}
          >
            <ArrowUpDown size={14} /> {t('edit.swapPrev')}
          </Button>

          {/* 다음 날과 교환 */}
          <Button variant="secondary" size="sm"
            data-testid="K4-6-5" onClick={handleSwapNext}
            disabled={loading}
            style={{ justifyContent: 'flex-start', gap: 'var(--space-2)' }}
          >
            <ArrowUpDown size={14} /> {t('edit.swapNext')}
          </Button>

          {/* #476 구조화 워크아웃 파일 임포트 (.zwo/.erg/.mrc) */}
          <Button variant="secondary" size="sm"
            data-testid="K4-6-6" onClick={() => fileRef.current?.click()}
            disabled={loading}
            style={{ justifyContent: 'flex-start', gap: 'var(--space-2)' }}
          >
            <Upload size={14} /> {t('edit.importWorkout')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".zwo,.erg,.mrc"
            hidden
            onChange={handleImportFile}
          />
        </div>

        {loading && (
          <div style={{ fontSize: "var(--fs-md)", color: 'var(--ink-3)', textAlign: 'center' }}>
            {t('edit.saving')}
          </div>
        )}
      </div>
    </>, document.body
  );
}
