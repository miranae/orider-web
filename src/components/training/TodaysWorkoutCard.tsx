import { useEffect, useRef, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { httpsCallable } from "firebase/functions";
import { collection, query, where, orderBy, limit, getDocs, doc, onSnapshot } from "firebase/firestore";
import { functions, firestore } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import { useAuth } from "../../contexts/AuthContext";
import type { WorkoutKind, IntervalBlock, Goal, FitnessProjection } from "@shared/types/goal";
import { getDiscipline, getDisciplineIcon, getDisciplineLabelKey } from "../../utils/disciplineFilter";
import { useFreshTraining } from "../../hooks/useFreshTraining";
import { useTrainingSummary } from "../../hooks/useTrainingSummary";
import { estimateActivityLoad } from "../../utils/fitnessMetrics";
import { useTodaysNarrative } from "../../hooks/useTodaysNarrative";
import { useTodaysNarrativePeek, invalidateTodaysNarrativePeekCache } from "../../hooks/useTodaysNarrativePeek";
import { recommendToday, type RecommendationFacts, type RecommendationType, type ToneColor, type RecDiscipline } from "../../utils/todaysRecommendation";
import { composeFallbackNarrative } from "../../utils/recommendationComposer";
import { RevalidatingIndicator } from "./RevalidatingIndicator";
import AdjustedChip from "./AdjustedChip";
import { Card, Chip, Text } from "../../theme/components";

// ── 워크아웃 이름 매핑 ────────────────────────────────────────────────────────

function buildWorkoutLabels(t: (key: string) => string): Record<WorkoutKind, string> {
  return {
    rest: t('workouts.rest'),
    rec: t('workouts.rec'),
    z2: t('workouts.z2'),
    z2Long: t('workouts.z2Long'),
    tempo: t('workouts.tempo'),
    ftp: t('workouts.ftp'),
    vo2: t('workouts.vo2Max'),
    sim: t('workouts.simFull'),
    goal: t('workouts.goalEmoji'),
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
    progressRun: t('workouts.progressRunFull'),
    threshRun: t('workouts.threshRun'),
    raceRun: t('workouts.raceRunFull'),
    kickSwim: t('workouts.kickSwim'),
    enduranceSwim: t('workouts.enduranceSwim'),
    cssSwim: t('workouts.cssSwim'),
    racepaceSwim: t('workouts.racepaceSwim'),
    sprintSwim: t('workouts.sprintSwimFull'),
    owSwim: t('workouts.owSwimFull'),
    brickSwim: t('workouts.brickSwimFull'),
  };
}

// ── 워크아웃 카테고리 (목적/효과 설명용) ─────────────────────────────────────

type WorkoutCategory =
  | "rest" | "recovery" | "base" | "long" | "tempo" | "threshold"
  | "vo2" | "simulation" | "specialty" | "goal";

function getWorkoutCategory(w: WorkoutKind): WorkoutCategory {
  if (w === "rest") return "rest";
  if (w === "rec" || w === "recoveryRun" || w === "recoverySwim") return "recovery";
  if (w === "z2" || w === "easyRun" || w === "easySwim" || w === "enduranceSwim") return "base";
  if (w === "z2Long" || w === "longRun" || w === "longSwim") return "long";
  if (w === "tempo" || w === "tempoRun" || w === "progressRun") return "tempo";
  if (w === "ftp" || w === "threshRun" || w === "cssSwim") return "threshold";
  if (
    w === "vo2" || w === "intervalRun" || w === "intervalSwim" ||
    w === "racepaceSwim" || w === "sprintSwim"
  ) return "vo2";
  if (w === "sim" || w === "raceRun") return "simulation";
  if (w === "goal") return "goal";
  return "specialty"; // strides/drills/kicks/owSwim/brickSwim
}

// ── plan 워크아웃 → RecommendationFacts 매핑 ───────────────────────────────
// LLM narrative 호출에 facts 가 필요한데, plan-driven 케이스에선 룰엔진을 거치지 않으므로
// plan 워크아웃 종류 + 사용자 상태(TSB/recent7d)에서 facts 를 직접 합성한다.

function workoutToRecType(w: WorkoutKind): RecommendationType {
  const cat = getWorkoutCategory(w);
  if (cat === "rest" || cat === "recovery") return "recovery";
  if (cat === "base" || cat === "long" || cat === "specialty") return "endurance";
  if (cat === "tempo") return "tempo";
  if (cat === "threshold") return "threshold";
  if (cat === "vo2") return "vo2";
  if (cat === "simulation") return "threshold";
  if (cat === "goal") return "taper";
  return "endurance";
}

function workoutToZone(w: WorkoutKind): 1 | 2 | 3 | 4 | 5 {
  const cat = getWorkoutCategory(w);
  if (cat === "rest" || cat === "recovery") return 1;
  if (cat === "base" || cat === "long" || cat === "specialty") return 2;
  if (cat === "tempo") return 3;
  if (cat === "threshold" || cat === "simulation" || cat === "goal") return 4;
  if (cat === "vo2") return 5;
  return 2;
}

function tsbTone(tsb: number): ToneColor {
  if (tsb <= -15) return "rose";
  if (tsb < 5) return "amber";
  return "lime";
}

/**
 * Plan generator 가 run/swim goal 에도 generic(bike-style) workout kind 를 저장한 경우를
 * 디스플레이/라벨링 측에서 종목별 kind 로 매핑. 데이터를 고치는 게 아니라 표시 보정.
 */
function applyDisciplineToWorkout(w: WorkoutKind, d: RecDiscipline): WorkoutKind {
  if (d === "run") {
    const m: Partial<Record<WorkoutKind, WorkoutKind>> = {
      rec: "recoveryRun", z2: "easyRun", z2Long: "longRun",
      tempo: "tempoRun", ftp: "threshRun", vo2: "intervalRun",
    };
    return m[w] ?? w;
  }
  if (d === "swim") {
    const m: Partial<Record<WorkoutKind, WorkoutKind>> = {
      rec: "recoverySwim", z2: "easySwim", z2Long: "longSwim",
      tempo: "enduranceSwim", ftp: "cssSwim", vo2: "intervalSwim",
    };
    return m[w] ?? w;
  }
  return w;
}

// ── 인터벌 블록 색상 및 높이 ──────────────────────────────────────────────────

const BLOCK_COLOR: Record<IntervalBlock["label"], string> = {
  WU: "var(--ink-3)",
  CD: "var(--ink-3)",
  Z1: "var(--ink-4)",
  Z2: "var(--aqua)",
  Z3: "var(--amber)",
  Z4: "var(--rose)",
  Z5: "var(--rose)",
  R: "var(--bg-3)",
};

const BLOCK_HEIGHT_PCT: Record<IntervalBlock["label"], number> = {
  WU: 40,
  CD: 40,
  Z1: 30,
  Z2: 60,
  Z3: 80,
  Z4: 100,
  Z5: 100,
  R: 30,
};

// ── CF 응답 타입 ──────────────────────────────────────────────────────────────

interface WorkoutDetail {
  workout: WorkoutKind;
  workoutName?: string;
  duration: number;
  tss: number;
  intervals: IntervalBlock[];
  intervalSummary?: string;
  courseName?: string;
  daysLeft: number;
  weekNumber: number;
  phase: string;
  weekCompleted: number;
  weekTotal: number;
  tsb: number;
  ctlDelta: number;
  recommendation?: string;
  /** 어제/최근 컨텍스트 기반의 한 줄 설명 ("어제 강도 후 → 오늘은 회복 베이스") */
  contextNarration?: string;
  discipline?: "bike" | "run" | "swim";
  // 오늘 활동 완료 상태
  completed?: boolean;
  actualTSS?: number | null;
  actualActivityId?: string | null;
  // Phase 3: 자동 적응 메타
  isAdjusted?: boolean;
  adjustmentFactor?: number | null;
  plannedTSSOriginal?: number | null;
  adaptationFlag?: {
    severity: "info" | "warn" | "critical";
    reason?: string;
    snoozedUntil?: number;
    shouldRerollSuggested?: boolean;
  } | null;
}

interface TodaysWorkoutCFResponse {
  todaysWorkout: WorkoutDetail | null;
}

// ── 인터벌 구조 바 ────────────────────────────────────────────────────────────

function IntervalBar({ intervals }: { intervals: IntervalBlock[] }) {
  const { t } = useTranslation('training');
  const totalMin = intervals.reduce((s, b) => s + b.durationMin, 0) || 1;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const hover = hoverIdx != null ? intervals[hoverIdx] : null;
  // 호버 블록의 중심 위치(%) — 가변 폭이라 누적 오프셋으로 계산, 양 끝은 [10%, 90%] 클램프
  let anchorPct = 0;
  if (hoverIdx != null) {
    const before = intervals.slice(0, hoverIdx).reduce((s, b) => s + b.durationMin, 0);
    anchorPct = Math.min(Math.max(((before + intervals[hoverIdx]!.durationMin / 2) / totalMin) * 100, 10), 90);
  }
  return (
    <div style={{ position: "relative", margin: "10px 0 4px" }}>
      <div
        style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 32 }}
        onPointerLeave={() => setHoverIdx(null)}
      >
        {intervals.map((block, i) => {
          const widthPct = (block.durationMin / totalMin) * 100;
          const heightPct = BLOCK_HEIGHT_PCT[block.label] ?? 50;
          return (
            <div
              key={i}
              onPointerEnter={() => setHoverIdx(i)}
              style={{
                flex: `0 0 ${widthPct}%`,
                height: `${heightPct}%`,
                background: BLOCK_COLOR[block.label] ?? "var(--bg-3)",
                borderRadius: 2,
                minWidth: 3,
                opacity: hoverIdx != null && hoverIdx !== i ? 0.5 : 1,
                transition: "opacity 0.12s",
                cursor: "default",
              }}
            />
          );
        })}
      </div>
      {hover && (
        <div
          style={{
            position: "absolute",
            top: -6,
            left: `${anchorPct}%`,
            transform: "translate(-50%, -100%)",
            background: "var(--bg-1)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-md)",
            boxShadow: "var(--shadow-md)",
            padding: "var(--space-2) var(--space-3)",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 5,
            fontSize: "var(--fs-xs)",
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
            color: "var(--ink-0)",
          }}
        >
          {t('today.intervalTitle', { label: hover.label, minutes: hover.durationMin })}
        </div>
      )}
    </div>
  );
}

// ── 사실 칩 빌더 ──────────────────────────────────────────────────────────────

interface FactChip {
  label: string;
  tone?: ToneColor;
  /** mono 폰트로 표시 (수치 강조용). */
  mono?: boolean;
}

function makeFactChips(
  args: {
    tsb: number;
    recent7d: number;
    daysSinceLastActivity: number | null;
    goalDaysUntil: number | null;
  },
  t: (key: string, opts?: Record<string, unknown>) => string,
): FactChip[] {
  const tsbStr = `${args.tsb >= 0 ? "+" : ""}${args.tsb.toFixed(1)}`;
  const daysLabel = args.daysSinceLastActivity == null
    ? t('today.noActivityRecord')
    : args.daysSinceLastActivity === 0
    ? t('today.activityToday')
    : args.daysSinceLastActivity === 1
    ? t('today.activityYesterday')
    : t('today.activityDaysAgo', { count: args.daysSinceLastActivity });
  return [
    { label: `TSB ${tsbStr}`, tone: tsbTone(args.tsb), mono: true },
    { label: t('today.sevenDayTss', { value: Math.round(args.recent7d) }), mono: true },
    { label: daysLabel, mono: true },
    ...(args.goalDaysUntil != null ? [{ label: `D-${args.goalDaysUntil}`, mono: true } as FactChip] : []),
  ];
}

// ── 주간 권장부하 스트립 (G5) ─────────────────────────────────────────────────
// "이번 주 목표 wTSS lo–hi · 현재 누적 Y · 남은 Z" + Balance 방향 칩.
// 디자인 토큰만 사용 (hex/px 인라인 금지 룰 준수 — var() + space 토큰).

function WeeklyLoadStrip({
  facts,
  accumulated,
  t,
}: {
  facts: RecommendationFacts;
  accumulated: number | null;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  if (!facts.weeklyTargetTss || !facts.balanceGuide) return null;
  const [lo, hi] = facts.weeklyTargetTss;
  const bg = facts.balanceGuide;
  const phaseTone: ToneColor =
    bg.phase === "recovery" ? "rose" : bg.phase === "taper" ? "lime" : "amber";
  const remaining = facts.remainingTss;
  return (
    <div
      style={{
        marginTop: "var(--space-3)",
        padding: "var(--space-3)",
        background: `color-mix(in oklch, var(--${phaseTone}) 6%, var(--bg-2))`,
        border: `1px solid color-mix(in oklch, var(--${phaseTone}) 28%, transparent)`,
        borderRadius: "var(--r-md)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          marginBottom: "var(--space-2)",
          flexWrap: "wrap",
        }}
      >
        <Text as="div" variant="eyebrow" style={{ color: `var(--${phaseTone})` }}>
          {t("today.weeklyLoadLabel")}
        </Text>
        <span
          style={{
            padding: "2px 8px",
            background: `color-mix(in oklch, var(--${phaseTone}) 16%, var(--bg-1))`,
            border: `1px solid color-mix(in oklch, var(--${phaseTone}) 40%, transparent)`,
            color: `var(--${phaseTone})`,
            borderRadius: 999,
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
          }}
        >
          {t(`today.balancePhase.${bg.phase}`)}
        </span>
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          color: "var(--ink-1)",
          fontWeight: 600,
        }}
      >
        {t("today.weeklyTargetRange", { lo, hi })}
        {accumulated != null && (
          <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>
            {" · "}
            {t("today.weeklyAccumulated", { value: Math.round(accumulated) })}
            {remaining != null && (
              <>
                {" · "}
                <span style={{ color: `var(--${phaseTone})`, fontWeight: 600 }}>
                  {t("today.weeklyRemaining", { value: remaining })}
                </span>
              </>
            )}
          </span>
        )}
      </div>
      <div
        style={{
          marginTop: "var(--space-2)",
          fontSize: 12,
          color: "var(--ink-2)",
          lineHeight: 1.5,
        }}
      >
        <span style={{ fontFamily: "var(--font-mono)", color: `var(--${phaseTone})`, fontWeight: 600 }}>
          {t("today.balanceDirection", { lo: bg.lo, hi: bg.hi })}
        </span>
        {" — "}
        {bg.note}
      </div>
    </div>
  );
}

// ── Hero Card 렌더 헬퍼 ────────────────────────────────────────────────────────
// plan 모드/룰엔진 모드 양쪽에서 공용. plan-only extras 는 ReactNode 슬롯으로 전달.

interface HeroCardOpts {
  tone: ToneColor;
  eyebrow: string;
  sessionName: string;
  headerChips: string[];
  factChips: FactChip[];
  narrativeText: string;
  isLLM: boolean;
  llmLoading: boolean;
  /** narrative 생성 phase — preparing/calling 시 사용자에게 상태 표시. */
  llmPhase?: "idle" | "preparing" | "calling" | "ready";
  /**
   * true = 서버에 오늘 AI 분석 캐시 없음. "분석시작" 버튼 표시용.
   * undefined/false = 분석 있거나 아직 peek 확인 전.
   */
  llmCacheMiss?: boolean;
  /** "분석시작" 버튼 클릭 핸들러 — llmCacheMiss=true 시 표시됨. */
  onRequestAnalysis?: () => void;
  /**
   * "다시분석" 버튼 핸들러. undefined 이면 버튼 자체를 숨김.
   * onReanalyze 가 정의됐을 때 reanalyzable=false 면 버튼은 disabled + "최신 상태" 힌트.
   */
  onReanalyze?: (() => void) | null;
  /** true = 저장된 facts 가 현재 facts 와 달라 재생성 가능 상태. */
  reanalyzable?: boolean;
  revalidating: boolean;
  justRecomputed: boolean;
  revalidatingMsg: string;
  revalidatedMsg: string;
  llmPreparingMsg: string;
  llmCallingMsg: string;
  cta?: { href: string; label: string; emphasis?: boolean };
  // plan-only slots — 워크아웃 카드일 때만 채워짐
  topRightExtras?: React.ReactNode; // 완료/조정 chip 등
  detailLine?: React.ReactNode;     // 75분 · 85 TSS / 달성률
  intervalBar?: React.ReactNode;
}

function HeroCard(opts: HeroCardOpts) {
  const { t } = useTranslation('training');
  const paragraphs = opts.narrativeText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  // 다문단 narrative 의 fold — 오늘의 워크아웃은 킬러 컨텐츠라 기본 펼침으로 전문 노출.
  // 길게 느껴지면 "접기" 로 lede(p1) 만 남길 수 있다. 단일 문단은 fold 불필요.
  const [expanded, setExpanded] = useState(true);
  const canFold = paragraphs.length > 1;
  const visibleParagraphs = canFold && !expanded ? paragraphs.slice(0, 1) : paragraphs;
  return (
    <Card
      padding="none"
      style={{
        padding: 0,
        borderLeft: `3px solid var(--${opts.tone})`,
        overflow: "hidden",
      }}
    >
      {/* 헤더 — tone 그라데이션 */}
      <div
        style={{
          padding: "16px 18px 14px",
          background: `linear-gradient(180deg, color-mix(in oklch, var(--${opts.tone}) 6%, var(--bg-1)) 0%, var(--bg-1) 100%)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: 6, flexWrap: "wrap" }}>
          <Text as="div" variant="eyebrow" style={{ color: `var(--${opts.tone})`, flexShrink: 0 }}>
            {opts.eyebrow}
          </Text>
          <RevalidatingIndicator
            visible={opts.revalidating || opts.justRecomputed}
            mode={opts.revalidating ? "updating" : "success"}
            message={opts.revalidating ? opts.revalidatingMsg : opts.revalidatedMsg}
          />
          <div style={{ flex: 1 }} />
          {opts.topRightExtras}
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--ink-0)", margin: "0 0 var(--space-2)", lineHeight: 1.25, letterSpacing: "-0.01em" }}>
          {opts.sessionName}
        </h2>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {opts.headerChips.map((chip, i) => (
            <span
              key={chip + i}
              style={{
                padding: "4px 10px",
                background: i === 0
                  ? `color-mix(in oklch, var(--${opts.tone}) 18%, var(--bg-2))`
                  : "var(--bg-2)",
                border: i === 0
                  ? `1px solid color-mix(in oklch, var(--${opts.tone}) 40%, transparent)`
                  : "1px solid var(--line-soft)",
                color: i === 0 ? "var(--ink-0)" : "var(--ink-2)",
                borderRadius: 20,
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                fontWeight: 500,
              }}
            >
              {chip}
            </span>
          ))}
        </div>
      </div>

      {/* 본문 */}
      <div style={{ padding: "16px 18px" }}>
        {/* 사실 칩 row */}
        {opts.factChips.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
            {opts.factChips.map((c, i) => (
              <span
                key={c.label + i}
                style={{
                  padding: "3px 8px",
                  background: c.tone ? `color-mix(in oklch, var(--${c.tone}) 10%, var(--bg-1))` : "var(--bg-1)",
                  border: `1px solid ${c.tone ? `color-mix(in oklch, var(--${c.tone}) 30%, transparent)` : "var(--line-soft)"}`,
                  color: c.tone ? `var(--${c.tone})` : "var(--ink-2)",
                  borderRadius: 12,
                  fontSize: 11,
                  fontFamily: c.mono ? "var(--font-mono)" : "inherit",
                  fontWeight: 500,
                }}
              >
                {c.label}
              </span>
            ))}
          </div>
        )}

        {opts.detailLine}
        {opts.intervalBar}

        {/* AI 분석 없음 → "분석시작" 버튼 (명시적 요청, 자동 LLM 호출 방지) */}
        {opts.llmCacheMiss && opts.onRequestAnalysis && (
          <div style={{ marginTop: "var(--space-3)", display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <button
              type="button"
              onClick={opts.onRequestAnalysis}
              style={{
                padding: "var(--space-2) var(--space-4)",
                borderRadius: "var(--r-md)",
                background: `color-mix(in oklch, var(--${opts.tone}) 16%, var(--bg-2))`,
                border: `1px solid color-mix(in oklch, var(--${opts.tone}) 40%, transparent)`,
                color: `var(--${opts.tone})`,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t("today.analyzeStart")}
            </button>
            <span style={{ fontSize: 11, color: "var(--ink-4)" }}>{t("today.analyzeWaiting")}</span>
          </div>
        )}

        {/* AI 분석 완료 → "다시분석" 버튼 (staleness 게이팅). onReanalyze 가 실제 함수일 때만
            노출 — null(생성 중/미표시)이면 숨겨 disabled 버튼이 스피너와 함께 뜨는 글리치 방지. */}
        {opts.onReanalyze != null && !opts.llmCacheMiss && (
          <div style={{ marginTop: "var(--space-3)", display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <button
              type="button"
              onClick={opts.onReanalyze ?? undefined}
              disabled={!opts.reanalyzable}
              style={{
                padding: "var(--space-1) var(--space-3)",
                borderRadius: "var(--r-md)",
                background: opts.reanalyzable
                  ? `color-mix(in oklch, var(--${opts.tone}) 10%, var(--bg-2))`
                  : "var(--bg-2)",
                border: `1px solid ${opts.reanalyzable
                  ? `color-mix(in oklch, var(--${opts.tone}) 35%, transparent)`
                  : "var(--line-soft)"}`,
                color: opts.reanalyzable ? `var(--${opts.tone})` : "var(--ink-4)",
                fontSize: 11,
                fontWeight: 500,
                cursor: opts.reanalyzable ? "pointer" : "default",
                opacity: opts.reanalyzable ? 1 : 0.6,
              }}
            >
              {t("today.reanalyze")}
            </button>
            {!opts.reanalyzable && (
              <span style={{ fontSize: 11, color: "var(--ink-4)" }}>{t("today.upToDate")}</span>
            )}
          </div>
        )}

        {/* AI 분석 phase 상태 — silent debounce 대신 명시적 상태 표시. */}
        {(opts.llmPhase === "preparing" || opts.llmPhase === "calling") && (
          <div
            style={{
              marginTop: "var(--space-3)",
              padding: "var(--space-2) var(--space-3)",
              background: `color-mix(in oklch, var(--${opts.tone}) 8%, var(--bg-2))`,
              border: `1px dashed color-mix(in oklch, var(--${opts.tone}) 35%, transparent)`,
              borderRadius: "var(--r-md)",
              fontSize: 12,
              color: "var(--ink-2)",
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
            }}
            aria-live="polite"
          >
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: `var(--${opts.tone})`,
                animation: "pulse 1.2s ease-in-out infinite",
              }}
            />
            <span>
              {opts.llmPhase === "preparing"
                ? opts.llmPreparingMsg
                : opts.llmCallingMsg}
            </span>
          </div>
        )}

        {/* narrative — 다단락 */}
        <div
          style={{
            marginTop: "var(--space-3)",
            fontSize: 13,
            lineHeight: 1.55,
            color: "var(--ink-1)",
            transition: "opacity .3s",
            opacity: opts.llmLoading && !opts.isLLM ? 0.6 : 1,
          }}
        >
          {visibleParagraphs.map((p, i) => {
            const isLede = i === 0 && paragraphs.length > 1;
            return (
              <p
                key={i}
                style={{
                  margin: 0,
                  marginBottom: i === visibleParagraphs.length - 1 ? 0 : "var(--space-3)",
                  fontSize: isLede ? 14 : "inherit",
                  fontWeight: isLede ? 500 : 400,
                  // 1단락(lede, 볼드): 외부 1.55 상속 / 나머지: 1.50 으로 살짝 더 좁게.
                  lineHeight: isLede ? "inherit" : 1.5,
                  color: isLede ? "var(--ink-0)" : "var(--ink-1)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {p}
              </p>
            );
          })}
          {canFold && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              style={{
                marginTop: "var(--space-2)",
                background: "transparent", border: 0, padding: 0,
                color: "var(--lime)", fontSize: 12, fontWeight: 500,
                cursor: "pointer", textDecoration: "none",
              }}
            >
              {expanded ? t("today.narrativeCollapse") : t("today.narrativeExpand", { n: paragraphs.length - 1 })}
            </button>
          )}
        </div>

        {/* CTA */}
        {opts.cta && (
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "var(--space-3)" }}>
            <a
              href={opts.cta.href}
              className={opts.cta.emphasis ? "ds-btn ds-btn--md" : "ds-btn ds-btn--md ds-btn--ghost"}
              style={{ fontSize: 12 }}
            >
              {opts.cta.label}
            </a>
          </div>
        )}
      </div>
    </Card>
  );
}

function renderHeroCard(opts: HeroCardOpts) {
  return <HeroCard {...opts} />;
}

// 로딩 스켈레톤 — getTodaysWorkout(CF) 응답 대기(~1.6s, 콜드면 더) 동안 빈 박스 대신 카드
// 구조(eyebrow·제목·칩·바·narrative)를 닮은 셔머를 노출해 "오늘 운동을 불러오는 중" 임을
// 명시한다(체감 개선). minHeight:300 으로 로드 후 카드와 높이 정합 → CLS 예약도 유지.
function WorkoutCardSkeleton() {
  const { t } = useTranslation('common');
  const sh = (w: number | string, h: number, extra?: React.CSSProperties): React.CSSProperties => ({
    width: w,
    height: h,
    borderRadius: 'var(--r-sm)',
    // opacity 펄스(GPU 합성) — 옛 rd-shimmer(background-position)는 비합성이라 첫 로드
    // 중 CLS/메인스레드 비용을 키웠다 (perf, 2026-06).
    background: 'var(--bg-2)',
    animation: 'rd-pulse 1.4s ease-in-out infinite',
    ...extra,
  });
  return (
    <Card
      padding="none"
      role="status"
      aria-busy="true"
      aria-label={t('label.loadingHint')}
      style={{ padding: 18, minHeight: 300, background: 'var(--bg-1)' }}
    >
      <div style={sh('44%', 11, { marginBottom: 14 })} />
      <div style={sh('38%', 24, { marginBottom: 14 })} />
      <div className="flex" style={{ gap: 8, marginBottom: 16 }}>
        <div style={sh(72, 26, { borderRadius: 999 })} />
        <div style={sh(60, 26, { borderRadius: 999 })} />
      </div>
      <div className="flex" style={{ gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={sh(84, 24, { borderRadius: 999 })} />
        <div style={sh(120, 24, { borderRadius: 999 })} />
        <div style={sh(72, 24, { borderRadius: 999 })} />
      </div>
      <div style={sh('100%', 12, { marginBottom: 18, borderRadius: 999 })} />
      <div style={sh('100%', 12, { marginBottom: 8 })} />
      <div style={sh('78%', 12)} />
    </Card>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function TodaysWorkoutCard() {
  const { t } = useTranslation('training');
  const WORKOUT_LABELS = useMemo(() => buildWorkoutLabels(t), [t]);
  const { user, profile } = useAuth();
  const [data, setData] = useState<WorkoutDetail | null>(null);
  const [loading, setLoading] = useState(true);
  /** 사용자가 "AI 분석 받기" 버튼을 눌렀을 때 true → full LLM 호출 허용. */
  const [triggerFull, setTriggerFull] = useState(false);
  const [cfDone, setCfDone] = useState(false);
  // lazy revalidate — 매일 보는 위젯. 첫 fetch 전엔 discipline 미상이라 fallback 경로,
  // 응답에 discipline이 오면 그때부터 종목별 projection_{discipline} 신선도 평가로 전환.
  const { revalidating, justRecomputed } = useFreshTraining(data?.discipline);

  // 활성 goal 목록 — discipline 무관 전체. 카드의 discipline 은 CF 응답 우선이고
  // CF 가 null 일 때만 이 목록에서 첫 항목을 폴백. discipline-filter 구독은 사이클 goal
  // 삭제 후에도 카드의 discipline 이 "bike" 로 stuck 되는 stale 케이스를 못 잡아 폐기.
  const [activeGoals, setActiveGoals] = useState<Goal[]>([]);
  useEffect(() => {
    if (!user) { setActiveGoals([]); return; }
    const goalQ = query(
      collection(firestore, "goals"),
      where("userId", "==", user.uid),
      where("status", "==", "active"),
    );
    const unsub = onSnapshot(goalQ, (snap) => {
      setActiveGoals(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Goal));
    });
    return () => unsub();
  }, [user]);

  // discipline 결정: CF 응답 우선 → 활성 goal 중 첫 항목 (createdAt 오름차순) → profile primaryDiscipline → bike.
  const fallbackDiscipline: RecDiscipline =
    (profile?.primaryDiscipline && profile.primaryDiscipline !== "tri" ? profile.primaryDiscipline : null)
    ?? "bike";
  const firstActiveDisc = useMemo(() => {
    const sorted = [...activeGoals].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    const d = sorted[0]?.discipline;
    return (d === "bike" || d === "run" || d === "swim") ? d : null;
  }, [activeGoals]);
  const discipline: RecDiscipline = (data?.discipline ?? firstActiveDisc ?? fallbackDiscipline) as RecDiscipline;
  // 현재 discipline 에 매칭되는 활성 goal — narrative/적응플래그 컨텍스트.
  const activeGoal: Goal | null = useMemo(
    () => activeGoals.find((g) => g.discipline === discipline) ?? null,
    [activeGoals, discipline],
  );

  const summary = useTrainingSummary(discipline);

  // projection 구독 — CTL/ATL/TSB. CF 응답에 tsb 가 있어도 ctl/atl 은 없으므로 LLM 컨텍스트 보강에 필요.
  const [projection, setProjection] = useState<FitnessProjection | null>(null);
  useEffect(() => {
    if (!user) { setProjection(null); return; }
    const ref = doc(firestore, "users", user.uid, "fitness", `projection_${discipline}`);
    const unsub = onSnapshot(ref, (snap) => {
      setProjection(snap.exists() ? (snap.data() as FitnessProjection) : null);
    });
    return () => unsub();
  }, [user, discipline]);

  // summary 문서 stale/누락 폴백 — 최근 14일 활동 직접 조회해서 lastActivityAt + 7d/14d TSS 합산.
  // summary 문서가 있어도 totalTss=0 같은 stale 값을 줄 수 있어 활동 기반 계산을 항상 보유.
  const [lastActFallbackTs, setLastActFallbackTs] = useState<number | null>(null);
  const [recent7dFallback, setRecent7dFallback] = useState<number>(0);
  const [recent14dFallback, setRecent14dFallback] = useState<number>(0);
  // 종목별 7d TSS — narrativeMismatch (cross-disc 시그널) 정확 분류용.
  // 이전엔 sum7 (전 종목 합) 을 crossDisc7dTss 로 잘못 박아 사이클만 한 사용자에게도
  // "다른 종목 비중 높음" 잘못 인용. 2026-05-30 사용자 보고로 수정.
  const [recent7dByDisc, setRecent7dByDisc] = useState<Record<"bike"|"run"|"swim"|"tri", number>>({
    bike: 0, run: 0, swim: 0, tri: 0,
  });
  // 일별 TSS (오늘 = index 6, 6일전 = index 0) — narrative 의 "주중 vs 주말" 패턴 인용.
  const [byDay7Fallback, setByDay7Fallback] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [sessions7Fallback, setSessions7Fallback] = useState<number>(0);
  const [sessions30Fallback, setSessions30Fallback] = useState<number>(0);
  const [activitiesFallbackDone, setActivitiesFallbackDone] = useState<boolean>(false);
  useEffect(() => {
    if (!user) {
      setLastActFallbackTs(null);
      setRecent7dFallback(0);
      setRecent14dFallback(0);
      setRecent7dByDisc({ bike: 0, run: 0, swim: 0, tri: 0 });
      setByDay7Fallback([0, 0, 0, 0, 0, 0, 0]);
      setSessions7Fallback(0);
      setSessions30Fallback(0);
      setActivitiesFallbackDone(true);
      return;
    }
    setActivitiesFallbackDone(false);
    let cancelled = false;
    (async () => {
      try {
        const cutoff = Date.now() - 14 * 86400000;
        const q = query(
          collection(firestore, "activities"),
          where("userId", "==", user.uid),
          where("startTime", ">=", cutoff),
          orderBy("startTime", "desc"),
          // 14일 내 활동은 최근 카운트(7d/14d/요일별) fallback 용도라 50개면 충분.
          // 무제한이면 활동 많은 유저가 thumbnailTrack 포함 문서를 수십개 끌어와 첫 로드 가중. (perf, 2026-06)
          limit(50),
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        const docs = snap.docs.map((d) => d.data() as {
          startTime?: number;
          tss?: number;
          type?: string;
          sport?: string;
          summary?: { tss?: number; relativeEffort?: number; ridingTimeMillis?: number };
        });
        const ts = docs[0]?.startTime;
        setLastActFallbackTs(typeof ts === "number" ? ts : null);
        const cutoff7 = Date.now() - 7 * 86400000;
        // 오늘 자정 (로컬). byDay index 6 = 오늘, 0 = 6일전.
        const todayMid = new Date(); todayMid.setHours(0,0,0,0);
        const byDay7 = [0, 0, 0, 0, 0, 0, 0];
        let sum7 = 0, sum14 = 0, sessions7 = 0, sessions30 = 0;
        const byDisc: Record<"bike"|"run"|"swim"|"tri", number> = { bike: 0, run: 0, swim: 0, tri: 0 };
        for (const a of docs) {
          const raw = (a as { tss?: number }).tss ?? a.summary?.tss ?? null;
          // 종목 분류 — sport 필드 (orider 앱 채움) 우선, 없으면 type (Strava) 으로 폴백.
          // 서버 inferDiscipline 과 동일 규칙 → 시간 기반 추정 factor 가 서버 PMC 와 일치.
          const disc = getDiscipline(a.sport || a.type);
          const load = estimateActivityLoad({
            precomputedTss: raw,
            relativeEffort: a.summary?.relativeEffort ?? null,
            ridingTimeMillis: a.summary?.ridingTimeMillis ?? 0,
            discipline: disc,
          });
          sum14 += load.value;
          sessions30++;
          if ((a.startTime ?? 0) >= cutoff7) {
            sum7 += load.value;
            sessions7++;
            byDisc[disc] = (byDisc[disc] ?? 0) + load.value;
            // bucket into byDay7
            const diffDays = Math.floor((todayMid.getTime() - (a.startTime ?? 0)) / 86400000);
            if (diffDays >= 0 && diffDays <= 6) byDay7[6 - diffDays] = (byDay7[6 - diffDays] ?? 0) + load.value;
          }
        }
        setRecent7dFallback(Math.round(sum7));
        setRecent14dFallback(Math.round(sum14));
        setRecent7dByDisc({
          bike: Math.round(byDisc.bike), run: Math.round(byDisc.run),
          swim: Math.round(byDisc.swim), tri: Math.round(byDisc.tri),
        });
        setByDay7Fallback(byDay7.map(Math.round));
        setSessions7Fallback(sessions7);
        setSessions30Fallback(sessions30);
      } catch (err) {
        if (!cancelled) console.warn("[TodaysWorkoutCard] activities fallback fail", err);
      } finally {
        if (!cancelled) setActivitiesFallbackDone(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // 활성 goal 집합 변화 감지 — 추가/삭제 시 자동 CF refetch 트리거.
  // activeGoals 리스트에서 derive 해서 별도 구독 없이 식별자만 생성.
  const goalsKey = useMemo(
    () => activeGoals.length === 0
      ? "empty"
      : activeGoals.map((g) => `${g.id}:${g.discipline ?? ""}`).sort().join("|"),
    [activeGoals],
  );

  useEffect(() => {
    let cancelled = false;
    const fn = httpsCallable<Record<string, never>, TodaysWorkoutCFResponse>(
      functions,
      "getTodaysWorkout"
    );
    const refetch = () => {
      fn({})
        .then((res) => {
          if (cancelled) return;
          setData(res.data.todaysWorkout);
        })
        .catch((err) => {
          if (cancelled) return;
          console.error(t('today.loadFailed'), err);
          setData(null);
        })
        .finally(() => { if (!cancelled) { setLoading(false); setCfDone(true); } });
    };
    refetch();
    const onVisible = () => {
      if (document.visibilityState === "visible") refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
    // goalsKey 변화 시 자동 refetch — 사용자가 goal 추가/삭제 후 카드 즉시 갱신.
     
  }, [goalsKey]);

  // revalidating이 true→false로 떨어지면 plan/adaptationFlag가 갱신됐을 수 있으니 refetch
  const prevRevalidating = useRef(false);
  useEffect(() => {
    if (prevRevalidating.current && !revalidating) {
      const fn = httpsCallable<Record<string, never>, TodaysWorkoutCFResponse>(
        functions,
        "getTodaysWorkout"
      );
      fn({}).then((res) => setData(res.data.todaysWorkout)).catch((err) => logClientError("TodaysWorkoutCard.todaysWorkout", err, {}));
    }
    prevRevalidating.current = revalidating;
  }, [revalidating]);

  // ── 통합 facts/narrative 컴퓨테이션 (early return 이전, hooks 안정) ───────────
  const lastActivityAt = summary?.meta.lastActivityAt ?? lastActFallbackTs;
  const daysSinceLastActivity = lastActivityAt != null
    ? Math.floor((Date.now() - lastActivityAt) / 86400000)
    : null;
  // summary 의 totalTss=0 stale 케이스를 피하려고 max(summary, activities 폴백) 사용.
  // narrative 에 "운동 안 함" 같은 잘못된 컨텍스트가 들어가지 않도록 보수적으로 큰 값 채택.
  const recent7d = Math.max(summary?.week.totalTss ?? 0, recent7dFallback);
  const recent14d = Math.max(
    summary?.month.totalTss != null ? Math.round(summary.month.totalTss * 14 / 30) : 0,
    recent14dFallback,
    recent7d * 2,
  );
  const ctlSrv = projection?.currentCtl ?? 0;
  const atlSrv = projection?.currentAtl ?? 0;
  const tsbSrv = projection?.currentTsb ?? data?.tsb ?? 0;

  const goalCtx = activeGoal
    ? {
        courseName: activeGoal.courseName,
        daysUntil: Math.ceil((activeGoal.eventDate - Date.now()) / 86400000),
        distanceKm: activeGoal.courseDist,
        elevationM: activeGoal.courseElev,
      }
    : null;

  // plan-driven 모드: 오늘 plan 워크아웃이 있을 때 — 그 워크아웃 자체를 sessionName 으로 facts 합성.
  // rule-engine 모드: plan 없거나 오늘 workout 미존재(rest 포함은 plan-rest 분기에서 별도) → recommendToday.
  const isPlanMode = data != null && data.workout !== "rest";
  const planFacts: RecommendationFacts | null = isPlanMode && data
    ? (() => {
        const w = applyDisciplineToWorkout(data.workout, discipline);
        // chips / contextTags 는 UI 표시 전용 (한국어). LLM 입력에는 사용 안 함 — 구조화
        // 시그널 (adaptation/disciplineMismatch/lastActivityDaysAgo) 로 분리 전달.
        return {
          type: workoutToRecType(w),
          sessionName: data.workoutName ?? WORKOUT_LABELS[w],
          sessionNameKey: "training:session.z2Endurance", // plan 모드 — sessionName 이 이미 번역됨
          workoutKind: w,
          tone: tsbTone(tsbSrv),
          zone: workoutToZone(w),
          durationMin: [data.duration, data.duration],
          chips: [
            t(getDisciplineLabelKey(discipline)),
            t('today.minutes', { value: data.duration }),
            `${data.tss} TSS`,
            ...(data.courseName ? [`D-${data.daysLeft}`] : []),
          ],
          contextTags: [],
          inputSnapshot: {
            tsb: tsbSrv,
            ctl: ctlSrv,
            atl: atlSrv,
            recent7dTss: recent7d,
            discipline,
            daysUntilGoal: data.daysLeft,
          },
        };
      })()
    : null;

  const ruleFacts: RecommendationFacts | null = !isPlanMode && cfDone
    ? recommendToday({
        tsb: tsbSrv, ctl: ctlSrv, atl: atlSrv,
        recent7dTss: recent7d,
        recent14dTss: recent14d,
        daysSinceLastWorkout: daysSinceLastActivity,
        lastWorkoutAvgZone: null,
        discipline,
        dayOfWeek: new Date().getDay(),
        goal: goalCtx,
        adaptation: activeGoal?.adaptationFlag ?? null,
        // 주간 권장부하 대비 누적 — summary.week(월~현재) 우선, 없으면 rolling 7d 폴백.
        weeklyAccumulatedTss: summary?.week.totalTss ?? recent7d,
        lifestyle: profile?.lifestyle ?? null,
      })
    : null;

  const facts: RecommendationFacts | null = planFacts ?? ruleFacts;

  // LLM narrative 호출 안정성: facts 의 핵심 입력이 모두 settle 된 후에만 호출.
  // 비활성화 직전 단계적으로 도착하는 (summary → activities 폴백) 변동마다 LLM 재호출되는 걸 방지.
  // - cfDone: CF 응답 도착 (data 확정)
  // - activitiesFallbackDone: 활동 기반 recent7d 폴백 계산 완료
  // - summary 는 onSnapshot 이라 timeout 못 줌. activities 폴백이 끝났다면 더 기다리지 않음.
  const narrativeReady = !!user && cfDone && activitiesFallbackDone;
  const athlete = profile ? {
    ftpWatts: profile.ftp,
    weightKg: profile.weightKg,
    heightCm: profile.heightCm,
    maxHr: profile.maxHr,
    lthr: profile.lthr,
    thresholdPaceSec: profile.thresholdPace,
    cssSec: profile.css,
  } : null;
  const goalDetail = activeGoal ? {
    courseName: activeGoal.courseName,
    daysUntil: Math.ceil((activeGoal.eventDate - Date.now()) / 86400000),
    distanceKm: activeGoal.courseDist,
    elevationM: activeGoal.courseElev,
    targetDurationMin: activeGoal.targetDurationMin,
    feasibility: activeGoal.feasibility?.label ?? null,
  } : null;
  // LLM 에 전달할 summary 를 종목 무관 활동 데이터로 보강한다. 종목별 summary 가
  // 0 인 경우(예: 러닝 goal 인데 사이클만 함) LLM 이 "지난 7일 운동 안 함" 으로
  // 잘못 해석하는 걸 방지. 사실은 다른 종목으로 운동했음을 알려준다.
  const derivedSummary = useMemo(() => {
    if (!activitiesFallbackDone) return summary;
    const base = summary ?? null;
    const trainedToday = (byDay7Fallback[6] ?? 0) > 0;
    // 오늘부터 거꾸로 카운트한 연속 휴식/훈련 일수.
    let consecRest = 0, consecTrain = 0;
    for (let i = 6; i >= 0; i--) {
      if (byDay7Fallback[i]! > 0) {
        if (consecRest > 0) break;
        consecTrain++;
      } else {
        if (consecTrain > 0) break;
        consecRest++;
      }
    }
    const week: NonNullable<typeof summary>["week"] = {
      sessions: Math.max(base?.week.sessions ?? 0, sessions7Fallback),
      totalTss: Math.max(base?.week.totalTss ?? 0, recent7dFallback),
      avgIntensity: base?.week.avgIntensity ?? 0,
      peakTss: Math.max(base?.week.peakTss ?? 0, Math.max(...byDay7Fallback, 0)),
      restDays: byDay7Fallback.filter((v) => v === 0).length,
      ctlStart: base?.week.ctlStart ?? ctlSrv,
      ctlEnd: base?.week.ctlEnd ?? ctlSrv,
      byDay: byDay7Fallback,
      consecutiveRestDays: consecRest,
      consecutiveTrainingDays: consecTrain,
    };
    const month: NonNullable<typeof summary>["month"] = {
      sessions: Math.max(base?.month.sessions ?? 0, sessions30Fallback),
      totalTss: Math.max(base?.month.totalTss ?? 0, recent14dFallback * 30 / 14),
      avgWeekTss: Math.round((base?.month.totalTss ?? recent14dFallback * 30 / 14) / 4.3),
      ctlStart: base?.month.ctlStart ?? ctlSrv,
      ctlEnd: base?.month.ctlEnd ?? ctlSrv,
      peakDayTss: base?.month.peakDayTss ?? Math.max(...byDay7Fallback, 0),
      longestDurationMin: base?.month.longestDurationMin ?? 0,
      restDays: base?.month.restDays ?? 0,
    };
    return {
      discipline: (base?.discipline ?? discipline) as "bike" | "run" | "swim",
      computedAt: base?.computedAt ?? Date.now(),
      today: base?.today ?? { didTrain: trainedToday, tss: byDay7Fallback[6] ?? 0, durationMin: 0, activityName: null, primaryZone: null },
      week,
      month,
      meta: {
        lastActivityAt: base?.meta.lastActivityAt ?? lastActFallbackTs,
        activityCount30d: Math.max(base?.meta.activityCount30d ?? 0, sessions30Fallback),
      },
    };
  }, [summary, activitiesFallbackDone, byDay7Fallback, sessions7Fallback, sessions30Fallback, recent7dFallback, recent14dFallback, ctlSrv, lastActFallbackTs, discipline]);
  // 구조화 시그널 — Korean phrase 가 아닌 raw 수치/enum 만 CF 로 전달.
  // CF prompt 에서 LLM 이 자체 해석으로 한국어 narrative 생성.
  const narrativeAdaptation = activeGoal?.adaptationFlag
    ? {
        recent4wPlannedSum: activeGoal.adaptationFlag.recent4wPlannedSum ?? 0,
        recent4wActualSum: activeGoal.adaptationFlag.recent4wActualSum ?? 0,
        ratio: activeGoal.adaptationFlag.recent4wRatio ?? 0,
        severity: activeGoal.adaptationFlag.severity,
        streakWeeksOff: activeGoal.adaptationFlag.streakWeeksOff,
      }
    : null;
  // 종목 분류 fallback 으로 정확히 분리. summary.week.totalTss 는 stale 가능성 +
  // discipline 필터링 일관성 보장 어려워, 종목 분리된 fallback 누적을 단일 진실원으로.
  // tri 는 사이클 카운트에 포함 (오라이더가 tri 전용 활동을 따로 안 만드므로).
  const goalDisc7dTss = Math.round(recent7dByDisc[discipline] ?? 0);
  const crossDisc7dTss = Math.max(0, Math.round(recent7dFallback - goalDisc7dTss));
  const narrativeMismatch = { goalDisc7dTss, crossDisc7dTss };

  // peek: LLM 호출 없이 오늘 캐시 여부만 확인 (비용 절감 + 자동 LLM 방지)
  // facts 를 함께 전송해 서버 stale 판별을 활성화 — facts=null 이면 peek 보류.
  const peek = useTodaysNarrativePeek(
    discipline as "bike" | "run" | "swim",
    narrativeReady,
    facts,
  );
  // full LLM 호출은 사용자가 "분석시작"/"다시분석"을 눌렀을 때(triggerFull)만.
  // peek hit 만으로는 호출하지 않는다 — 이미 생성된 답변은 peek.narrative 를 그대로 표시해
  // "페이지 진입마다 자동 생성"을 제거한다(#393 리뷰 MAJOR).
  const shouldCallLLM = narrativeReady && triggerFull;
  const { narrative: llmNarrative, loading: llmLoading, phase: llmPhase } =
    useTodaysNarrative(facts, shouldCallLLM, derivedSummary, athlete, goalDetail, narrativeAdaptation, narrativeMismatch, daysSinceLastActivity);

  // 표시용 답변: 새로 생성된 llmNarrative 가 있으면 우선, 없으면 peek 캐시 답변.
  const displayNarrative = llmNarrative ?? peek.narrative;
  // 마지막으로 보여준 non-null 답변 보존 — '다시분석' 클릭 시 peek invalidate→재peek 왕복 동안
  // displayNarrative 가 잠깐 null 이 돼도 본문이 룰 fallback 으로 깜빡이지 않게 직전 답변 유지
  // (#395 리뷰 MAJOR 후속). 렌더 중 ref 갱신은 "직전값 캐시" 표준 패턴(재렌더 유발 없음).
  const lastNarrativeRef = useRef<string | null>(null);
  // 디시플린 전환(마운트 유지 중 bike→run 등, 예: goal 삭제) 시 직전값을 **렌더 중 동기**로 폐기.
  // useEffect(commit 후 실행)로는 전환 첫 렌더의 창을 못 막아 이전 종목 답변이 노출될 수 있다
  // (#396/#397 리뷰 MINOR). prevDisc 비교로 displayNarrative 갱신 이전에 동기 리셋해 완전 차단.
  const prevDiscRef = useRef(discipline);
  if (prevDiscRef.current !== discipline) {
    prevDiscRef.current = discipline;
    lastNarrativeRef.current = null;
  }
  if (displayNarrative) lastNarrativeRef.current = displayNarrative;
  const stableNarrative = displayNarrative ?? lastNarrativeRef.current;

  // 로딩 중
  if (loading) {
    return <WorkoutCardSkeleton />;
  }

  // peek miss + 아직 full 미호출 → "분석시작" 버튼 표시용 플래그 + 핸들러
  const llmCacheMiss = peek.cacheMiss && !triggerFull && !llmNarrative && !llmLoading;
  const onRequestAnalysis = () => {
    if (user) invalidateTodaysNarrativePeekCache(user.uid, discipline as "bike" | "run" | "swim");
    setTriggerFull(true);
  };

  // "다시분석" — peek hit 이고 사용자가 아직 재생성 안 눌렀을 때 노출.
  // stale=true 이면 활성화(새 활동 추가 or TSB/CTL/ATL 변화); false 이면 disabled+"최신 상태".
  const showReanalyze = !!peek.narrative && !triggerFull && !llmLoading;
  const reanalyzable = peek.stale;
  const onReanalyze = showReanalyze
    ? () => {
        if (user) invalidateTodaysNarrativePeekCache(user.uid, discipline as "bike" | "run" | "swim");
        setTriggerFull(true);
      }
    : null;

  // CF 가 todaysWorkout=null 을 반환한 경우: 활성 goal 자체가 없거나, goal 시작 전.
  // 양쪽 모두 룰엔진이 facts 를 만들어 "지금 컨디션상 이런 세션이 좋아" 를 보여줌.
  // facts 미준비 (CF 응답 전) 면 작은 placeholder.
  if (!data) {
    if (!facts) {
      return <WorkoutCardSkeleton />;
    }
    const narrativeText = stableNarrative ?? composeFallbackNarrative(facts, summary, t);
    return renderHeroCard({
      tone: facts.tone,
      eyebrow: t('today.eyebrow'),
      sessionName: t(facts.sessionNameKey, { disc: t(`discipline.${facts.inputSnapshot.discipline}`) }),
      headerChips: facts.chips,
      factChips: makeFactChips({ tsb: tsbSrv, recent7d, daysSinceLastActivity, goalDaysUntil: goalCtx?.daysUntil ?? null }, t),
      narrativeText,
      isLLM: stableNarrative != null,
      llmLoading,
      llmPhase,
      llmCacheMiss,
      onRequestAnalysis,
      onReanalyze,
      reanalyzable,
      revalidating,
      justRecomputed,
      revalidatingMsg: t('today.revalidatingUpdating'),
      revalidatedMsg: t('today.revalidatingDone'),
      llmPreparingMsg: t('today.llmPreparing'),
      llmCallingMsg: t('today.llmCalling'),
      // 주간 권장부하 + Balance 행동지침 (G5) — 룰엔진 카드에서만 노출.
      detailLine: (
        <WeeklyLoadStrip
          facts={facts}
          accumulated={summary?.week.totalTss ?? recent7d}
          t={t}
        />
      ),
      // 활성 goal 없을 때만 목표 만들기 CTA. 있으면 계획 보기는 굳이 노출 안 함.
      cta: activeGoal ? undefined : { href: "/goal-setup", label: t('today.goalSetupCta') },
    });
  }

  // workout === 'rest' → 휴식일 또는 계획 시작 대기 카드
  if (data.workout === "rest") {
    const isPrePlan = data.weekNumber === 0;
    const restTone: ToneColor = "amber";
    const restSessionName = isPrePlan ? `${t('today.preparing')} 🚀` : `${t('today.restToday')} 🧘`;
    const headerChips = [
      t(getDisciplineLabelKey(data.discipline ?? discipline)),
      ...(data.courseName ? [data.courseName] : []),
    ];
    // narrative: 룰엔진 facts 를 그대로 활용해서 회복 가이드 풍부하게.
    // 단 sessionName 만 plan 의 휴식으로 덮어쓴다.
    const restFacts: RecommendationFacts | null = ruleFacts ?? planFacts;
    const restNarrative = restFacts
      ? (stableNarrative ?? composeFallbackNarrative(restFacts, summary, t))
      : (data.recommendation ?? t('today.restFallbackNarrative'));
    return renderHeroCard({
      tone: restTone,
      eyebrow: data.courseName ? t('today.courseDay', { course: data.courseName, daysLeft: data.daysLeft }) : t('today.eyebrow'),
      sessionName: restSessionName,
      headerChips,
      factChips: makeFactChips({ tsb: tsbSrv, recent7d, daysSinceLastActivity, goalDaysUntil: data.courseName ? data.daysLeft : (goalCtx?.daysUntil ?? null) }, t),
      narrativeText: restNarrative,
      isLLM: stableNarrative != null && restFacts != null,
      llmLoading,
      llmPhase,
      llmCacheMiss,
      onRequestAnalysis,
      onReanalyze,
      reanalyzable,
      revalidating,
      justRecomputed,
      revalidatingMsg: t('today.revalidatingUpdating'),
      revalidatedMsg: t('today.revalidatingDone'),
      llmPreparingMsg: t('today.llmPreparing'),
      llmCallingMsg: t('today.llmCalling'),
    });
  }

  // ── 풀 워크아웃 카드 (plan-mode) ─────────────────────────────────────────────
  const {
    workout, workoutName, duration, tss, intervals = [],
    courseName, daysLeft, weekNumber, phase, weekCompleted, weekTotal,
    ctlDelta, completed, actualTSS, actualActivityId,
    isAdjusted, adjustmentFactor, adaptationFlag,
  } = data;
  // 종목별 projection 의 tsb 사용 — data.tsb 는 cross-discipline 이라 부정확.
  const tsb = tsbSrv;
  // CF (getTodaysWorkout) 응답에는 discipline 필드가 없다 — outer scope 의 computed
  // `discipline` (active goal 기준) 을 사용해야 정확. data.discipline 폴백 "bike" 는 버그.
  // 또한 plan generator 가 run goal 인데 workout="tempo" 같이 generic(=bike-style) kind 를
  // 저장한 경우가 있어, 라벨 표시는 applyDisciplineToWorkout 으로 보정.
  const planDiscipline = discipline;
  const disciplineWorkoutKind = applyDisciplineToWorkout(workout, planDiscipline);

  const completionRatio =
    completed && actualTSS != null && actualTSS > 0 && tss > 0 ? actualTSS / tss : null;
  const completionRatioPct = completionRatio != null
    ? Math.min(999, Math.round(completionRatio * 100)) : null;

  const now = Date.now();
  const showAdaptationDot =
    !!adaptationFlag &&
    (adaptationFlag.severity === "warn" || adaptationFlag.severity === "critical") &&
    !(adaptationFlag.snoozedUntil != null && adaptationFlag.snoozedUntil > now);
  const adaptationDotColor =
    adaptationFlag?.severity === "critical" ? "var(--rose)" : "var(--amber)";

  const planTone: ToneColor = planFacts?.tone ?? tsbTone(tsb);
  const planNarrative = planFacts
    ? (stableNarrative ?? composeFallbackNarrative(planFacts, summary, t))
    : (data.contextNarration ?? "");

  const headerChips: string[] = [
    `${getDisciplineIcon(planDiscipline)} ${t(getDisciplineLabelKey(planDiscipline))}`,
    ...(weekNumber !== undefined && phase ? [`W${weekNumber} ${phase}`] : []),
  ];

  // 우측 상단 extras: 완료/조정/적응 dot 등 plan-only chip 들.
  const topRightExtras = (
    <>
      {showAdaptationDot && (
        <span
          title={adaptationFlag?.reason ?? ""}
          aria-label={adaptationFlag?.reason ?? "adaptation alert"}
          style={{ width: 8, height: 8, borderRadius: "50%", background: adaptationDotColor, flexShrink: 0, cursor: "help" }}
        />
      )}
      {isAdjusted && adjustmentFactor && <AdjustedChip factor={adjustmentFactor} />}
      {completed && (
        <Chip
          style={{
            flexShrink: 0,
            color: "var(--lime)", borderColor: "var(--lime)",
            background: "color-mix(in srgb, var(--lime) 12%, transparent)",
            fontWeight: 600,
          }}
        >
          {t('today.completedBadge')}
        </Chip>
      )}
    </>
  );

  // 시간 · TSS 라인 (+ 완료 시 실제 TSS / 달성률)
  const detailLine = (duration > 0 || tss > 0) ? (
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-3)", marginBottom: 'var(--space-2)' }}>
      {duration > 0 ? t('today.minutes', { value: duration }) : ""}
      {duration > 0 && tss > 0 ? " · " : ""}
      {tss > 0 ? t('today.tssValue', { value: tss }) : ""}
      {weekTotal > 0 && (
        <span style={{ marginLeft: 'var(--space-3)', color: "var(--ink-3)" }}>
          {t('today.thisWeek')} <span style={{ color: "var(--ink-1)", fontWeight: 600 }}>{weekCompleted}/{weekTotal}</span>
          {" · "}
          <span style={{ color: ctlDelta >= 0 ? "var(--lime)" : "var(--rose)", fontWeight: 600 }}>
            CTL {ctlDelta >= 0 ? `+${ctlDelta.toFixed(1)}` : ctlDelta.toFixed(1)}
          </span>
        </span>
      )}
      {completed && actualTSS != null && actualTSS > 0 && (
        <>
          {" → "}
          <span style={{ color: "var(--ink-1)", fontWeight: 600 }}>
            {t('today.actualTssValue', { value: actualTSS })}
          </span>
          {completionRatioPct != null && (
            <span style={{ marginLeft: 6, color: completionRatio! >= 0.8 ? "var(--lime)" : "var(--amber)" }}>
              ({completionRatioPct}%)
            </span>
          )}
        </>
      )}
    </div>
  ) : null;

  return renderHeroCard({
    tone: planTone,
    eyebrow: courseName && daysLeft !== undefined
      ? `${t('today.eyebrow')} · ${courseName} D-${daysLeft}`
      : t('today.eyebrow'),
    sessionName: workoutName ?? WORKOUT_LABELS[disciplineWorkoutKind],
    headerChips,
    factChips: makeFactChips({ tsb, recent7d, daysSinceLastActivity, goalDaysUntil: courseName ? daysLeft : (goalCtx?.daysUntil ?? null) }, t),
    narrativeText: planNarrative,
    isLLM: stableNarrative != null,
    llmLoading,
    llmPhase,
    llmCacheMiss,
    onRequestAnalysis,
    onReanalyze,
    reanalyzable,
    revalidating,
    justRecomputed,
    revalidatingMsg: t('today.revalidatingUpdating'),
    revalidatedMsg: t('today.revalidatingDone'),
    llmPreparingMsg: t('today.llmPreparing'),
    llmCallingMsg: t('today.llmCalling'),
    topRightExtras,
    detailLine,
    intervalBar: intervals.length > 0 ? <IntervalBar intervals={intervals} /> : null,
    // 완료 활동이 있을 때만 활동 보기 CTA. 계획 보기는 제거 (헤더의 코스명·D-N으로 충분).
    cta: completed && actualActivityId
      ? { href: `/activity/${actualActivityId}`, label: t('today.viewActivity'), emphasis: false }
      : undefined,
  });
}
