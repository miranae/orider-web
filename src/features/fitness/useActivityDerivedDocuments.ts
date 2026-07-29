import { useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc, onSnapshot, type DocumentReference } from "firebase/firestore";
import type { Activity, ActivityStreams } from "@shared/types";
import type { ActivityMetrics } from "@shared/types/activity-metrics";
import { firestore } from "../../services/firebase";
import {
  activityDerivedDocumentRevision,
  invalidateDerivedDocumentReadAttempt,
  markDerivedDocumentReadAttempt,
  shouldReadDerivedDocument,
  type DerivedDocumentReadAttempts,
} from "./derivedDocumentReadAttempts";

// 누락 문서는 backend 파생 작업이 끝나는 일반적인 구간만 감시한다. 이후에는 activity
// lifecycle 변경이 있을 때 다시 확인해 장기 listener/read 비용을 만들지 않는다.
export const DERIVED_DOCUMENT_CREATION_WATCH_MS = 60_000;
export const DERIVED_DOCUMENT_MAX_CREATION_WATCHES_PER_KIND = 24;

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
  streamWatches: Map<string, () => void>;
  metricWatches: Map<string, () => void>;
};

const EMPTY_STREAMS = new Map<string, ActivityStreams>();
const EMPTY_METRICS = new Map<string, ActivityMetrics>();

function createResources(): ReadResources {
  return {
    active: true,
    activeIds: new Set(),
    streamAttempts: new Map(),
    metricAttempts: new Map(),
    streamWatches: new Map(),
    metricWatches: new Map(),
  };
}

function stopWatches(watches: Map<string, () => void>): void {
  for (const stop of watches.values()) stop();
  watches.clear();
}

function pruneResources(resources: ReadResources, activeIds: ReadonlySet<string>): void {
  resources.activeIds = new Set(activeIds);
  for (const attempts of [resources.streamAttempts, resources.metricAttempts]) {
    for (const id of attempts.keys()) if (!activeIds.has(id)) attempts.delete(id);
  }
  for (const watches of [resources.streamWatches, resources.metricWatches]) {
    for (const [id, stop] of watches) {
      if (!activeIds.has(id)) {
        stop();
        watches.delete(id);
      }
    }
  }
}

function parseStreams(data: Record<string, unknown>): ActivityStreams {
  return typeof data.json === "string"
    ? JSON.parse(data.json) as ActivityStreams
    : data as unknown as ActivityStreams;
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

    const isCurrent = (activity: Activity, attempts: DerivedDocumentReadAttempts, revision: string) => (
      resources.active &&
      currentUidRef.current === normalizedUid &&
      generationRef.current === generation &&
      resources.activeIds.has(activity.id) &&
      attempts.get(activity.id) === revision
    );

    const watchCreation = <T,>(
      activity: Activity,
      reference: DocumentReference,
      attempts: DerivedDocumentReadAttempts,
      watches: Map<string, () => void>,
      parse: (data: Record<string, unknown>) => T,
      apply: (id: string, value: T) => void,
    ) => {
      const revision = activityDerivedDocumentRevision(activity);
      if (!isCurrent(activity, attempts, revision) || watches.has(activity.id) ||
          watches.size >= DERIVED_DOCUMENT_MAX_CREATION_WATCHES_PER_KIND) return;
      let unsubscribe: () => void = () => undefined;
      let unsubscribeReady = false;
      let stopRequested = false;
      const timeout = setTimeout(() => stop(), DERIVED_DOCUMENT_CREATION_WATCH_MS);
      const stop = () => {
        clearTimeout(timeout);
        watches.delete(activity.id);
        if (unsubscribeReady) unsubscribe();
        else stopRequested = true;
      };
      watches.set(activity.id, stop);
      unsubscribe = onSnapshot(reference, (snapshot) => {
        if (!snapshot.exists()) return;
        if (isCurrent(activity, attempts, revision)) apply(activity.id, parse(snapshot.data()));
        stop();
      }, () => {
        if (isCurrent(activity, attempts, revision)) {
          invalidateDerivedDocumentReadAttempt(attempts, activity.id);
        }
        stop();
      });
      unsubscribeReady = true;
      if (stopRequested) unsubscribe();
    };

    const loadOne = async <T,>(
      activity: Activity,
      collectionName: "activity_streams" | "activity_metrics",
      attempts: DerivedDocumentReadAttempts,
      watches: Map<string, () => void>,
      parse: (data: Record<string, unknown>) => T,
      apply: (id: string, value: T) => void,
      watchIfMissing: boolean,
    ) => {
      const revision = activityDerivedDocumentRevision(activity);
      watches.get(activity.id)?.();
      markDerivedDocumentReadAttempt(attempts, activity);
      const reference = doc(firestore, collectionName, activity.id);
      try {
        const snapshot = await getDoc(reference);
        if (!isCurrent(activity, attempts, revision)) return;
        if (snapshot.exists()) apply(activity.id, parse(snapshot.data()));
        else if (watchIfMissing) watchCreation(activity, reference, attempts, watches, parse, apply);
      } catch {
        if (isCurrent(activity, attempts, revision)) {
          invalidateDerivedDocumentReadAttempt(attempts, activity.id);
        }
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
      return power != null && power > 0 || activity.type === "Run" || activity.type === "Swim";
    });
    const metricActivities = scopedActivities.filter((activity) => (
      shouldReadDerivedDocument(resources.metricAttempts, activity)
    ));
    const newestIds = (values: readonly Activity[]) => new Set(
      [...values]
        .sort((left, right) => right.startTime - left.startTime)
        .slice(0, DERIVED_DOCUMENT_MAX_CREATION_WATCHES_PER_KIND)
        .map((activity) => activity.id),
    );
    const streamWatchableIds = newestIds(streamActivities);
    const metricWatchableIds = newestIds(metricActivities);
    for (let index = 0; index < streamActivities.length; index += 10) {
      const batch = streamActivities.slice(index, index + 10);
      void Promise.all(batch.map((activity) => loadOne(
        activity, "activity_streams", resources.streamAttempts, resources.streamWatches,
        parseStreams, applyStream, streamWatchableIds.has(activity.id),
      )));
    }
    for (let index = 0; index < metricActivities.length; index += 20) {
      const batch = metricActivities.slice(index, index + 20);
      void Promise.all(batch.map((activity) => loadOne(
        activity, "activity_metrics", resources.metricAttempts, resources.metricWatches,
        (data) => data as unknown as ActivityMetrics, applyMetric, metricWatchableIds.has(activity.id),
      )));
    }
  }, [activities, generation, normalizedUid, resources]);

  return state.ownerUid === normalizedUid
    ? { streamsMap: state.streamsMap, metricsMap: state.metricsMap }
    : { streamsMap: EMPTY_STREAMS, metricsMap: EMPTY_METRICS };
}
