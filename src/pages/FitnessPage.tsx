import { useEffect, useRef, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";

import TriFitnessView from "./fitness/TriFitnessView";
import TrainingStatusCard from "../components/fitness/TrainingStatusCard";
import RunRecordsBoard from "../components/fitness/RunRecordsBoard";
import MilestonesGrid from "../components/fitness/MilestonesGrid";
import MilestoneCelebration from "../components/fitness/MilestoneCelebration";
import { useRunRecords } from "../hooks/useRunRecords";
import { useMilestones } from "../hooks/useMilestones";
import type { MilestoneId } from "@shared/types/milestone";
import { useSearchParams } from "react-router-dom";
import {
  filterByDiscipline,
  type Discipline,
} from "../utils/disciplineFilter";
import { collection, query, where, doc, getDoc, onSnapshot, orderBy, limit } from "firebase/firestore";

import { toLocalDate } from "../utils/dateUtils";
import { firestore } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import { useAuth } from "../contexts/AuthContext";
import {
  estimateActivityLoad,
  aggregateDailyLoad,
  calculateFitness,
  type ActivityLoadEntry,
  type DailyLoad,
} from "../utils/fitnessMetrics";
import type { Activity, ActivityStreams } from "@shared/types";
import type { ActivityMetrics } from "@shared/types/activity-metrics";
import type { Goal, FitnessProjection } from "@shared/types/goal";
import FitnessChart from "../components/FitnessChart";
import CriticalPaceCurve, { type PaceStream } from "../components/charts/CriticalPaceCurve";
import CSSCurve from "../components/charts/CSSCurve";
import SectionHeader from "../components/redesign/SectionHeader";
import { EmptyState, ErrorState, LoadingSkeleton } from "../components/redesign";
import { useMobile } from "../hooks/useMobile";
import { useFreshTraining } from "../hooks/useFreshTraining";
import { useFitnessTimeseries } from "../hooks/useFitnessTimeseries";
import { usePdc } from "../hooks/usePdc";
import { useCohortPercentiles } from "../hooks/useCohortPercentiles";
import { useConsistencyStreak } from "../hooks/useConsistencyStreak";
import CohortRankingCard from "../components/CohortRankingCard";
import { RevalidatingIndicator } from "../components/training/RevalidatingIndicator";
import AdaptationSummary from "../components/training/AdaptationSummary";
import ConsistencyStreakCard from "../components/training/ConsistencyStreakCard";
import TodaysWorkoutCard from "../components/training/TodaysWorkoutCard";
import TodayConclusion from "../components/training/TodayConclusion";
import MobileFitnessPage from "../components/mobile/MobileFitnessPage";
import DisciplineTabs from "../components/redesign/DisciplineTabs";
import DetailsSection from "../components/redesign/DetailsSection";
import { Card, Text, Chip, buttonClass } from "../theme/components";
import RiderTypeCard from "../components/RiderTypeCard";
import { computeExpectedCurve, classifyGaps, computeOutdoorPacingGuide, type GapEntry } from "@shared/training/expectedPower";
import { estimateCyclingVo2max } from "@shared/training/vo2max";
import type { PowerDurationKey } from "@shared/types/personal-records";
import DailyTSSChart from "../features/fitness/components/DailyTSSChart";
import PowerCurveChart from "../features/fitness/components/PowerCurveChart";
import FtpProgressionCard from "../features/fitness/components/FtpProgressionCard";
import { deriveEstimatedFtpProgression, detectFtpBreakthrough } from "@shared/training/ftpProgression";
import {
  POWER_DURATION_KEY_SEC,
  formatKoreanDate,
  formatMonthDay,
  getRangeOptions,
  makeDurationLabel,
  secToMmss,
  tsbStatusDesc,
  tsbStatusLabel,
  type PowerCurvePoint,
  type RangeOption,
} from "../features/fitness/fitnessPageUtils";
import GuestValuePreview from "../components/guest/GuestValuePreview";
import { BikeActionAccordion, FitnessWeeklyInsight } from "../features/trainingHub/TrainingHubOpportunityPanel";
import { aggregateRecentZoneSeconds } from "../features/fitness/mobileFitnessMetrics";
import { percentileOf } from "@shared/training/cohortPercentile";

/* ---------- 메인 페이지 ---------- */

export default function FitnessPage() {
  const { t, i18n } = useTranslation("fitness");
  const durationLabel = makeDurationLabel(t);
  const { user, profile } = useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [streamsMap, setStreamsMap] = useState<Map<string, ActivityStreams>>(new Map());
  // 활동별 분석 메트릭 (서버에서 GCS 스트림까지 파싱·계산해둠). FitnessPage 가 직접 stream 을
  // 읽으면 GCS 스트림(이 사용자 298개 중 256개)은 못 받아 zone/파워커브가 거의 빈 결과 →
  // metrics 컬렉션으로 우회. mmp(파워커브)·powerZoneSec·hrZoneSec·tss 활용.
  const [metricsMap, setMetricsMap] = useState<Map<string, ActivityMetrics>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeOption>(90);
  const [activeGoal, setActiveGoal] = useState<Goal | null>(null);
  const [projection, setProjection] = useState<FitnessProjection | null>(null);
  // goal Firestore 쿼리 완료 여부 — 통합 이전 LLM 트리거 안정화용. 현재 페이지는
  // 사용하지 않지만 effect 내부 호환을 위해 setter 만 남기고 read 는 제거.
  const [, setGoalQueryDone] = useState(false);
  const isMobile = useMobile();
  const { pdc } = usePdc(user?.uid);
  // 코호트 백분위 랭킹(G9) — bike + pdc 있을 때만 stats doc 구독.
  const cohortStats = useCohortPercentiles(!!user);
  const { summary: consistencyStreak } = useConsistencyStreak(user?.uid);

  const [searchParams] = useSearchParams();
  const discipline: Discipline = (searchParams.get("sport") as Discipline) || "bike";

  // 거리별 러닝 기록 — 러닝 탭에서만 구독 (§3.4a)
  const { run: runRecords } = useRunRecords(discipline === "run");

  // 마일스톤 — 러닝 탭 (§3.4b). celebrated:false 인 신규 달성 하나를 축하 모달로.
  const { achieved: milestones, markCelebrated } = useMilestones(discipline === "run");
  // 단일 슬롯이면 A 닫기 → markCelebrated(A) 실패 → B 닫기 시 슬롯이 B 로 덮이면서 A 가
  // 다시 pending 이 되어 모달이 되돌아온다. 세션 내에서 닫은 것은 모두 기억한다.
  const [dismissedMilestones, setDismissedMilestones] = useState<ReadonlySet<MilestoneId>>(new Set());
  const pendingMilestone = useMemo(() => {
    for (const m of milestones.values()) {
      if (!m.celebrated && !dismissedMilestones.has(m.id)) return m.id;
    }
    return null;
  }, [milestones, dismissedMilestones]);

  // lazy revalidate — 화면 진입 시 신선도 체크 + 필요 시 서버 재계산.
  // discipline 전달 → 멀티 goal 사용자가 종목 전환할 때 해당 종목 신선도 재평가.
  const { revalidating, justRecomputed } = useFreshTraining(discipline === "tri" ? undefined : discipline);
  // projection onSnapshot unsubscribe ref — discipline 전환 시 재구독을 위해
  const projUnsubRef = useRef<(() => void) | null>(null);
  const projectionGoalIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    // 초기 쿼리는 "표시 범위 + 42일 CTL 워밍업"만 받는다 — 콜드 진입(빈 캐시)에서
    // 활동 전체(365+42=407일)를 받느라 첫 페인트(LCP)가 지연되던 문제 해소.
    // range 가 커지면(90→365) 아래 deps 로 재구독해 그때 더 받는다(지연 확장).
    // +42 는 CTL/ATL 지수이평 워밍업분이라 표시 구간의 정확도는 동일하게 유지된다.
    const cutoff = Date.now() - (range + 42) * 24 * 60 * 60 * 1000;
    const q = query(
      collection(firestore, "activities"),
      where("userId", "==", user.uid),
      where("deletedAt", "==", null),
      where("startTime", ">=", cutoff),
      orderBy("startTime", "asc"),
    );

    // onSnapshot 구독 — 신규 활동 ingest 시 자동 반영 (getDocs 1회 대신)
    const streamsLoadedFor = new Set<string>();
    const unsub = onSnapshot(
      q,
      async (snap) => {
        try {
          const acts = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }) as Activity)
            .filter((a) => a.summary != null);
          setActivities(acts);
          setLoading(false);

          // 신규 활동만 스트림 추가 로드 (이미 로드된 건 스킵).
          // 파워 커브(bike)는 파워>0 활동, 러닝 임계페이스 커브는 velocity_smooth, 수영 CSS
          // 커브는 laps 스트림이 필요한데 러닝/수영은 통상 파워가 없다. 파워>0 만 적재하면
          // run/swim 커브가 거의 항상 비므로(#536), 활동 종목으로 분류해 run/swim 도 적재한다.
          // (현재 view 가 아닌 활동 종목 기준 — 효과 deps 에 discipline 이 없어 종목 전환 시
          //  재구독되지 않으므로, 어느 종목으로 전환해도 커브가 뜨도록 미리 적재한다.)
          const runSwimIds = new Set([
            ...filterByDiscipline(acts, "run").map((a) => a.id),
            ...filterByDiscipline(acts, "swim").map((a) => a.id),
          ]);
          const needStreams = acts.filter((a) => {
            if (streamsLoadedFor.has(a.id)) return false;
            const p = a.summary.averagePower ?? a.avgPower ?? null;
            if (p != null && p > 0) return true;
            return runSwimIds.has(a.id);
          });
          if (needStreams.length === 0) return;

          const newMap = new Map<string, ActivityStreams>();
          for (let i = 0; i < needStreams.length; i += 10) {
            const batch = needStreams.slice(i, i + 10);
            const results = await Promise.all(
              batch.map(async (a) => {
                try {
                  const streamDoc = await getDoc(doc(firestore, "activity_streams", a.id));
                  if (!streamDoc.exists()) return null;
                  const data = streamDoc.data();
                  if (typeof data?.json === "string") {
                    return { id: a.id, stream: JSON.parse(data.json) as ActivityStreams };
                  }
                  return { id: a.id, stream: data as unknown as ActivityStreams };
                } catch { return null; }
              }),
            );
            for (const r of results) {
              if (r) {
                newMap.set(r.id, r.stream);
                streamsLoadedFor.add(r.id);
              }
            }
          }
          if (newMap.size > 0) {
            setStreamsMap((prev) => {
              const merged = new Map(prev);
              for (const [k, v] of newMap) merged.set(k, v);
              return merged;
            });
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : t("error.loadFailed"));
          setLoading(false);
        }
      },
      (err) => {
        logClientError("FitnessPage.activitiesSubscription", err, { range });
        setError(t("error.loadFailed"));
        setLoading(false);
      },
    );
    return () => unsub();
  }, [user, t, range]);

  // 활동별 분석 메트릭 배치 로드 (서버가 GCS 스트림까지 파싱해둠) — activities 가 갱신될 때
  // 새 활동만 추가 fetch. metrics 가 없는 활동은 누락 처리(빈 결과로 fallback).
  const metricsLoadedFor = useRef<Set<string>>(new Set()).current;
  useEffect(() => {
    if (!user || activities.length === 0) return;
    let cancelled = false;
    const need = activities.filter((a) => !metricsLoadedFor.has(a.id)).map((a) => a.id);
    if (need.length === 0) return;
    (async () => {
      const newMap = new Map<string, ActivityMetrics>();
      for (let i = 0; i < need.length; i += 20) {
        const batch = need.slice(i, i + 20);
        const results = await Promise.all(
          batch.map(async (id) => {
            try {
              const m = await getDoc(doc(firestore, "activity_metrics", id));
              return m.exists() ? { id, data: m.data() as ActivityMetrics } : null;
            } catch { return null; }
          }),
        );
        for (const r of results) {
          if (r) { newMap.set(r.id, r.data); metricsLoadedFor.add(r.id); }
        }
      }
      if (cancelled || newMap.size === 0) return;
      setMetricsMap((prev) => {
        const merged = new Map(prev);
        for (const [k, v] of newMap) merged.set(k, v);
        return merged;
      });
    })();
    return () => { cancelled = true; };
  }, [user, activities, metricsLoadedFor]);

  // 활성 목표 + 예측 로드
  useEffect(() => {
    if (!user || discipline === "tri") return; // tri는 TriFitnessView에서 처리
    // 종목 전환 시 stale state 즉시 클리어 + 이전 구독 해제
    setActiveGoal(null);
    setProjection(null);
    setGoalQueryDone(false);
    if (projUnsubRef.current) {
      projUnsubRef.current();
      projUnsubRef.current = null;
    }
    // 활성 goal 을 onSnapshot 으로 구독 — recomputeProjection 이 서버에서
    // adaptationFlag 를 갱신할 때 자동 반영. getDocs(cache-first) 로 한 번만 읽으면
    // persistentLocalCache 가 stale 값을 무한 반환하는 버그 발생.
    const goalQ = query(
      collection(firestore, "goals"),
      where("userId", "==", user.uid),
      where("status", "==", "active"),
      where("discipline", "==", discipline),
      limit(1),
    );
    const goalUnsub = onSnapshot(
      goalQ,
      (goalSnap) => {
        if (goalSnap.empty) {
          setActiveGoal(null);
          setGoalQueryDone(true);
          // goal 이 없으면 기존 projection 구독도 정리
          if (projUnsubRef.current) { projUnsubRef.current(); projUnsubRef.current = null; }
          projectionGoalIdRef.current = null;
          return;
        }
        const goalDoc = goalSnap.docs[0]!;
        const goal = { id: goalDoc.id, ...goalDoc.data() } as Goal;
        setActiveGoal(goal);
        setGoalQueryDone(true);

        // projection 구독 — goal 교체 시 stale closure 방지를 위해 goalId별로 재구독.
        // (goal 의 adaptationFlag 변경만으로 onSnapshot 재발화되므로.)
        if (projectionGoalIdRef.current !== goal.id) {
          if (projUnsubRef.current) {
            projUnsubRef.current();
            projUnsubRef.current = null;
          }
          projectionGoalIdRef.current = goal.id;
          const primaryRef = doc(firestore, "users", user.uid, "fitness", `projection_${discipline}`);
          const unsub = onSnapshot(
            primaryRef,
            (snap) => {
              if (!snap.exists()) return;
              const projData = snap.data() as FitnessProjection;
              if (projData.goalId === goal.id) setProjection(projData);
            },
            (err) => logClientError("FitnessPage.projectionSubscription", err, { discipline, goalId: goal.id }),
          );
          projUnsubRef.current = unsub;
        }
      },
      (err) => {
        logClientError("FitnessPage.goalSubscription", err, { discipline });
        setGoalQueryDone(true);
      },
    );
    // 언마운트/effect 재실행 시 goal + projection 양쪽 구독 정리
    return () => {
      goalUnsub();
      if (projUnsubRef.current) {
        projUnsubRef.current();
        projUnsubRef.current = null;
      }
      projectionGoalIdRef.current = null;
    };
  }, [user, discipline]);

  const disciplineActivities = useMemo(
    () => discipline === "tri" ? activities : filterByDiscipline(activities, discipline),
    [activities, discipline],
  );

  // 클라 재계산(폴백) — 정본 timeseries doc 이 없을 때(미배포/미백필/신규유저/tri) 사용.
  const clientFitness = useMemo(() => {
    if (disciplineActivities.length === 0) return { fitnessData: [], dailyData: [] };

    const entries: ActivityLoadEntry[] = disciplineActivities.map((a) => {
      // 서버 metrics.tss 가 가장 정확(GCS 스트림 기반 계산) — 있으면 우선. 없으면 activity
      // 자체 tss → summary 폴백. stream watts/ftp 의존성 제거 (클라가 GCS 스트림 못 읽음).
      const m = metricsMap.get(a.id);
      const load = estimateActivityLoad({
        precomputedTss: m?.tss ?? (a as { tss?: number | null }).tss ?? a.summary.tss,
        relativeEffort: a.summary.relativeEffort,
        ridingTimeMillis: a.summary.ridingTimeMillis,
        discipline: discipline === "tri" ? undefined : discipline,
      });
      return {
        date: toLocalDate(a.startTime),
        load: load.value,
        source: load.source,
      };
    });

    const today = toLocalDate(Date.now());
    const firstActivity = entries[0]?.date ?? today;
    const daily = aggregateDailyLoad(entries, firstActivity, today);
    const fitness = calculateFitness(daily);

    return { fitnessData: fitness, dailyData: daily };
  }, [disciplineActivities, metricsMap, discipline]);

  // 정본 CTL/ATL/TSB 시계열 — 서버 사전계산 doc(전체 라이프타임, 0-시드 정확).
  // 콜드 진입 시 활동쿼리 윈도우 축소로 인한 워밍업 부족 문제를 근본 해소. doc 부재 시 클라 폴백.
  const { timeseries, loaded: timeseriesLoaded } = useFitnessTimeseries(user?.uid, discipline);

  const { fitnessData, dailyData } = useMemo(() => {
    const pts = timeseries?.points;
    if (pts && pts.length > 0) {
      // 차트/KPI 는 doc.points(정본) 사용. dailyData 소비처(weeklyStats·DailyTSSChart)는
      // date·totalLoad 만 쓰므로 dailyLoad → totalLoad 로 투영(activities 미사용).
      return {
        fitnessData: pts,
        dailyData: pts.map((p) => ({
          date: p.date,
          totalLoad: p.dailyLoad,
          activities: [] as DailyLoad["activities"],
        })),
      };
    }
    return clientFitness;
  }, [timeseries, clientFitness]);

  const rangeData = useMemo(() => {
    if (fitnessData.length === 0) return { fitness: [], daily: [] };
    const sliceStart = Math.max(0, fitnessData.length - range);
    return {
      fitness: fitnessData.slice(sliceStart),
      daily: dailyData.slice(sliceStart),
    };
  }, [fitnessData, dailyData, range]);

  const currentPoint = rangeData.fitness[rangeData.fitness.length - 1] ?? null;
  const rangeStartPoint = rangeData.fitness[0] ?? null;

  // ── 모든 useMemo 는 early return 이전에 호출 (rules-of-hooks 준수) ────────────
  // 파워 커브 추이 — 서버 metrics.mmp(activity-metrics 가 GCS 스트림까지 파싱·계산해둔
  // duration 별 최대 평균 파워) 집계. period 별로 각 duration 의 max 를 취해 곡선 구성.
  // 가상파워 활동은 PR #167 정책상 mmp 가 비어 곡선 기여 X (실측 파워만 반영).
  const powerCurveProgressions = useMemo(() => {
    const DUR_SEC: Record<string, number> = {
      "1s": 1, "5s": 5, "10s": 10, "30s": 30,
      "1m": 60, "2m": 120, "5m": 300, "10m": 600,
      "20m": 1200, "30m": 1800, "1h": 3600,
    };
    const now = Date.now();
    const d28 = 28 * 24 * 60 * 60 * 1000;
    const recentCutoff = now - d28;
    const prevCutoff = now - d28 * 2;

    function aggregate(metricsArr: ActivityMetrics[]): { durationSeconds: number; maxPower: number }[] {
      const maxPerDur: Record<string, number> = {};
      for (const m of metricsArr) {
        if (!m?.mmp) continue;
        for (const [k, v] of Object.entries(m.mmp)) {
          if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) continue;
          if (!(k in maxPerDur) || v > maxPerDur[k]!) maxPerDur[k] = v;
        }
      }
      return Object.entries(maxPerDur)
        .map(([k, v]) => ({ durationSeconds: DUR_SEC[k] ?? 0, maxPower: Math.round(v) }))
        .filter(p => p.durationSeconds > 0)
        .sort((a, b) => a.durationSeconds - b.durationSeconds);
    }

    const recent: ActivityMetrics[] = [];
    const previous: ActivityMetrics[] = [];
    for (const a of disciplineActivities) {
      const m = metricsMap.get(a.id);
      if (!m) continue;
      if (a.startTime >= recentCutoff) recent.push(m);
      else if (a.startTime >= prevCutoff) previous.push(m);
    }
    return [
      { label: t("period.recent"), color: "var(--lime)", points: aggregate(recent) },
      { label: t("period.previous"), color: "var(--ink-3)", points: aggregate(previous) },
    ];
  }, [disciplineActivities, metricsMap, t]);

  // 주간 TSS 통계
  const weeklyStats = useMemo(() => {
    const recent42 = dailyData.slice(-42);
    const thisWeekDays = recent42.slice(-7);
    const thisWeekTSS = thisWeekDays.reduce((s, d) => s + d.totalLoad, 0);
    const totalWeeks = Math.max(1, Math.ceil(recent42.length / 7));
    const avgWeekTSS = Math.round(recent42.reduce((s, d) => s + d.totalLoad, 0) / totalWeeks);

    // 연속 휴식일 (뒤에서부터)
    let restDays = 0;
    for (let i = recent42.length - 1; i >= 0; i--) {
      if (recent42[i]!.totalLoad === 0) restDays++;
      else break;
    }

    return { thisWeekTSS, avgWeekTSS, restDays };
  }, [dailyData]);

  // (제거 2026-05-28) 종목별 CTL 계산은 위 dead block 과 함께 제거. 복구 시 git history.

  // 심박 기반 존 분포 — 서버 계산 metrics.hrZoneSec (z1..z5 누적 초) 합산.
  // 기존 클라가 stream.heartrate 를 직접 읽던 방식은 GCS 저장 스트림(이 사용자 86%) 을
  // 다운로드하지 않아 거의 빈 결과 → metrics 컬렉션으로 교체. maxHr 경계는 서버에서
  // 활동별 athlete.maxHr 로 이미 계산됨 (FitnessPage 의 profile.maxHr 기준 임의 보정은 X).
  const zoneDistribution = useMemo(() => {
    const { counts: sums, total } = aggregateRecentZoneSeconds(
      disciplineActivities, metricsMap, "hrZoneSec", 5, Date.now(), 30,
    );
    if (total === 0) return null;
    return sums.map(c => Math.round((c / total) * 100));
  }, [disciplineActivities, metricsMap]);

  // 모바일 UI는 "최근 4주"를 약속하므로 데스크톱의 30일 분포와 별도로 정확히 28일만 집계한다.
  const mobileZoneDistribution = useMemo(() => {
    const { counts: sums, total } = aggregateRecentZoneSeconds(
      disciplineActivities, metricsMap, "hrZoneSec", 5,
    );
    if (total === 0) return null;
    return sums.map(c => Math.round((c / total) * 100));
  }, [disciplineActivities, metricsMap]);

  const runPaceStreams = useMemo(() => {
    const now = Date.now();
    const d28 = 28 * 24 * 60 * 60 * 1000;
    const recentStreams: PaceStream[] = [];
    const prevStreams: PaceStream[] = [];
    for (const a of disciplineActivities) {
      const stream = streamsMap.get(a.id);
      if (!stream?.velocity_smooth || stream.velocity_smooth.length < 30) continue;
      const paceStream = { velocity: stream.velocity_smooth, time: stream.time };
      if (a.startTime >= now - d28) recentStreams.push(paceStream);
      else if (a.startTime >= now - d28 * 2) prevStreams.push(paceStream);
    }
    return { recentStreams, prevStreams };
  }, [disciplineActivities, streamsMap]);

  if (!user) {
    return <GuestValuePreview kind="fitness" lang={i18n.language} />;
  }

  if (isMobile && (loading || !timeseriesLoaded)) {
    return (
      <div style={{ padding: "20px 16px 40px" }}>
        <LoadingSkeleton kind="chart" />
      </div>
    );
  }

  if (isMobile && error) {
    return (
      <div style={{ padding: "20px 16px 40px" }}>
        <ErrorState title={t("error.dataFailed")} description={error} />
      </div>
    );
  }

  if (isMobile && activities.length === 0) {
    return (
      <div style={{ padding: "20px 16px 40px" }}>
        <EmptyState
          icon="📈"
          title={t("empty.noActivities")}
          description={t("empty.hint")}
          actions={[
            { label: t("empty.connectStrava"), variant: "primary", href: "/settings?section=connections" },
          ]}
        />
      </div>
    );
  }

  // TriFitnessView 는 데스크톱 전용 레이아웃이다. 모바일 tri 는 아래의
  // MobileFitnessPage 로 보내 좁은 화면에서 헤더와 카드가 눌리지 않게 한다.
  if (!isMobile && discipline === "tri") {
    return <TriFitnessView activities={activities} streamsMap={streamsMap} range={range} profile={profile} />;
  }

  if (isMobile) {
    const ftp = profile?.ftp ?? 0;
    const cp = currentPoint;

    // PMC 추이 — 데스크톱 range 선택과 같은 데이터 범위를 모바일에도 전달한다.
    const pmcHistory = rangeData.fitness.map((p) => ({
      ctl: p.ctl, atl: p.atl, tsb: p.tsb, date: p.date,
    }));

    // 주간 TSS (최근 4주)
    const last28 = dailyData.slice(-28);
    const weeklyTSS = [0, 1, 2, 3].map((wk) => {
      const start = wk * 7;
      return Math.round(last28.slice(start, start + 7).reduce((s, d) => s + d.totalLoad, 0));
    });

    // 파워 존 분포 — 서버 계산 metrics.powerZoneSec(z1..z7 누적 초) 합산. z2~z7 을 z1~z6
    // 으로 매핑 (서버 z1=Active Recovery 는 클라 z1=Recovery 와 동일). bike 전용.
    const { counts: powerZoneCounts, total: powerSamples } = discipline === "bike"
      ? aggregateRecentZoneSeconds(disciplineActivities, metricsMap, "powerZoneSec", 6)
      : { counts: [0, 0, 0, 0, 0, 0], total: 0 };

    type MobZone = { name: string; pct: number; color: string; rangeLabel: string; percentLabel: string };
    type ZoneSrc = "power" | "hr" | "none";
    let zones: MobZone[] = [];
    let zoneSource: ZoneSrc = "none";
    const hrFracs = mobileZoneDistribution ?? [0, 0, 0, 0, 0];
    const maxHr = profile?.maxHr ?? 200;
    const hrZoneBounds = [{ lo: 0, hi: 60 }, { lo: 60, hi: 70 }, { lo: 70, hi: 80 }, { lo: 80, hi: 90 }, { lo: 90, hi: 100 }];
    const hrColors = ["var(--ink-3)", "var(--aqua)", "var(--lime)", "var(--amber)", "var(--rose)"];
    const hrNames = [
      t("hrZone.recovery"),
      t("hrZone.endurance"),
      t("hrZone.tempo"),
      t("hrZone.threshold"),
      t("hrZone.vo2max"),
    ];

    // 바이크: FTP 가 있으면 6 파워존 구조를 항상 표시 (분포 데이터 부재 시 0%).
    // 분포 소스 우선순위: 실측 파워 → HR(Z1~Z5 매핑, Z6 = 0) → 없음.
    if (discipline === "bike" && ftp > 0) {
      let pcts: number[] = [0, 0, 0, 0, 0, 0];
      if (powerSamples > 0) {
        zoneSource = "power";
        pcts = powerZoneCounts.map((c) => Math.round((c / powerSamples) * 100));
      } else if (mobileZoneDistribution) {
        zoneSource = "hr";
        // HR Z1~Z5 → 파워 Z1~Z5, Z6 = 0 (HR 로는 무산소 분리 불가).
        pcts = [hrFracs[0] ?? 0, hrFracs[1] ?? 0, hrFracs[2] ?? 0, hrFracs[3] ?? 0, hrFracs[4] ?? 0, 0];
      }
      zones = zoneSource === "none" ? [] : [
        { name: t("zone.recovery"),  pct: pcts[0]!, color: "var(--ink-3)", rangeLabel: `< ${Math.round(ftp * 0.55)} W`,                            percentLabel: "~55%" },
        { name: t("zone.endurance"), pct: pcts[1]!, color: "var(--aqua)",  rangeLabel: `${Math.round(ftp * 0.55)}–${Math.round(ftp * 0.75)} W`,    percentLabel: "55–75%" },
        { name: t("zone.tempo"),     pct: pcts[2]!, color: "var(--lime)",  rangeLabel: `${Math.round(ftp * 0.75)}–${Math.round(ftp * 0.90)} W`,    percentLabel: "75–90%" },
        { name: t("zone.threshold"), pct: pcts[3]!, color: "var(--amber)", rangeLabel: `${Math.round(ftp * 0.90)}–${Math.round(ftp * 1.05)} W`,    percentLabel: "90–105%" },
        { name: "VO₂max",            pct: pcts[4]!, color: "var(--rose)",  rangeLabel: `${Math.round(ftp * 1.05)}–${Math.round(ftp * 1.20)} W`,    percentLabel: "105–120%" },
        { name: t("zone.anaerobic"), pct: pcts[5]!, color: "var(--zone-5)", rangeLabel: `> ${Math.round(ftp * 1.20)} W`,                            percentLabel: ">120%" },
      ];
    } else if (mobileZoneDistribution) {
      zoneSource = "hr";
      zones = hrZoneBounds.map((z, i) => ({
        name: hrNames[i]!,
        pct: hrFracs[i] ?? 0,
        color: hrColors[i]!,
        rangeLabel: `${Math.round(maxHr * z.lo / 100)}–${Math.round(maxHr * z.hi / 100)} bpm`,
        percentLabel: `${z.lo}–${z.hi}% maxHR`,
      }));
    }

    // 파워 커브 (recent 기간)
    const recentPC = powerCurveProgressions.find((p) => p.label === t("period.recent"));
    const powerCurve = recentPC?.points
      ?.filter((p) => p.maxPower > 0)
      .map((p) => ({ durationSeconds: p.durationSeconds, maxPower: Math.round(p.maxPower) }));

    // 임계값 (종목별)
    let threshold: { label: string; value: string; unit: string; sub: string } | null = null;
    if (discipline === "run" && profile?.thresholdPace) {
      threshold = { label: t("mobile.threshold.runLabel"), value: secToMmss(profile.thresholdPace), unit: "/km", sub: t("mobile.threshold.runSub") };
    } else if (discipline === "swim" && profile?.css) {
      threshold = { label: "CSS", value: secToMmss(profile.css), unit: "/100m", sub: t("mobile.threshold.swimSub") };
    } else if (ftp > 0) {
      threshold = { label: "FTP", value: String(ftp), unit: "W", sub: t("mobile.threshold.bikeSub") };
    }

    return (
      <MobileFitnessPage
        data={{
          ctl: cp?.ctl ?? 0,
          atl: cp?.atl ?? 0,
          tsb: cp?.tsb ?? 0,
          pmcHistory,
          pmcProjection: projection?.series ?? null,
          today: toLocalDate(Date.now()),
          weeklyTSS,
          thisWeekTSS: weeklyStats.thisWeekTSS,
          avgWeekTSS: weeklyStats.avgWeekTSS,
          restDays: weeklyStats.restDays,
          threshold,
          ftp,
          weightKg: profile?.weightKg,
          hasLoadData: cp != null,
          pdcSummary: discipline === "bike" ? {
            riderType: pdc?.riderType ?? null,
            abilityPercentile: pdc?.ability?.overallPercentile ?? null,
            vo2maxEst: pdc?.vo2maxEst ?? null,
            vo2maxPercentile: pdc?.vo2maxEst != null && cohortStats.status === "ready"
              ? percentileOf(pdc.vo2maxEst, cohortStats.stats.metrics?.vo2max?.cohorts?.all ?? {})
              : null,
            cohortSampleSize: cohortStats.status === "ready" ? cohortStats.stats.sampleSize : null,
            activityCount: pdc?.activityCount ?? null,
          } : null,
          zones,
          zoneSource,
          powerCurve,
          ftpProgression: deriveEstimatedFtpProgression(pdc?.history),
          ftpBreakthrough: pdc?.pdcModel != null && pdc.activityCount >= 5
            ? detectFtpBreakthrough(profile?.ftp, pdc.pdcModel.ftpEst)
            : null,
          discipline,
        }}
        consistencyStreak={consistencyStreak}
      />
    );
  }

  // loading/error/empty 분기는 헤더 정의(pageHeader) 이후로 이동 — 어느 상태든
  // 헤더(h1)를 즉시 렌더해 LCP 요소를 차트가 아닌 정적 헤더로 고정한다. (아래 참조)

  // KPI 계산
  const ctl = currentPoint?.ctl ?? 0;
  const atl = currentPoint?.atl ?? 0;
  const tsb = currentPoint?.tsb ?? 0;
  const ctlDelta = rangeStartPoint ? ctl - rangeStartPoint.ctl : 0;
  const formulaVo2max = profile?.ftp ? Math.round((profile.ftp / (profile.weightKg || 70)) * 15.7 + 3.5) : null;
  const displayedVo2max = pdc?.vo2maxEst != null ? Math.round(pdc.vo2maxEst) : formulaVo2max;

  // 훈련 상태 판정용 CTL 램프 — 선택된 range(최대 365일)로 나누면 희석되므로
  // 항상 최근 28일 기울기를 쓴다. 표본이 모자라면 null(램프 승격 규칙 비활성).
  const RAMP_WINDOW_DAYS = 28;
  const rampStartPoint = fitnessData.length > RAMP_WINDOW_DAYS
    ? fitnessData[fitnessData.length - 1 - RAMP_WINDOW_DAYS]
    : null;
  const ctlRampPerWeek = rampStartPoint
    ? ((ctl - rampStartPoint.ctl) / RAMP_WINDOW_DAYS) * 7
    : null;

  // 자막 생성
  const subtitleParts: string[] = [];
  if (projection) {
    const projDays = projection.series.length;
    subtitleParts.push(t("header.subtitle.actualWithProjection", { range, projDays }));
  } else {
    subtitleParts.push(t("header.subtitle.actual", { range }));
  }
  if (activeGoal && projection) {
    const goalDateObj = new Date(activeGoal.eventDate);
    const goalDateStr = `${goalDateObj.getMonth() + 1}/${goalDateObj.getDate()}`;
    const tsbVal = Math.round(projection.goalDay.tsb);
    subtitleParts.push(
      t("header.subtitle.goal", {
        course: activeGoal.courseName,
        date: goalDateStr,
        ctl: Math.round(projection.goalDay.ctl),
        tsb: tsbVal >= 0 ? `+${tsbVal}` : tsbVal,
      })
    );
  }

  // 파워 커브 데이터 분리
  const currentPowerCurve = powerCurveProgressions.find((p) => p.label === t("period.recent"));
  const prevPowerCurve = powerCurveProgressions.find((p) => p.label === t("period.previous"));

  // 파워 커브 주요 구간 값
  const pcKeyDurations = [5, 60, 300, 1200];
  const pcKeyLabels = [t("powerCurve.label.sprint"), t("powerCurve.label.anaerobic"), t("powerCurve.label.vo2"), t("powerCurve.label.ftp")];
  const pcKeyNames = [t("powerCurve.duration.5s"), t("powerCurve.duration.1m"), t("powerCurve.duration.5m"), t("powerCurve.duration.20m")];
  const pcKeyValues = pcKeyDurations.map((d) => {
    const pt = currentPowerCurve?.points.find((p) => p.durationSeconds === d);
    return pt?.maxPower ?? null;
  });

  // 기대파워 (CP/W' 모델) — bike + pdc.cp 있을 때만. 서버 저장 없이 클라 파생.
  const expectedCurvePoints: PowerCurvePoint[] | undefined =
    discipline === "bike" && pdc?.cp != null
      ? computeExpectedCurve(pdc.cp.value, pdc.cp.wPrime).map((p) => ({
          durationSeconds: p.durationSeconds,
          maxPower: p.watts,
        }))
      : undefined;

  // 야외 페이싱 가이드 — CP 기반 장거리 지속파워 권장 범위. bike + pdc.cp 있을 때만.
  const pacingGuide =
    discipline === "bike" && pdc?.cp != null
      ? computeOutdoorPacingGuide(pdc.cp.value, profile?.weightKg)
      : null;

  // #461 VO2max 월별 트렌드 — pdc.history 의 월별 mmp("5m"|"1h"=CP 폴백)와 체중으로 파생(서버 미저장, 클라 계산).
  const vo2maxTrend =
    discipline !== "bike" || !pdc?.history?.length
      ? []
      : (() => {
          const weightKg = profile?.weightKg ?? pdc.weightKgSnapshot ?? null;
          if (weightKg == null) return [];
          return pdc.history
            .map((h) => ({
              period: h.period,
              v: estimateCyclingVo2max({ power5minW: h.mmp?.["5m"] ?? null, cpW: pdc.cp?.value ?? null, weightKg }),
            }))
            .filter((p): p is { period: string; v: number } => p.v != null);
        })();

  const ftpProgression = deriveEstimatedFtpProgression(pdc?.history);
  const ftpBreakthrough = pdc?.pdcModel != null && pdc.activityCount >= 5
    ? detectFtpBreakthrough(profile?.ftp, pdc.pdcModel.ftpEst)
    : null;

  // 강점/약점 — mmpAll(duration 별 best)과 CP 모델 기대파워 갭 분류.
  const powerGaps: GapEntry[] =
    discipline === "bike" && pdc?.cp != null && pdc.mmpAll
      ? classifyGaps(
          Object.fromEntries(
            (Object.entries(pdc.mmpAll) as [PowerDurationKey, { value: number } | undefined][])
              .filter(([k, v]) => v != null && k in POWER_DURATION_KEY_SEC)
              .map(([k, v]) => [POWER_DURATION_KEY_SEC[k], v!.value]),
          ),
          pdc.cp.value,
          pdc.cp.wPrime,
        )
      : [];
  const strengths = powerGaps.filter((g) => g.label === "strength");
  const weaknesses = powerGaps.filter((g) => g.label === "weakness");

  // 페이지 헤더 — PageHeader 패턴. const 로 추출해 loading/error/empty/정상 4상태가
  // 동일 헤더를 공유한다. 콜드 진입 시 차트 데이터가 도착하기 전에도 헤더(h1)가 즉시
  // 페인트돼 LCP 요소가 늦게 뜨는 차트가 아닌 정적 헤더로 고정 → LCP 꼬리 제거.
  const pageHeader = (
    <div className="site-shell" style={{ padding: "24px 28px 18px", borderBottom: "1px solid var(--line-soft)", display: "flex", alignItems: "flex-end", gap: 'var(--space-6)' }}>
      <div style={{ flex: 1 }}>
        <Text as="div" variant="eyebrow" style={{ marginBottom: 'var(--space-2)', display: "flex", alignItems: "center", gap: 'var(--space-3)' }}>
          <span>{t("header.eyebrow", { date: formatMonthDay(i18n.language) })}</span>
          <RevalidatingIndicator
            visible={revalidating || justRecomputed}
            mode={revalidating ? "updating" : "success"}
          />
        </Text>
        <Text as="h1" variant="pageTitle" style={{ marginBottom: "var(--space-1-5)" }}>
          {t("header.title")}
        </Text>
        <div style={{ color: "var(--ink-2)", fontSize: "var(--fs-sm)" }}>
          {subtitleParts.join(" ")}
        </div>
      </div>
      <div style={{ display: "flex", gap: 'var(--space-2)', alignItems: "center" }}>
        <DisciplineTabs includeTri />
          <div style={{ display: "flex", gap: "var(--space-0-5)", background: "var(--bg-1)", padding: "var(--space-1)", borderRadius: "var(--r-md)", border: "1px solid var(--line-soft)" }}>
            {getRangeOptions(t).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRange(opt.value)}
                style={{
                  padding: "5px 12px",
                  fontSize: "var(--fs-xs)",
                  borderRadius: "var(--r-sm)",
                  background: range === opt.value ? "var(--bg-3)" : "transparent",
                  color: range === opt.value ? "var(--ink-0)" : "var(--ink-3)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {opt.label}
              </button>
            ))}
        </div>
      </div>
    </div>
  );

  const bodyPad = { padding: "20px 24px 40px" };

  // 데이터 의존 본문만 상태별로 스왑 — 헤더는 항상 즉시 페인트.
  // 정본 timeseries doc 이 도착하기 전(doc 보유 유저)엔 스켈레톤 유지 — 클라 폴백(부정확
  // 콜드 CTL)으로 한 번 그렸다가 정본으로 스왑하며 곡선/KPI 가 튀는 깜빡임 방지(리뷰 #340).
  // doc 부재/미인증은 훅이 loaded=true 를 즉시 세팅하므로 추가 대기 없음. (이 지점은 이미
  // tri·미인증 early-return 뒤라 discipline 은 bike/run/swim, user 는 truthy 로 좁혀져 있다.)
  if (loading || !timeseriesLoaded) {
    return (
      <div>
        {pageHeader}
        <div className="site-shell" style={bodyPad}><LoadingSkeleton kind="chart" /></div>
      </div>
    );
  }
  if (error) {
    return (
      <div>
        {pageHeader}
        <div className="site-shell" style={bodyPad}><ErrorState title={t("error.dataFailed")} description={error} /></div>
      </div>
    );
  }
  if (activities.length === 0) {
    return (
      <div>
        {pageHeader}
        <div className="site-shell" style={bodyPad}>
          <EmptyState
            icon="📈"
            title={t("empty.noActivities")}
            description={t("empty.hint")}
            actions={[
              { label: t("empty.connectStrava"), variant: "primary", href: "/settings?section=connections" },
            ]}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      {pageHeader}

      <div className="site-shell" style={bodyPad}>
        {/* 오늘의 결론 (#400 §1·§2) — 경고/회복/주간해석/워크아웃 추천을 모순 없는 한 문장으로
            합성한 결론 + 바로 아래 유일한 primary CTA(TodaysWorkoutCard). 근거가 되는 개별
            지표 카드는 아래 "근거 보기" 상세로 내려간다. */}
        {currentPoint && (
          <TodayConclusion
            tsb={tsb}
            restDays={weeklyStats.restDays}
            thisWeekTSS={weeklyStats.thisWeekTSS}
            avgWeekTSS={weeklyStats.avgWeekTSS}
          />
        )}

        <div style={{ marginBottom: "var(--space-4)" }}>
          <TodaysWorkoutCard variant="compact" />
        </div>

        {(activeGoal?.adaptationFlag || consistencyStreak || currentPoint) && (
          <DetailsSection title={t("conclusion.evidenceToggle")}>
            {/* Plan 적응 한 줄 요약 — warn/critical 일 때만 노출. 클릭 시 /plan 으로 이동. */}
            {activeGoal?.adaptationFlag && (
              <AdaptationSummary
                flag={activeGoal.adaptationFlag}
                style={{ marginBottom: 'var(--space-4)' }}
              />
            )}

            {consistencyStreak && (
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <ConsistencyStreakCard summary={consistencyStreak} />
              </div>
            )}

            {currentPoint && (
              <FitnessWeeklyInsight
                ctlDelta={ctlDelta}
                ctl={ctl}
                atl={atl}
                tsb={tsb}
                dailyData={dailyData}
                t={t}
              />
            )}

            {/* 훈련 상태 — 숫자(KPI) 앞에 일상어 라벨을 먼저 (§3.5) */}
            {currentPoint && (
              <TrainingStatusCard
                tsb={tsb}
                ctl={ctl}
                atl={atl}
                ctlRampPerWeek={ctlRampPerWeek}
                sport={discipline}
              />
            )}
          </DetailsSection>
        )}

        {/* 거리별 기록 보드 — 러닝 탭 (§3.4a). 임계 페이스 곡선은 페이지 하단에 이미 있어
            여기선 표만 둔다(중복 방지). */}
        {discipline === "run" && <RunRecordsBoard run={runRecords} />}

        {/* 마일스톤 그리드 — 러닝 탭 (§3.4b) */}
        {discipline === "run" && <MilestonesGrid achieved={milestones} />}

        {/* 신규 달성 축하 — celebrated:false 하나. 닫으면 서버에 celebrated:true 기록. */}
        {pendingMilestone && (
          <MilestoneCelebration
            milestoneId={pendingMilestone}
            onClose={() => {
              void markCelebrated(pendingMilestone);
              setDismissedMilestones((prev) => new Set(prev).add(pendingMilestone));
            }}
          />
        )}

        {/* KPI 스트립 */}
        {currentPoint && (
          <Card padding="none" style={{ padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--space-3)", border: "none", background: "transparent", boxShadow: "none" }}>
            {[
              {
                label: t("kpi.ctl.label"),
                value: ctl.toFixed(1),
                sub: t("kpi.ctl.subDelta", { delta: `${ctlDelta >= 0 ? "+" : ""}${ctlDelta.toFixed(1)}`, range }),
                color: "var(--lime)",
                desc: ctlDelta > 5 ? t("kpi.ctl.descUp") : ctlDelta > 0 ? t("kpi.ctl.descMild") : t("kpi.ctl.descFlat"),
                hint: t("kpi.ctl.hint"),
              },
              {
                label: t("kpi.atl.label"),
                value: atl.toFixed(1),
                sub: t("kpi.atl.sub"),
                color: "var(--rose)",
                desc: atl > ctl ? t("kpi.atl.descHigh") : t("kpi.atl.descNormal"),
                hint: t("kpi.atl.hint"),
              },
              {
                label: t("kpi.tsb.label"),
                value: `${tsb >= 0 ? "+" : ""}${tsb.toFixed(1)}`,
                sub: tsbStatusDesc(tsb, t),
                color: "var(--amber)",
                desc: tsbStatusLabel(tsb, t),
                hint: t("kpi.tsb.hint"),
              },
              discipline === "run"
                ? {
                    label: t("kpi.thresholdPace"),
                    value: profile?.thresholdPace ? secToMmss(profile.thresholdPace) : "—",
                    unit: "/km",
                    sub: "",
                    color: "var(--aqua)",
                    desc: "",
                    hint: t("kpi.thresholdPaceHint"),
                  }
                : discipline === "swim"
                ? {
                    label: "CSS",
                    value: profile?.css ? secToMmss(profile.css) : "—",
                    unit: "/100m",
                    sub: "",
                    color: "var(--aqua)",
                    desc: "",
                    hint: t("kpi.cssHint"),
                  }
                : {
                    label: "FTP",
                    value: profile?.ftp ? String(profile.ftp) : "—",
                    unit: "W",
                    sub: "",
                    color: "var(--aqua)",
                    desc: "",
                    hint: t("kpi.ftpHint"),
                  },
              ...(discipline === "bike" ? [{
                label: "VO2max",
                value: displayedVo2max != null ? String(displayedVo2max) : "—",
                unit: "ml/kg/min",
                sub: pdc?.vo2maxEst != null && formulaVo2max != null ? t("kpi.vo2max.subFormula", { value: formulaVo2max }) : "",
                color: "var(--lime)",
                desc: pdc?.vo2maxEst != null ? t("kpi.vo2max.descServer") : t("kpi.vo2max.descFormula"),
                hint: t("kpi.vo2max.hint"),
              }] : []),
            ].map((s, i) => (
              <div key={i} style={{ padding: "22px 24px", border: "1px solid var(--line-soft)", borderRadius: "var(--r-lg)", background: "var(--bg-1)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1-5)", marginBottom: "var(--space-2)" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color }} />
                  <Text variant="eyebrow">{s.label}</Text>
                </div>
                {s.hint && (
                  <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-4)", marginBottom: "var(--space-1)" }}>
                    {s.hint}
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "baseline", gap: 'var(--space-1)', marginBottom: 'var(--space-2)' }}>
                  <Text variant="dataHero" style={{ fontSize: "var(--fs-4xl)", color: s.color }}>{s.value}</Text>
                  {s.unit && <Text variant="unit">{s.unit}</Text>}
                </div>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>
                  <Text variant="mono">{s.sub}</Text>
                  {s.sub && s.desc && <span style={{ color: "var(--ink-4)", margin: "0 5px" }}>·</span>}
                  {s.desc && <span>{s.desc}</span>}
                </div>
              </div>
            ))}
          </Card>
        )}

        {/* FTP 지속시간 (TTE) — PDC 서버 계산 결과, bike 종목이고 pdcModel 있을 때만 표시 */}
        {discipline === "bike" && pdc?.pdcModel != null && (
          <Card padding="none" style={{ marginTop: 'var(--space-4)', padding: "16px 24px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
            <div style={{ borderRight: "1px solid var(--line-soft)", paddingRight: 'var(--space-5)' }}>
              <Text as="div" variant="eyebrow" style={{ marginBottom: 'var(--space-1)' }}>{t("ftpCard.tteLabel")}</Text>
              <div style={{ display: "flex", alignItems: "baseline", gap: 'var(--space-1)' }}>
                <Text variant="dataLarge" style={{ color: "var(--aqua)" }}>~{Math.round(pdc.pdcModel.tteMin)}</Text>
                <Text variant="unit">{t("ftpCard.tteUnit")}</Text>
              </div>
              <Text as="div" variant="eyebrow" style={{ marginTop: 'var(--space-1)', color: "var(--ink-4)" }}>
                {t("ftpCard.tteSub")}
              </Text>
            </div>
            <div style={{ borderRight: "1px solid var(--line-soft)", padding: `0 var(--space-5)` }}>
              <Text as="div" variant="eyebrow" style={{ marginBottom: 'var(--space-1)' }}>{t("ftpCard.cpLabel")}</Text>
              <div style={{ display: "flex", alignItems: "baseline", gap: 'var(--space-1)' }}>
                <Text variant="dataLarge" style={{ color: "var(--aqua)" }}>{Math.round(pdc.pdcModel.cpEst)}</Text>
                <Text variant="unit">W</Text>
              </div>
              <Text as="div" variant="eyebrow" style={{ marginTop: 'var(--space-1)', color: "var(--ink-4)" }}>
                {t("ftpCard.cpSub")}
              </Text>
            </div>
            <div style={{ paddingLeft: 'var(--space-5)' }}>
              <Text as="div" variant="eyebrow" style={{ marginBottom: 'var(--space-1)' }}>{t("ftpCard.ftpEstLabel")}</Text>
              <div style={{ display: "flex", alignItems: "baseline", gap: 'var(--space-1)' }}>
                <Text variant="dataLarge" style={{ color: "var(--aqua)" }}>{Math.round(pdc.pdcModel.ftpEst)}</Text>
                <Text variant="unit">W</Text>
              </div>
              <Text as="div" variant="eyebrow" style={{ marginTop: 'var(--space-1)', color: "var(--ink-4)" }}>
                {t("ftpCard.ftpEstSub")}
              </Text>
            </div>
          </Card>
        )}

        {discipline === "bike" && (
          <FtpProgressionCard
            points={ftpProgression}
            currentFtpW={profile?.ftp}
            breakthrough={ftpBreakthrough}
          />
        )}

        {/* 상세 분석 (#400 §1·§4·§5) — 바이크 개선 액션·VO2max·강점/약점·야외 페이싱·
            라이더 유형·코호트 백분위는 오늘의 결론 근거로, 기본 접힘 progressive disclosure. */}
        {discipline === "bike" && (
        <DetailsSection title={t("conclusion.detailToggle")}>
        {discipline === "bike" && (
          <BikeActionAccordion
            ftp={profile?.ftp}
            hasPdcModel={pdc?.pdcModel != null}
            hasZoneData={!!zoneDistribution}
            t={t}
          />
        )}

        {/* VO2max 추정 — bike 종목이고 vo2maxEst 있을 때만 표시 */}
        {discipline === "bike" && pdc?.vo2maxEst != null && (
          <Card padding="none" style={{ marginTop: 'var(--space-4)', padding: "16px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-4)' }}>
              <div>
                <Text as="div" variant="eyebrow" style={{ marginBottom: 'var(--space-1)' }}>{t("vo2maxCard.label")}</Text>
                <div style={{ display: "flex", alignItems: "baseline", gap: 'var(--space-1)' }}>
                  <Text variant="dataLarge" style={{ color: "var(--aqua)" }}>~{pdc.vo2maxEst}</Text>
                  <Text variant="unit">ml/kg/min</Text>
                </div>
                <Text as="div" variant="eyebrow" style={{ marginTop: 'var(--space-1)', color: "var(--ink-4)" }}>
                  {t("vo2maxCard.sub")}
                </Text>
              </div>
              {/* #461 월별 VO2max 트렌드 스파크라인 (히스토리 2개월+ 있을 때) */}
              {vo2maxTrend.length >= 2 && (() => {
                const vals = vo2maxTrend.map((p) => p.v);
                const lo = Math.min(...vals), hi = Math.max(...vals);
                const w = 132, h = 40, span = hi - lo || 1;
                const sx = (i: number) => (i / (vals.length - 1)) * w;
                const sy = (v: number) => h - ((v - lo) / span) * h;
                const path = vals.map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(" ");
                const delta = vals[vals.length - 1]! - vals[0]!;
                return (
                  <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 'var(--space-1)' }}>
                    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h, display: "block" }} preserveAspectRatio="none">
                      <path d={`M0 ${h} ${path.replace(/^M/, "L")} L${w} ${h} Z`} fill="var(--aqua)" opacity="0.14" />
                      <path d={path} stroke="var(--aqua)" strokeWidth="1.5" fill="none" />
                    </svg>
                    <Text as="div" variant="mono" className="text-[length:var(--fs-xs)]" style={{ color: delta >= 0 ? "var(--lime)" : "var(--rose)" }}>
                      {delta >= 0 ? "+" : ""}{delta.toFixed(1)} · {t("vo2maxCard.trendSpan", { n: vo2maxTrend.length })}
                    </Text>
                  </div>
                );
              })()}
            </div>
          </Card>
        )}

        {/* 강점/약점 — CP 모델 기대파워 대비 실제 best 갭. bike + pdc.cp + 분류 결과 있을 때만 */}
        {discipline === "bike" && pdc?.cp != null && (strengths.length > 0 || weaknesses.length > 0) && (
          <Card padding="none" style={{ marginTop: 'var(--space-4)', padding: "16px 24px" }}>
            <Text as="div" variant="eyebrow" style={{ marginBottom: 'var(--space-3)' }}>{t("gapCard.title")}</Text>
            <div style={{ display: "flex", flexDirection: "column", gap: 'var(--space-3)' }}>
              {strengths.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-3)', flexWrap: "wrap" }}>
                  <Text variant="eyebrow" style={{ width: 48, color: "var(--ink-3)" }}>{t("gapCard.strengthLabel")}</Text>
                  {strengths.map((g) => (
                    <Chip key={g.durationSeconds} variant="success" dot>
                      {durationLabel(g.durationSeconds)} +{Math.round(g.gapPct)}%
                    </Chip>
                  ))}
                </div>
              )}
              {weaknesses.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-3)', flexWrap: "wrap" }}>
                  <Text variant="eyebrow" style={{ width: 48, color: "var(--ink-3)" }}>{t("gapCard.weaknessLabel")}</Text>
                  {weaknesses.map((g) => (
                    <Chip key={g.durationSeconds} variant="warning" dot>
                      {durationLabel(g.durationSeconds)} {Math.round(g.gapPct)}%
                    </Chip>
                  ))}
                </div>
              )}
            </div>
            <Text as="div" variant="eyebrow" style={{ marginTop: 'var(--space-3)', color: "var(--ink-4)" }}>
              {t("gapCard.sub")}
            </Text>
          </Card>
        )}

        {/* 야외 페이싱 가이드 — 장거리/그란폰도 지속 목표. CP(임계파워)의 −10~−5%. bike + pdc.cp 있을 때만 */}
        {pacingGuide && pdc?.cp != null && (
          <Card padding="none" style={{ marginTop: 'var(--space-4)', padding: "16px 24px" }}>
            <Text as="div" variant="eyebrow" style={{ marginBottom: 'var(--space-2)' }}>{t("pacing.title")}</Text>
            <Text as="div" variant="num" style={{ fontSize: "var(--fs-xl)", color: "var(--ink-0)", lineHeight: 1.1 }}>
              {pacingGuide.lowerW}–{pacingGuide.upperW}
              <span style={{ fontSize: "var(--fs-sm)", color: "var(--ink-4)", marginLeft: "var(--space-1)" }}>W</span>
              {pacingGuide.lowerWkg != null && pacingGuide.upperWkg != null && (
                <span style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)", marginLeft: "var(--space-2)" }}>
                  · {pacingGuide.lowerWkg.toFixed(2)}–{pacingGuide.upperWkg.toFixed(2)} W/kg
                </span>
              )}
            </Text>
            <Text as="div" variant="eyebrow" style={{ marginTop: 'var(--space-2)', color: "var(--ink-4)" }}>
              {t("pacing.note", { cp: Math.round(pdc.cp.value) })}
            </Text>
          </Card>
        )}

        {/* 라이더 타입 — bike + riderType 있을 때만 */}
        {discipline === "bike" && pdc?.riderType != null && (
          <RiderTypeCard pdc={pdc} />
        )}

        {/* 코호트 백분위 랭킹(G9) — bike + pdc + stats doc 있을 때만 */}
        {discipline === "bike" && pdc != null && cohortStats.status === "ready" && (
          <CohortRankingCard
            pdc={pdc}
            stats={cohortStats.stats}
            demographics={{
              gender: (profile as { gender?: string | null } | null)?.gender ?? null,
              birthYear: (profile as { birthYear?: number | null } | null)?.birthYear ?? null,
            }}
          />
        )}
        </DetailsSection>
        )}

        {/* PMC 차트 */}
        <Card padding="none" style={{ marginTop: 'var(--space-5)', padding: 'var(--space-5)' }}>
          <div style={{ display: "flex", alignItems: "flex-end", marginBottom: "var(--space-3)" }}>
            <div>
              <h3 style={{ margin: 0, marginBottom: "var(--space-1)", fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)" }}>{t("pmc.title")}</h3>
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{projection ? t("pmc.subWithProjection", { range }) : t("pmc.subActual", { range })}</div>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", gap: 'var(--space-4)', fontSize: "var(--fs-xs)", color: "var(--ink-3)", flexWrap: "wrap" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "var(--space-1-5)" }}>
                <span style={{ width: 14, height: 2, background: "var(--lime)" }} /> {t("pmc.legend.ctl")}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "var(--space-1-5)" }}>
                <span style={{ width: 14, height: 2, background: "var(--rose)" }} /> {t("pmc.legend.atl")}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "var(--space-1-5)" }}>
                <span style={{ width: 14, height: 2, background: "var(--amber)" }} /> {t("pmc.legend.tsb")}
              </span>
              {projection && (
                <>
                  <span style={{ width: 1, height: 12, background: "var(--line-soft)" }} />
                  <span style={{ display: "flex", alignItems: "center", gap: "var(--space-1-5)" }}>
                    <svg width="16" height="4">
                      <line x1="0" y1="2" x2="16" y2="2" stroke="var(--ink-2)" strokeWidth="1.5" strokeDasharray="4 2" />
                    </svg>
                    {t("pmc.legend.projection")}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* 차트 위 한 줄 해석 (#400 §6) — 초심자가 무엇을 먼저 읽어야 할지 알려준다. */}
          {rangeData.fitness.length > 0 && (
            <Text as="p" variant="bodySmall" tone="secondary" style={{ margin: "0 0 var(--space-3)", maxWidth: 640 }}>
              {t("pmc.interpretation")}
            </Text>
          )}

          {rangeData.fitness.length > 0 ? (
            <FitnessChart
              data={rangeData.fitness}
              projection={projection?.series ?? null}
              today={toLocalDate(Date.now())}
              goalDate={activeGoal?.eventDate ?? null}
              goalCTL={projection?.goalDay.ctl ?? null}
              goalTSB={projection?.goalDay.tsb ?? null}
            />
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 280, fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}>
              {t("pmc.empty")}
            </div>
          )}

          {/* 목표 요약 스트립 */}
          {activeGoal && (() => {
            const now = Date.now();
            const daysLeft = Math.max(0, Math.ceil((activeGoal.eventDate - now) / 86400000));
            const eventDateStr = formatKoreanDate(activeGoal.eventDate);
            const goalCTLVal = projection?.goalDay.ctl;
            const goalTSBVal = projection?.goalDay.tsb;
            const adherence = projection?.goalDay.adherenceRate;
            const currentCTL = currentPoint?.ctl ?? 0;

            return (
              <div
                style={{
                  marginTop: 'var(--space-4)',
                  padding: "var(--space-3)",
                  // 카드 안 서피스는 테두리 없이 배경 틴트만 — surface 3단계 유지 (이슈 401)
                  background: "color-mix(in oklch, var(--lime) 5%, var(--bg-2))",
                  borderRadius: "var(--r-md)",
                  display: "grid",
                  gridTemplateColumns: "2fr repeat(3, 1fr) auto",
                  gap: 'var(--space-5)',
                  alignItems: "center",
                }}
              >
                <div>
                  <Text as="div" variant="eyebrow" style={{ color: "var(--lime)", marginBottom: 'var(--space-1)' }}>
                    {t("goal.eyebrow", { course: activeGoal.courseName })}
                  </Text>
                  <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-0)", fontWeight: 500 }}>
                    {eventDateStr} · D-<Text variant="mono" style={{ color: "var(--lime)" }}>{daysLeft}</Text>
                    <span style={{ color: "var(--ink-3)", fontSize: "var(--fs-xs)", marginLeft: "var(--space-2)" }}>
                      {activeGoal.goalType === 'climb'
                        ? `${activeGoal.target?.climbDurationMin ?? activeGoal.targetDurationMin ?? '—'} min${activeGoal.target?.targetWkg != null ? ` · ${activeGoal.target.targetWkg.toFixed(1)} W/kg` : ''}`
                        : `${activeGoal.courseDist.toFixed(1)} km`}
                      {activeGoal.goalType !== 'climb' && activeGoal.targetDurationMin != null && (
                        activeGoal.targetDurationMin % 60 > 0
                          ? t("goal.targetHm", { h: Math.floor(activeGoal.targetDurationMin / 60), m: activeGoal.targetDurationMin % 60 })
                          : t("goal.targetH", { h: Math.floor(activeGoal.targetDurationMin / 60) })
                      )}
                    </span>
                  </div>
                </div>
                <div>
                  <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-1)" }}>{t("goal.ctl")}</Text>
                  {goalCTLVal != null ? (
                    <div>
                      <Text variant="dataMedium" style={{ color: "var(--lime)" }}>{Math.round(goalCTLVal)}</Text>
                      <Text variant="unit">{goalCTLVal > currentCTL ? `+${(goalCTLVal - currentCTL).toFixed(1)}` : (goalCTLVal - currentCTL).toFixed(1)}</Text>
                    </div>
                  ) : (
                    <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)" }}>—</span>
                  )}
                </div>
                <div>
                  <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-1)" }}>{t("goal.tsb")}</Text>
                  {goalTSBVal != null ? (
                    <div>
                      <Text variant="dataMedium" style={{ color: "var(--amber)" }}>
                        {goalTSBVal >= 0 ? `+${Math.round(goalTSBVal)}` : Math.round(goalTSBVal)}
                      </Text>
                      <Text variant="unit">
                        {goalTSBVal >= 5 && goalTSBVal <= 25 ? t("goal.tsbStatus.optimal") : goalTSBVal > 25 ? t("goal.tsbStatus.over") : t("goal.tsbStatus.fatigue")}
                      </Text>
                    </div>
                  ) : (
                    <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)" }}>—</span>
                  )}
                </div>
                <div>
                  <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-1)" }}>{t("goal.adherence")}</Text>
                  {adherence != null ? (
                    <div>
                      <Text variant="dataMedium">{Math.round(adherence * 100)}</Text>
                      <Text variant="unit">%</Text>
                    </div>
                  ) : (
                    <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)" }}>—</span>
                  )}
                </div>
                <a href="/plan" className={`${buttonClass({ variant: 'secondary', size: 'sm' })}`} style={{ whiteSpace: "nowrap", fontSize: "var(--fs-xs)" }}>
                  {t("goal.viewPlan")}
                </a>
              </div>
            );
          })()}
        </Card>

        {/* 종목별 CTL 요약 dead block (2026-05-28 제거) — tri 뷰에서만 표시하던
            컴포넌트. 시안 검토 결과 단일 뷰 (bike/run/swim) 에선 불필요로 결정.
            복구 필요 시 git history 참조: commit 5d00cf2 이전. */}

        {/* 2열 하단: 일별 운동 부하 + 파워 커브 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 'var(--space-5)', marginTop: 'var(--space-5)' }}>
          {/* 일별 운동 부하 */}
          <Card padding="none" style={{ padding: 'var(--space-5)' }}>
            <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 'var(--space-3)' }}>
              <div>
                <h3 style={{ margin: 0, marginBottom: "var(--space-1)", fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)" }}>{t("daily.title")}</h3>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{t("daily.sub")}</div>
              </div>
            </div>
            {rangeData.daily.length > 0 ? (
              <DailyTSSChart data={rangeData.daily} />
            ) : (
              <div style={{ height: 90, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}>
                {t("daily.empty")}
              </div>
            )}
            <div style={{ marginTop: "var(--space-3)", display: "flex", gap: 'var(--space-3)', fontSize: "var(--fs-xs)", color: "var(--ink-3)", flexWrap: "wrap" }}>
              {([
                [t("load.rest"), "var(--bg-3)"],
                [t("load.light"), "var(--aqua-dim, oklch(0.55 0.12 200))"],
                [t("load.moderate"), "var(--lime-dim, oklch(0.55 0.14 130))"],
                [t("load.heavy"), "var(--amber)"],
                [t("load.race"), "var(--rose)"],
              ] as const).map(([l, c]) => (
                <span key={l} style={{ display: "flex", alignItems: "center", gap: 'var(--space-1)' }}>
                  <span style={{ width: 8, height: 8, background: c, borderRadius: "var(--r-xs)" }} />{l}
                </span>
              ))}
            </div>
            <div style={{ marginTop: 'var(--space-4)', paddingTop: 14, borderTop: "1px solid var(--line-soft)", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-3)" }}>
              <div>
                <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-1)" }}>{t("daily.weekTSS")}</Text>
                <div><Text variant="dataMedium">{weeklyStats.thisWeekTSS}</Text></div>
              </div>
              <div>
                <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-1)" }}>{t("daily.avgWeekTSS")}</Text>
                <div><Text variant="dataMedium">{weeklyStats.avgWeekTSS}</Text></div>
              </div>
              <div>
                <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-1)" }}>{t("daily.restDays")}</Text>
                <div><Text variant="dataMedium">{weeklyStats.restDays}</Text><Text variant="unit">{t("daily.daysUnit")}</Text></div>
              </div>
            </div>
          </Card>

          {/* 파워 커브 / 페이스 커브 (종목 분기) */}
          <Card padding="none" style={{ padding: 'var(--space-5)' }}>
            {discipline === "run" ? (
              <>
                <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 'var(--space-3)' }}>
                  <div>
                    <h3 style={{ margin: 0, marginBottom: "var(--space-1)", fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)" }}>{t("paceCurve.title")}</h3>
                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{t("paceCurve.sub")}</div>
                  </div>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", display: "flex", alignItems: "center", gap: "var(--space-1-5)" }}>
                    <span style={{ width: 10, height: 2, borderTop: "1px dashed var(--ink-3)", display: "inline-block" }} /> {t("powerCurve.prevSeason")}
                  </span>
                </div>
                <CriticalPaceCurve recentStreams={runPaceStreams.recentStreams} prevStreams={runPaceStreams.prevStreams} />
              </>
            ) : discipline === "swim" ? (
              <>
                <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 'var(--space-3)' }}>
                  <div>
                    <h3 style={{ margin: 0, marginBottom: "var(--space-1)", fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)" }}>{t("cssCurve.title")}</h3>
                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{t("cssCurve.sub")}</div>
                  </div>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", display: "flex", alignItems: "center", gap: "var(--space-1-5)" }}>
                    <span style={{ width: 10, height: 2, borderTop: "1px dashed var(--ink-3)", display: "inline-block" }} /> {t("powerCurve.prevSeason")}
                  </span>
                </div>
                {(() => {
                  const now = Date.now();
                  const d28 = 28 * 24 * 60 * 60 * 1000;
                  const recentLaps: import("@shared/types").LapData[][] = [];
                  const prevLaps: import("@shared/types").LapData[][] = [];
                  for (const a of disciplineActivities) {
                    const stream = streamsMap.get(a.id);
                    if (!stream?.laps || stream.laps.length === 0) continue;
                    if (a.startTime >= now - d28) recentLaps.push(stream.laps);
                    else if (a.startTime >= now - d28 * 2) prevLaps.push(stream.laps);
                  }
                  return <CSSCurve css={profile?.css} recentLaps={recentLaps} prevLaps={prevLaps} />;
                })()}
              </>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 'var(--space-3)' }}>
                  <div>
                    <h3 style={{ margin: 0, marginBottom: "var(--space-1)", fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)" }}>{t("powerCurve.title")}</h3>
                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{t("powerCurve.sub", { range })}</div>
                  </div>
                  <div style={{ flex: 1 }} />
                  <div style={{ display: "flex", gap: 'var(--space-4)', flexWrap: "wrap" }}>
                    {prevPowerCurve && (
                      <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", display: "flex", alignItems: "center", gap: "var(--space-1-5)" }}>
                        <span style={{ width: 10, height: 2, background: "var(--ink-4)", borderTop: "1px dashed var(--ink-4)" }} /> {t("powerCurve.prevSeason")}
                      </span>
                    )}
                    {expectedCurvePoints && expectedCurvePoints.length > 0 && (
                      <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", display: "flex", alignItems: "center", gap: "var(--space-1-5)" }}>
                        <svg width="10" height="4" aria-hidden>
                          <line x1="0" y1="2" x2="10" y2="2" stroke="var(--aqua)" strokeWidth="1.5" strokeDasharray="2 3" />
                        </svg>
                        {t("powerCurve.expectedLegend")}
                      </span>
                    )}
                  </div>
                </div>
                {currentPowerCurve && currentPowerCurve.points.length > 0 ? (
                  <PowerCurveChart
                    current={currentPowerCurve.points}
                    previous={prevPowerCurve?.points ?? []}
                    expected={expectedCurvePoints}
                  />
                ) : (
                  <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}>
                    {t("powerCurve.empty")}
                  </div>
                )}
                <div style={{ marginTop: "var(--space-3)", paddingTop: 14, borderTop: "1px solid var(--line-soft)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))", gap: "var(--space-2)" }}>
                  {pcKeyDurations.map((_, i) => (
                    <div key={i}>
                      <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-1)" }}>{pcKeyNames[i]} · {pcKeyLabels[i]}</Text>
                      <div>
                        <Text variant="dataMedium">{pcKeyValues[i] != null ? pcKeyValues[i]!.toLocaleString() : "—"}</Text>
                        {pcKeyValues[i] != null && <Text variant="unit">W</Text>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>

        {/* 존 분포 — 단독 풀폭 (오늘의 권장은 상단 hero 로 이동) */}
        <div style={{ marginTop: 'var(--space-5)' }}>
          <Card padding="none" style={{ padding: 'var(--space-5)' }}>
            {(() => {
              const threshPace = profile?.thresholdPace ?? null;
              const css = profile?.css ?? null;
              type ZoneRow = { z: string; name: string; range: string; pct: number | null; time: string; color: string };
              const zd = zoneDistribution;
              const zdPct = (i: number): number | null => (zd ? zd[i] ?? null : null);
              const zones: ZoneRow[] = discipline === "run"
                ? [
                    { z: "Z1", name: ` ${t("zone.recovery")}`,  range: threshPace ? `> ${secToMmss(threshPace + 90)}/km` : "—",                                              pct: zdPct(0), time: "—", color: "var(--zone-1)" },
                    { z: "Z2", name: ` ${t("zone.endurance")}`, range: threshPace ? `${secToMmss(threshPace + 30)}–${secToMmss(threshPace + 90)}/km` : "—",                  pct: zdPct(1), time: "—", color: "var(--zone-2)" },
                    { z: "Z3", name: ` ${t("zone.tempo")}`,  range: threshPace ? `${secToMmss(threshPace - 10)}–${secToMmss(threshPace + 30)}/km` : "—",                  pct: zdPct(2), time: "—", color: "var(--zone-3)" },
                    { z: "Z4", name: ` ${t("zone.threshold")}`,  range: threshPace ? `${secToMmss(threshPace - 30)}–${secToMmss(threshPace - 10)}/km` : "—",                  pct: zdPct(3), time: "—", color: "var(--zone-4)" },
                    { z: "Z5", name: " VO2",   range: threshPace ? `< ${secToMmss(threshPace - 30)}/km` : "—",                                               pct: zdPct(4), time: "—", color: "var(--zone-5)" },
                  ]
                : discipline === "swim"
                ? [
                    { z: "Z1", name: ` ${t("zone.recovery")}`,  range: css ? `> ${secToMmss(css + 25)}/100m` : "—",                                  pct: zdPct(0), time: "—", color: "var(--zone-1)" },
                    { z: "Z2", name: ` ${t("zone.endurance")}`, range: css ? `${secToMmss(css + 10)}–${secToMmss(css + 25)}/100m` : "—",            pct: zdPct(1), time: "—", color: "var(--zone-2)" },
                    { z: "Z3", name: ` ${t("zone.tempo")}`,  range: css ? `${secToMmss(css)}–${secToMmss(css + 10)}/100m` : "—",                  pct: zdPct(2), time: "—", color: "var(--zone-3)" },
                    { z: "Z4", name: ` ${t("zone.threshold")}`,  range: css ? `${secToMmss(css - 10)}–${secToMmss(css)}/100m` : "—",                  pct: zdPct(3), time: "—", color: "var(--zone-4)" },
                    { z: "Z5", name: " VO2",   range: css ? `< ${secToMmss(css - 10)}/100m` : "—",                                  pct: zdPct(4), time: "—", color: "var(--zone-5)" },
                  ]
                : [
                    { z: "Z1", name: ` ${t("zone.recovery")}`,  range: "< 55% FTP",    pct: zdPct(0), time: "—", color: "var(--zone-1)" },
                    { z: "Z2", name: ` ${t("zone.endurance")}`, range: "55–75% FTP",   pct: zdPct(1), time: "—", color: "var(--zone-2)" },
                    { z: "Z3", name: ` ${t("zone.tempo")}`,  range: "75–90% FTP",   pct: zdPct(2), time: "—", color: "var(--zone-3)" },
                    { z: "Z4", name: ` ${t("zone.threshold")}`,  range: "90–105% FTP",  pct: zdPct(3), time: "—", color: "var(--zone-4)" },
                    { z: "Z5", name: " VO2",   range: "> 105% FTP",   pct: zdPct(4), time: "—", color: "var(--zone-5)" },
                  ];
              const subLabel = discipline === "run" ? t("zoneDist.subRun") : discipline === "swim" ? t("zoneDist.subSwim") : t("zoneDist.subBike");
              const allNullPct = zones.every((z) => z.pct === null);
              return (
                <>
                  <SectionHeader title={t("zoneDist.title")} sub={subLabel} />
                  {zones.map((zone) => (
                    <div key={zone.z} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-2)" }}>
                      <div style={{ width: 60 }}>
                        <span style={{ color: zone.color, fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: "var(--fs-xs)" }}>{zone.z}</span>
                        <span style={{ fontSize: "var(--fs-xs)" }}>{zone.name}</span>
                      </div>
                      <div style={{ width: 90, fontSize: "var(--fs-xs)", color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>{zone.range}</div>
                      <div style={{ flex: 1, height: 18, background: "var(--bg-2)", borderRadius: "var(--r-xs)", overflow: "hidden" }}>
                        <div style={{ width: zone.pct != null ? `${zone.pct}%` : "0%", height: "100%", background: zone.color }} />
                      </div>
                      <div style={{ width: 40, textAlign: "right", fontSize: "var(--fs-sm)", fontFamily: "var(--font-mono)" }}>{zone.pct != null ? `${zone.pct}%` : "—"}</div>
                      <div style={{ width: 50, textAlign: "right", fontSize: "var(--fs-xs)", color: "var(--ink-2)", fontFamily: "var(--font-mono)" }}>{zone.time}</div>
                    </div>
                  ))}
                  {allNullPct && (
                    <div style={{ marginTop: 'var(--space-2)', fontSize: "var(--fs-xs)", color: "var(--ink-4)", textAlign: "center" }}>
                      {t("zoneDist.empty")}
                    </div>
                  )}
                </>
              );
            })()}
          </Card>

        </div>
      </div>
    </div>
  );
}
