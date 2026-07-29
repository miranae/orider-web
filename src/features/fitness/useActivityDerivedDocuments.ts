import { useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc, onSnapshot, type DocumentReference } from "firebase/firestore";
import type { Activity, ActivityStreams } from "@shared/types";
import type { ActivityMetrics } from "@shared/types/activity-metrics";
import { firestore } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import { getDiscipline } from "../../utils/disciplineFilter";
import {
  activityDerivedDocumentRevision,
  invalidateDerivedDocumentReadAttempt,
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

type DerivedState = {
  ownerUid: string | null;
  streamsMap: Map<string, ActivityStreams>;
  metricsMap: Map<string, ActivityMetrics>;
};

type ReadResources = {
  active: boolean;
  activeIds: Set<string>;
  streamAttempts: DerivedDocumentReadAttempts;
  metricAttempts: DerivedDocumentReadAttempts;
  streamWatches: Map<string, StopWatch>;
  metricWatches: Map<string, StopWatch>;
  streamRechecks: RecheckQueue;
  metricRechecks: RecheckQueue;
  streamLimiter: ReadLimiter;
  metricLimiter: ReadLimiter;
};

const EMPTY_STREAMS = new Map<string, ActivityStreams>();
const EMPTY_METRICS = new Map<string, ActivityMetrics>();

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
    streamAttempts: new Map(),
    metricAttempts: new Map(),
    streamWatches: new Map(),
    metricWatches: new Map(),
    streamRechecks: createRecheckQueue(),
    metricRechecks: createRecheckQueue(),
    streamLimiter: createReadLimiter(10),
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
  for (const attempts of [resources.streamAttempts, resources.metricAttempts]) {
    for (const id of attempts.keys()) if (!activeIds.has(id)) attempts.delete(id);
  }
  for (const watches of [resources.streamWatches, resources.metricWatches]) {
    for (const [id, stop] of watches) {
      if (!activeIds.has(id)) {
        stop(false);
        watches.delete(id);
      }
    }
  }
  for (const queue of [resources.streamRechecks, resources.metricRechecks]) {
    for (const id of queue.scheduled.keys()) {
      if (!activeIds.has(id)) cancelRecheck(queue, id);
    }
  }
  cancelReadWaiters(resources.streamLimiter, activeIds);
  cancelReadWaiters(resources.metricLimiter, activeIds);
}

function parseStreams(data: Record<string, unknown>): ActivityStreams {
  return typeof data.json === "string"
    ? JSON.parse(data.json) as ActivityStreams
    : data as unknown as ActivityStreams;
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
): { streamsMap: Map<string, ActivityStreams>; metricsMap: Map<string, ActivityMetrics> } {
  const normalizedUid = uid ?? null;
  const generationRef = useRef(0);
  const currentUidRef = useRef(normalizedUid);
  if (currentUidRef.current !== normalizedUid) {
    currentUidRef.current = normalizedUid;
    generationRef.current += 1;
  }
  const generation = generationRef.current;
  const resources = useMemo(createResources, [normalizedUid]);
  const [state, setState] = useState<DerivedState>({
    ownerUid: normalizedUid,
    streamsMap: new Map(),
    metricsMap: new Map(),
  });

  useEffect(() => {
    resources.active = true;
    return () => {
      resources.active = false;
      for (const id of resources.streamWatches.keys()) resources.streamAttempts.delete(id);
      for (const id of resources.metricWatches.keys()) resources.metricAttempts.delete(id);
      stopWatches(resources.streamWatches);
      stopWatches(resources.metricWatches);
      stopRechecks(resources.streamRechecks);
      stopRechecks(resources.metricRechecks);
      cancelReadWaiters(resources.streamLimiter);
      cancelReadWaiters(resources.metricLimiter);
    };
  }, [resources]);

  useEffect(() => {
    const scopedActivities = normalizedUid == null
      ? []
      : activities.filter((activity) => activity.userId === normalizedUid);
    const activeIds = new Set(scopedActivities.map((activity) => activity.id));
    pruneResources(resources, activeIds);
    setState((previous) => {
      if (previous.ownerUid !== normalizedUid) {
        return { ownerUid: normalizedUid, streamsMap: new Map(), metricsMap: new Map() };
      }
      const streamsChanged = [...previous.streamsMap.keys()].some((id) => !activeIds.has(id));
      const metricsChanged = [...previous.metricsMap.keys()].some((id) => !activeIds.has(id));
      if (!streamsChanged && !metricsChanged) return previous;
      const streamsMap = new Map<string, ActivityStreams>();
      const metricsMap = new Map<string, ActivityMetrics>();
      for (const [id, value] of previous.streamsMap) if (activeIds.has(id)) streamsMap.set(id, value);
      for (const [id, value] of previous.metricsMap) if (activeIds.has(id)) metricsMap.set(id, value);
      return { ownerUid: normalizedUid, streamsMap, metricsMap };
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
      apply: (id: string, value: T) => void,
      kind: "stream" | "metrics",
      retryCount = 0,
      attemptToken = attempts.get(activity.id)?.token,
    ) => {
      const revision = activityDerivedDocumentRevision(activity);
      const rechecks = kind === "stream" ? resources.streamRechecks : resources.metricRechecks;
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
        try {
          const value = parse(snapshot.data());
          markDerivedDocumentReadComplete(attempts, activity);
          cancelRecheck(rechecks, activity.id);
          apply(activity.id, value);
        } catch (error) {
          invalidateDerivedDocumentReadAttempt(attempts, activity.id);
          cancelRecheck(rechecks, activity.id);
          logClientError("useActivityDerivedDocuments.creationWatch.parse", error, {
            kind,
            activityId: activity.id,
          });
        } finally {
          stop();
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
      collectionName: "activity_streams" | "activity_metrics",
      attempts: DerivedDocumentReadAttempts,
      watches: Map<string, StopWatch>,
      parse: (data: Record<string, unknown>) => T,
      apply: (id: string, value: T) => void,
      watchIfMissing: boolean,
      kind: "stream" | "metrics",
      retryCount = 0,
      attemptToken = attempts.get(activity.id)?.token,
    ) => {
      const revision = activityDerivedDocumentRevision(activity);
      if (!isCurrent(activity, attempts, revision, attemptToken)) return;
      const rechecks = kind === "stream" ? resources.streamRechecks : resources.metricRechecks;
      const limiter = kind === "stream" ? resources.streamLimiter : resources.metricLimiter;
      cancelRecheck(rechecks, activity.id);
      watches.get(activity.id)?.();
      const reference = doc(firestore, collectionName, activity.id);
      try {
        const release = await acquireReadPermit(limiter, activity);
        if (!isCurrent(activity, attempts, revision, attemptToken)) {
          release();
          return;
        }
        const snapshot = await getDoc(reference).finally(release);
        if (!isCurrent(activity, attempts, revision, attemptToken)) return;
        if (snapshot.exists()) {
          const value = parse(snapshot.data());
          markDerivedDocumentReadComplete(attempts, activity);
          apply(activity.id, value);
          return;
        }
        const previous = attempts.get(activity.id);
        const missingCount = previous?.revision === revision ? previous.missingCount + 1 : 1;
        const canRecheck = missingCount < DERIVED_DOCUMENT_MAX_MISSING_READS;
        const nextEligibleAt = canRecheck
          ? Date.now() + DERIVED_DOCUMENT_MISSING_RECHECK_BASE_MS * 2 ** (missingCount - 1)
          : Number.POSITIVE_INFINITY;
        markDerivedDocumentMissing(attempts, activity, nextEligibleAt);
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

    const applyStream = (id: string, value: ActivityStreams) => setState((previous) => {
      if (previous.ownerUid !== normalizedUid) return previous;
      const streamsMap = new Map(previous.streamsMap);
      streamsMap.set(id, value);
      return { ...previous, streamsMap };
    });
    const applyMetric = (id: string, value: ActivityMetrics) => setState((previous) => {
      if (previous.ownerUid !== normalizedUid) return previous;
      const metricsMap = new Map(previous.metricsMap);
      metricsMap.set(id, value);
      return { ...previous, metricsMap };
    });

    const streamActivities = scopedActivities.filter((activity) => {
      if (!shouldReadDerivedDocument(resources.streamAttempts, activity)) return false;
      const power = activity.summary.averagePower ?? activity.avgPower ?? null;
      const discipline = getDiscipline(activity.type);
      return power != null && power > 0 || discipline === "run" || discipline === "swim";
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
    const streamWatchableIds = newestIds(streamActivities);
    const metricWatchableIds = newestIds(metricActivities);
    const streamAttemptTokens = new Map(streamActivities.map((activity) => [
      activity.id,
      markDerivedDocumentReadAttempt(resources.streamAttempts, activity).token,
    ]));
    const metricAttemptTokens = new Map(metricActivities.map((activity) => [
      activity.id,
      markDerivedDocumentReadAttempt(resources.metricAttempts, activity).token,
    ]));
    const loadStreams = async () => {
      for (let index = 0; index < streamActivities.length; index += 10) {
        if (!resources.active || generationRef.current !== generation) return;
        const batch = streamActivities.slice(index, index + 10);
        await Promise.all(batch.map((activity) => loadOne(
          activity, "activity_streams", resources.streamAttempts, resources.streamWatches,
          parseStreams, applyStream, streamWatchableIds.has(activity.id), "stream",
          0, streamAttemptTokens.get(activity.id)!,
        )));
      }
    };
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
    void loadStreams();
    void loadMetrics();
  }, [activities, generation, normalizedUid, resources]);

  return state.ownerUid === normalizedUid
    ? { streamsMap: state.streamsMap, metricsMap: state.metricsMap }
    : { streamsMap: EMPTY_STREAMS, metricsMap: EMPTY_METRICS };
}
