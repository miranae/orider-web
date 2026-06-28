import { useEffect, useRef, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { httpsCallable } from "firebase/functions";
import { collection, query, where, orderBy, limit, getDocs, doc, onSnapshot } from "firebase/firestore";
import { functions, firestore } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import { useAuth } from "../../contexts/AuthContext";
import type { Goal, FitnessProjection } from "@shared/types/goal";
import { getDiscipline, getDisciplineIcon, getDisciplineLabelKey } from "../../utils/disciplineFilter";
import { useFreshTraining } from "../../hooks/useFreshTraining";
import { useTrainingSummary } from "../../hooks/useTrainingSummary";
import { estimateActivityLoad } from "../../utils/fitnessMetrics";
import { useTodaysNarrative } from "../../hooks/useTodaysNarrative";
import { useTodaysNarrativePeek, invalidateTodaysNarrativePeekCache } from "../../hooks/useTodaysNarrativePeek";
import { recommendToday, type RecommendationFacts, type ToneColor, type RecDiscipline } from "../../utils/todaysRecommendation";
import { composeFallbackNarrative } from "../../utils/recommendationComposer";
import AdjustedChip from "./AdjustedChip";
import { Chip } from "../../theme/components";
import {
  IntervalBar,
  WeeklyLoadStrip,
  WorkoutCardSkeleton,
  renderHeroCard,
} from "../../features/training/todaysWorkout/TodaysWorkoutPresentation";
import {
  applyDisciplineToWorkout,
  buildWorkoutLabels,
  makeFactChips,
  tsbTone,
  workoutToRecType,
  workoutToZone,
  type TodaysWorkoutCFResponse,
  type WorkoutDetail,
} from "../../features/training/todaysWorkout/todaysWorkoutUtils";

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
        if (!cancelled) logClientError("TodaysWorkoutCard.activitiesFallback", err, {});
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
          logClientError("TodaysWorkoutCard.todaysWorkout", err, {});
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
    <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginBottom: 'var(--space-2)' }}>
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
            <span style={{ marginLeft: "var(--space-1-5)", color: completionRatio! >= 0.8 ? "var(--lime)" : "var(--amber)" }}>
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
