import { useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc, onSnapshot, type DocumentReference } from "firebase/firestore";
import type { Activity } from "@shared/types";
import type { ActivityMetrics } from "@shared/types/activity-metrics";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { logClientError } from "../../services/errorLogger";
import { getDiscipline } from "../../utils/disciplineFilter";
import {
  getCachedActivityDerivedDocument,
  prepareActivityDerivedDocumentCacheOwner,
  setCachedActivityDerivedDocument,
} from "./activityDerivedDocumentCache";
import {
  activityDerivedDocumentRevision,
  isDerivedDocumentReadCurrent,
  markDerivedDocumentMissing,
  markDerivedDocumentReadComplete,
  markDerivedDocumentReadFailed,
  markDerivedDocumentReadAttempt,
  shouldReadDerivedDocument,
  type DerivedDocumentReadAttempts,
} from "./derivedDocumentReadAttempts";

// 누락 문서는 backend 파생 작업이 끝나는 일반적인 구간만 감시한다. 감시 종료 뒤에도
// 동일 revision을 제한된 backoff로 재확인하되, listener/read 비용은 종류별 상한을 지킨다.
export const DERIVED_DOCUMENT_CREATION_WATCH_MS = 60_000;
export const DERIVED_DOCUMENT_MAX_CREATION_WATCHES_PER_KIND = 24;
export const DERIVED_DOCUMENT_CREATION_RETRY_MS = 5_000;
export const DERIVED_DOCUMENT_READ_TIMEOUT_MS = 10_000;
export const DERIVED_DOCUMENT_CREATION_MAX_RETRIES = 1;
export const DERIVED_DOCUMENT_MISSING_RECHECK_BASE_MS = 60_000;
export const DERIVED_DOCUMENT_MAX_MISSING_READS = 3;
export const DERIVED_DOCUMENT_MAX_FAILURE_READS = 3;

type StopWatch = (recoverAfterEviction?: boolean) => void;

type RecheckTask = {
  activity: Activity;
  nextEligibleAt: number;
  run: () => Promise<void>;
};

type RecheckQueue = {
  scheduled: Map<string, RecheckTask>;
  wakeAt: number;
  wakeTimer: ReturnType<typeof setTimeout> | null;
};

type ReadPermitWaiter = {
  activity: Activity;
  resolve: (release: () => void) => void;
};

type ReadLimiter = {
  active: number;
  concurrency: number;
  pending: ReadPermitWaiter[];
};

export type ActivityMetricReadState = "loading" | "loaded" | "missing" | "error" | "skipped";

export type ActivityMetricStatus = {
  revision: string;
  state: ActivityMetricReadState;
};

type DerivedState = {
  ownerUid: string | null;
  metricsMap: Map<string, ActivityMetrics>;
  metricStatusMap: Map<string, ActivityMetricStatus>;
};

type ReadResources = {
  active: boolean;
  activeIds: Set<string>;
  metricAttempts: DerivedDocumentReadAttempts;
  metricWatches: Map<string, StopWatch>;
  metricRechecks: RecheckQueue;
  metricLimiter: ReadLimiter;
};

const EMPTY_METRICS = new Map<string, ActivityMetrics>();
const EMPTY_METRIC_STATUSES = new Map<string, ActivityMetricStatus>();

class DerivedDocumentReadTimeoutError extends Error {
  constructor() {
    super("파생 문서 조회 제한시간을 초과했습니다");
    this.name = "DerivedDocumentReadTimeoutError";
  }
}

async function getDerivedDocument(reference: DocumentReference) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    // Firestore getDoc은 취소 API가 없다. 호출 수는 기존 retry 상한으로 제한하고,
    // 제한시간 뒤 늦게 끝난 결과는 Promise.race와 아래 generation/revision 가드가 버린다.
    return await Promise.race([
      getDoc(reference),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new DerivedDocumentReadTimeoutError()),
          DERIVED_DOCUMENT_READ_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout != null) clearTimeout(timeout);
  }
}

function createRecheckQueue(): RecheckQueue {
  return {
    scheduled: new Map(),
    wakeAt: Number.POSITIVE_INFINITY,
    wakeTimer: null,
  };
}

function createReadLimiter(concurrency: number): ReadLimiter {
  return { active: 0, concurrency, pending: [] };
}

function createResources(): ReadResources {
  return {
    active: true,
    activeIds: new Set(),
    metricAttempts: new Map(),
    metricWatches: new Map(),
    metricRechecks: createRecheckQueue(),
    metricLimiter: createReadLimiter(20),
  };
}

function stopWatches(watches: Map<string, StopWatch>): void {
  for (const stop of watches.values()) stop(false);
  watches.clear();
}

function cancelRecheck(queue: RecheckQueue, activityId: string): void {
  queue.scheduled.delete(activityId);
  scheduleRecheckWake(queue);
}

function stopRechecks(queue: RecheckQueue): void {
  if (queue.wakeTimer != null) clearTimeout(queue.wakeTimer);
  queue.wakeTimer = null;
  queue.wakeAt = Number.POSITIVE_INFINITY;
  queue.scheduled.clear();
}

function cancelReadWaiters(limiter: ReadLimiter, keep?: ReadonlySet<string>): void {
  const retained: ReadPermitWaiter[] = [];
  for (const waiter of limiter.pending) {
    if (keep?.has(waiter.activity.id)) retained.push(waiter);
    else waiter.resolve(() => undefined);
  }
  limiter.pending = retained;
}

function pruneResources(resources: ReadResources, activeIds: ReadonlySet<string>): void {
  resources.activeIds = new Set(activeIds);
  for (const id of resources.metricAttempts.keys()) {
    if (!activeIds.has(id)) resources.metricAttempts.delete(id);
  }
  for (const [id, stop] of resources.metricWatches) {
    if (!activeIds.has(id)) {
      stop(false);
      resources.metricWatches.delete(id);
    }
  }
  for (const id of resources.metricRechecks.scheduled.keys()) {
    if (!activeIds.has(id)) cancelRecheck(resources.metricRechecks, id);
  }
  cancelReadWaiters(resources.metricLimiter, activeIds);
}

function compareActivityRecency(left: Activity, right: Activity): number {
  const startTimeDifference = left.startTime - right.startTime;
  if (startTimeDifference !== 0) return startTimeDifference;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

function scheduleRecheck(queue: RecheckQueue, task: RecheckTask): void {
  cancelRecheck(queue, task.activity.id);
  queue.scheduled.set(task.activity.id, task);
  scheduleRecheckWake(queue);
}

function scheduleRecheckWake(queue: RecheckQueue): void {
  const nextEligibleAt = Math.min(
    ...[...queue.scheduled.values()].map((task) => task.nextEligibleAt),
  );
  if (queue.wakeTimer != null && queue.wakeAt === nextEligibleAt) return;
  if (queue.wakeTimer != null) clearTimeout(queue.wakeTimer);
  queue.wakeTimer = null;
  queue.wakeAt = nextEligibleAt;
  if (!Number.isFinite(nextEligibleAt)) return;
  queue.wakeTimer = setTimeout(() => {
    queue.wakeTimer = null;
    queue.wakeAt = Number.POSITIVE_INFINITY;
    const now = Date.now();
    const eligible = [...queue.scheduled.values()]
      .filter((task) => task.nextEligibleAt <= now)
      .sort((left, right) => compareActivityRecency(right.activity, left.activity));
    for (const task of eligible) {
      queue.scheduled.delete(task.activity.id);
      void task.run();
    }
    scheduleRecheckWake(queue);
  }, Math.max(0, nextEligibleAt - Date.now()));
}

function acquireReadPermit(limiter: ReadLimiter, activity: Activity): Promise<() => void> {
  return new Promise((resolve) => {
    const grant = () => {
      limiter.active += 1;
      let released = false;
      resolve(() => {
        if (released) return;
        released = true;
        limiter.active -= 1;
        const next = limiter.pending.shift();
        if (next != null) grantReadPermit(limiter, next);
      });
    };
    if (limiter.active < limiter.concurrency) grant();
    else {
      limiter.pending.push({ activity, resolve });
      limiter.pending.sort((left, right) => compareActivityRecency(right.activity, left.activity));
    }
  });
}

function grantReadPermit(limiter: ReadLimiter, waiter: ReadPermitWaiter): void {
  limiter.active += 1;
  let released = false;
  waiter.resolve(() => {
    if (released) return;
    released = true;
    limiter.active -= 1;
    const next = limiter.pending.shift();
    if (next != null) grantReadPermit(limiter, next);
  });
}

export function useActivityDerivedDocuments(
  uid: string | null | undefined,
  activities: readonly Activity[],
  active = true,
): {
  metricsMap: Map<string, ActivityMetrics>;
  metricStatusMap: Map<string, ActivityMetricStatus>;
} {
  const { firestore } = useFirebaseServices();
  const normalizedUid = uid ?? null;
  const generationRef = useRef(0);
  const currentUidRef = useRef(normalizedUid);
  if (currentUidRef.current !== normalizedUid) {
    currentUidRef.current = normalizedUid;
    generationRef.current += 1;
  }
  const generation = generationRef.current;
  const resources = useMemo(createResources, [firestore, normalizedUid]);
  const [state, setState] = useState<DerivedState>({
    ownerUid: normalizedUid,
    metricsMap: new Map(),
    metricStatusMap: new Map(),
  });

  useEffect(() => {
    if (!active) return;
    resources.active = true;
    return () => {
      resources.active = false;
      for (const id of resources.metricWatches.keys()) resources.metricAttempts.delete(id);
      stopWatches(resources.metricWatches);
      stopRechecks(resources.metricRechecks);
      cancelReadWaiters(resources.metricLimiter);
    };
  }, [active, resources]);

  useEffect(() => {
    if (!active) return;
    const scopedActivities = normalizedUid == null
      ? []
      : activities.filter((activity) => (
        activity.userId === normalizedUid && getDiscipline(activity.type) !== null
      ));
    const displayedIds = new Set(activities.map((activity) => activity.id));
    const scopedReadIds = new Set(scopedActivities.map((activity) => activity.id));
    pruneResources(resources, scopedReadIds);
    // 재마운트 전에 같은 revision 으로 읽어 둔 파생 문서는 다시 읽지 않고 모듈 캐시에서 채운다.
    prepareActivityDerivedDocumentCacheOwner(normalizedUid);
    const cachedMetrics = new Map<string, ActivityMetrics>();
    if (normalizedUid != null) {
      for (const activity of scopedActivities) {
        const revision = activityDerivedDocumentRevision(activity);
        if (shouldReadDerivedDocument(resources.metricAttempts, activity)) {
          const metrics = getCachedActivityDerivedDocument(normalizedUid, "metrics", activity.id, revision);
          if (metrics !== undefined) {
            markDerivedDocumentReadComplete(resources.metricAttempts, activity);
            cachedMetrics.set(activity.id, metrics);
          }
        }
      }
    }
    setState((previous) => {
      const ownerChanged = previous.ownerUid !== normalizedUid;
      const metricsChanged = ownerChanged
        || [...previous.metricsMap.keys()].some((id) => !displayedIds.has(id))
        || [...cachedMetrics].some(([id, value]) => previous.metricsMap.get(id) !== value);
      const metricStatusesChanged = ownerChanged
        || [...previous.metricStatusMap.keys()].some((id) => !displayedIds.has(id))
        || activities.some((activity) => {
          const status = previous.metricStatusMap.get(activity.id);
          const expectedState = normalizedUid == null
            || activity.userId !== normalizedUid
            || getDiscipline(activity.type) === null
            ? "skipped"
            : null;
          return status?.revision !== activityDerivedDocumentRevision(activity)
            || (expectedState != null && status.state !== expectedState);
        });
      if (!metricsChanged && !metricStatusesChanged) return previous;
      const metricsMap = new Map<string, ActivityMetrics>();
      const metricStatusMap = new Map<string, ActivityMetricStatus>();
      for (const activity of activities) {
        const revision = activityDerivedDocumentRevision(activity);
        const previousStatus = previous.metricStatusMap.get(activity.id);
        const skipped = normalizedUid == null
          || activity.userId !== normalizedUid
          || getDiscipline(activity.type) === null;
        if (skipped) {
          metricStatusMap.set(activity.id, { revision, state: "skipped" });
        } else if (cachedMetrics.has(activity.id)) {
          metricStatusMap.set(activity.id, { revision, state: "loaded" });
          metricsMap.set(activity.id, cachedMetrics.get(activity.id)!);
        } else if (!ownerChanged && previousStatus?.revision === revision) {
          metricStatusMap.set(activity.id, previousStatus);
          const metrics = previous.metricsMap.get(activity.id);
          if (metrics != null) metricsMap.set(activity.id, metrics);
        } else {
          metricStatusMap.set(activity.id, { revision, state: "loading" });
        }
      }
      return { ownerUid: normalizedUid, metricsMap, metricStatusMap };
    });
    if (normalizedUid == null || scopedActivities.length === 0) return;

    const isGenerationCurrent = (activity: Activity) => (
      resources.active &&
      currentUidRef.current === normalizedUid &&
      generationRef.current === generation &&
      resources.activeIds.has(activity.id)
    );
    const isCurrent = (
      activity: Activity,
      attempts: DerivedDocumentReadAttempts,
      revision: string,
      attemptToken?: number,
    ) => (
      isGenerationCurrent(activity) &&
      isDerivedDocumentReadCurrent(attempts, activity.id, revision, attemptToken)
    );
    const activitiesById = new Map(scopedActivities.map((activity) => [activity.id, activity]));
    const reserveWatchSlot = (
      activity: Activity,
      watches: Map<string, StopWatch>,
    ) => {
      if (watches.size < DERIVED_DOCUMENT_MAX_CREATION_WATCHES_PER_KIND) return true;
      let oldestId: string | null = null;
      let oldestActivity: Activity | null = null;
      for (const id of watches.keys()) {
        const watchedActivity = activitiesById.get(id);
        if (watchedActivity == null) {
          oldestId = id;
          oldestActivity = null;
          break;
        }
        if (oldestActivity == null || compareActivityRecency(watchedActivity, oldestActivity) < 0) {
          oldestId = id;
          oldestActivity = watchedActivity;
        }
      }
      if (oldestId == null ||
          (oldestActivity != null && compareActivityRecency(activity, oldestActivity) <= 0)) return false;
      watches.get(oldestId)?.(true);
      return watches.size < DERIVED_DOCUMENT_MAX_CREATION_WATCHES_PER_KIND;
    };

    const watchCreation = <T,>(
      activity: Activity,
      reference: DocumentReference,
      attempts: DerivedDocumentReadAttempts,
      watches: Map<string, StopWatch>,
      parse: (data: Record<string, unknown>) => T,
      apply: (id: string, value: T, revision: string) => void,
      kind: "metrics",
      retryCount = 0,
      attemptToken = attempts.get(activity.id)?.token,
    ) => {
      const revision = activityDerivedDocumentRevision(activity);
      const rechecks = resources.metricRechecks;
      if (!isCurrent(activity, attempts, revision, attemptToken) || watches.has(activity.id) ||
          !reserveWatchSlot(activity, watches)) return;
      let unsubscribe: () => void = () => undefined;
      let unsubscribeReady = false;
      let stopRequested = false;
      const timeout = setTimeout(() => stop(), DERIVED_DOCUMENT_CREATION_WATCH_MS);
      const stop = () => {
        clearTimeout(timeout);
        if (watches.get(activity.id) === stop) watches.delete(activity.id);
        if (unsubscribeReady) unsubscribe();
        else stopRequested = true;
      };
      const scheduleRetry = () => {
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        const cancelRetry = () => {
          if (retryTimer != null) clearTimeout(retryTimer);
          if (watches.get(activity.id) === cancelRetry) watches.delete(activity.id);
        };
        retryTimer = setTimeout(() => {
          cancelRetry();
          if (!isCurrent(activity, attempts, revision, attemptToken)) return;
          watchCreation(
            activity, reference, attempts, watches, parse, apply,
            kind, retryCount + 1, attemptToken,
          );
        }, DERIVED_DOCUMENT_CREATION_RETRY_MS);
        watches.set(activity.id, cancelRetry);
      };
      watches.set(activity.id, stop);
      unsubscribe = onSnapshot(reference, (snapshot) => {
        if (!snapshot.exists()) return;
        if (watches.get(activity.id) !== stop ||
            !isCurrent(activity, attempts, revision, attemptToken)) {
          stop();
          return;
        }
        const complete = (value: T) => {
          if (watches.get(activity.id) !== stop ||
              !isCurrent(activity, attempts, revision, attemptToken)) return;
          markDerivedDocumentReadComplete(attempts, activity);
          cancelRecheck(rechecks, activity.id);
          apply(activity.id, value, revision);
          stop();
        };
        const reportError = (error: unknown) => {
          logClientError("useActivityDerivedDocuments.creationWatch.parse", error, {
            kind,
            activityId: activity.id,
          });
        };
        const data = snapshot.data();
        try {
          complete(parse(data));
        } catch (error) {
          reportError(error);
        }
      }, (error) => {
        const wasCurrent = isCurrent(activity, attempts, revision, attemptToken);
        const retryAllowed = retryCount < DERIVED_DOCUMENT_CREATION_MAX_RETRIES &&
          wasCurrent;
        stop();
        if (retryAllowed) scheduleRetry();
        logClientError("useActivityDerivedDocuments.creationWatch.error", error, {
          kind,
          activityId: activity.id,
          retryCount,
        });
      });
      unsubscribeReady = true;
      if (stopRequested) unsubscribe();
    };

    const loadOne = async <T,>(
      activity: Activity,
      collectionName: "activity_metrics",
      attempts: DerivedDocumentReadAttempts,
      watches: Map<string, StopWatch>,
      parse: (data: Record<string, unknown>) => T,
      apply: (id: string, value: T, revision: string) => void,
      watchIfMissing: boolean,
      kind: "metrics",
      retryCount = 0,
      attemptToken = attempts.get(activity.id)?.token,
    ) => {
      const revision = activityDerivedDocumentRevision(activity);
      const rechecks = resources.metricRechecks;
      const limiter = resources.metricLimiter;
      if (!isCurrent(activity, attempts, revision, attemptToken)) return;
      cancelRecheck(rechecks, activity.id);
      watches.get(activity.id)?.();
      const reference = doc(firestore, collectionName, activity.id);
      try {
        const release = await acquireReadPermit(limiter, activity);
        if (!isCurrent(activity, attempts, revision, attemptToken)) {
          release();
          return;
        }
        let snapshot;
        try {
          snapshot = await getDerivedDocument(reference);
        } finally {
          release();
        }
        if (!isCurrent(activity, attempts, revision, attemptToken)) return;
        if (snapshot.exists()) {
          const data = snapshot.data();
          const value = parse(data);
          if (!isCurrent(activity, attempts, revision, attemptToken)) return;
          markDerivedDocumentReadComplete(attempts, activity);
          apply(activity.id, value, revision);
          return;
        }
        const previous = attempts.get(activity.id);
        const missingCount = previous?.revision === revision ? previous.missingCount + 1 : 1;
        const canRecheck = missingCount < DERIVED_DOCUMENT_MAX_MISSING_READS;
        const nextEligibleAt = canRecheck
          ? Date.now() + DERIVED_DOCUMENT_MISSING_RECHECK_BASE_MS * 2 ** (missingCount - 1)
          : Number.POSITIVE_INFINITY;
        markDerivedDocumentMissing(attempts, activity, nextEligibleAt);
        applyMetricStatus(activity.id, revision, "missing");
        if (watchIfMissing) {
          watchCreation(activity, reference, attempts, watches, parse, apply, kind);
        }
        if (canRecheck) {
          scheduleRecheck(rechecks, {
            activity,
            nextEligibleAt,
            run: async () => {
              if (!isGenerationCurrent(activity) || !shouldReadDerivedDocument(attempts, activity)) return;
              const recheckAttempt = markDerivedDocumentReadAttempt(attempts, activity);
              await loadOne(
                activity, collectionName, attempts, watches, parse, apply,
                watchIfMissing, kind, 0, recheckAttempt.token,
              );
            },
          });
        }
      } catch (error) {
        const wasCurrent = isCurrent(activity, attempts, revision, attemptToken);
        if (wasCurrent) {
          watches.get(activity.id)?.(false);
          cancelRecheck(rechecks, activity.id);
        }
        if (wasCurrent) {
          applyMetricStatus(activity.id, revision, "error");
          const previous = attempts.get(activity.id);
          const failureCount = previous?.revision === revision ? previous.failureCount + 1 : 1;
          const canRecover = failureCount < DERIVED_DOCUMENT_MAX_FAILURE_READS;
          const recoveryDelay = failureCount === 1
            ? DERIVED_DOCUMENT_CREATION_RETRY_MS
            : DERIVED_DOCUMENT_MISSING_RECHECK_BASE_MS * 2 ** (failureCount - 2);
          const nextEligibleAt = canRecover
            ? Date.now() + recoveryDelay
            : Number.POSITIVE_INFINITY;
          const failedAttempt = markDerivedDocumentReadFailed(attempts, activity, nextEligibleAt);
          const scheduleFailureRecheck = () => {
            if (!canRecover || !isCurrent(activity, attempts, revision, failedAttempt.token)) return;
            scheduleRecheck(rechecks, {
              activity,
              nextEligibleAt,
              run: async () => {
                if (!isGenerationCurrent(activity) ||
                    !isCurrent(activity, attempts, revision, failedAttempt.token) ||
                    !shouldReadDerivedDocument(attempts, activity)) return;
                const retryAttempt = markDerivedDocumentReadAttempt(attempts, activity);
                await loadOne(
                  activity, collectionName, attempts, watches, parse, apply,
                  watchIfMissing, kind, retryCount + 1, retryAttempt.token,
                );
              },
            });
          };
          if (canRecover && failureCount === 1 &&
              watches.size < DERIVED_DOCUMENT_MAX_CREATION_WATCHES_PER_KIND) {
          let retryTimer: ReturnType<typeof setTimeout> | null = null;
          const cancelRetry: StopWatch = (recoverAfterEviction = false) => {
            if (retryTimer != null) clearTimeout(retryTimer);
            if (watches.get(activity.id) === cancelRetry) watches.delete(activity.id);
            if (recoverAfterEviction) scheduleFailureRecheck();
          };
          retryTimer = setTimeout(() => {
            cancelRetry(false);
            if (!isCurrent(activity, attempts, revision, failedAttempt.token) ||
                !shouldReadDerivedDocument(attempts, activity)) return;
            const retryAttempt = markDerivedDocumentReadAttempt(attempts, activity);
            void loadOne(
              activity, collectionName, attempts, watches, parse, apply,
              watchIfMissing, kind, retryCount + 1, retryAttempt.token,
            );
          }, recoveryDelay);
          watches.set(activity.id, cancelRetry);
          } else {
            scheduleFailureRecheck();
          }
        }
        logClientError("useActivityDerivedDocuments.initialRead.error", error, {
          kind,
          activityId: activity.id,
          retryCount,
        });
      }
    };

    const ownerUid = normalizedUid;
    const applyMetric = (id: string, value: ActivityMetrics, revision: string) => {
      setCachedActivityDerivedDocument(ownerUid, "metrics", id, revision, value);
      setState((previous) => {
        if (previous.ownerUid !== normalizedUid) return previous;
        const currentStatus = previous.metricStatusMap.get(id);
        if (currentStatus?.revision !== revision || currentStatus.state === "skipped") return previous;
        const metricsMap = new Map(previous.metricsMap);
        const metricStatusMap = new Map(previous.metricStatusMap);
        metricsMap.set(id, value);
        metricStatusMap.set(id, { revision, state: "loaded" });
        return { ...previous, metricsMap, metricStatusMap };
      });
    };
    const applyMetricStatus = (
      id: string,
      revision: string,
      status: "missing" | "error",
    ) => setState((previous) => {
      if (previous.ownerUid !== normalizedUid) return previous;
      const currentStatus = previous.metricStatusMap.get(id);
      if (currentStatus?.revision !== revision || currentStatus.state === "skipped") return previous;
      const metricStatusMap = new Map(previous.metricStatusMap);
      metricStatusMap.set(id, { revision, state: status });
      return { ...previous, metricStatusMap };
    });

    const metricActivities = scopedActivities.filter((activity) => (
      shouldReadDerivedDocument(resources.metricAttempts, activity)
    ));
    const newestIds = (values: readonly Activity[]) => new Set(
      [...values]
        .sort((left, right) => compareActivityRecency(right, left))
        .slice(0, DERIVED_DOCUMENT_MAX_CREATION_WATCHES_PER_KIND)
        .map((activity) => activity.id),
    );
    const metricWatchableIds = newestIds(metricActivities);
    const metricAttemptTokens = new Map(metricActivities.map((activity) => [
      activity.id,
      markDerivedDocumentReadAttempt(resources.metricAttempts, activity).token,
    ]));
    const loadMetrics = async () => {
      for (let index = 0; index < metricActivities.length; index += 20) {
        if (!resources.active || generationRef.current !== generation) return;
        const batch = metricActivities.slice(index, index + 20);
        await Promise.all(batch.map((activity) => loadOne(
          activity, "activity_metrics", resources.metricAttempts, resources.metricWatches,
          (data) => data as unknown as ActivityMetrics, applyMetric, metricWatchableIds.has(activity.id), "metrics",
          0, metricAttemptTokens.get(activity.id)!,
        )));
      }
    };
    void loadMetrics();
  }, [active, activities, generation, normalizedUid, resources]);

  return state.ownerUid === normalizedUid
    ? {
      metricsMap: state.metricsMap,
      metricStatusMap: state.metricStatusMap,
    }
    : {
      metricsMap: EMPTY_METRICS,
      metricStatusMap: EMPTY_METRIC_STATUSES,
    };
}
