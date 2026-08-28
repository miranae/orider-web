import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";

import type { Activity, ActivityStreams } from "@shared/types";
// 훅이 아니라
// 순수 async 함수라 컨텍스트를 못 쓴다. 임베드 경로의 유일한 호출부
// (useActivityAnalysisModel)는 항상 services 를 넘기므로 이 기본값은 임베드에서 쓰이지
// 않는다. services 유무가 익명/인증 fetch 분기도 결정하므로 필수화하면 동작이 바뀐다.
// eslint-disable-next-line design-system/no-firebase-singleton-in-embed
import { auth as defaultAuth, firestore as defaultFirestore } from "../../../services/firebase";
import { logClientError } from "../../../services/errorLogger";
import {
  getActivityStreams,
  getActivityStreamsWithAuth,
} from "../../../services/personalDataApi";
import { useFirebaseServices } from "../../../contexts/FirebaseServicesContext";
import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import { getStravaActivityId } from "../../../utils/stravaActivity";
import { isStreamNotCachedError } from "./activityDetailUtils";

interface UseActivityStreamsLoaderArgs {
  activityId: string | undefined;
  activity: Activity | null;
  userId: string | undefined;
  getStreams: (stravaId: number) => Promise<unknown>;
  t: (key: string) => string;
}

export async function loadOriderActivityStreams(
  activityId: string,
  fallbackUserId?: string,
  services?: { auth: Auth; firestore: Firestore },
): Promise<ActivityStreams> {
  const { auth, firestore } = services ?? { auth: defaultAuth, firestore: defaultFirestore };
  const snap = await getDoc(doc(firestore, "activity_streams", activityId));
  if (!snap.exists()) throw new Error("STREAMS_MISSING");

  const data = snap.data();
  if (data.storage === "gcs" && typeof data.gcsPath === "string") {
    const streams = services
      ? await getActivityStreamsWithAuth(auth, activityId)
      : await getActivityStreams(activityId);
    const ownerId = typeof data.userId === "string" ? data.userId : fallbackUserId;
    if (ownerId) streams.userId = ownerId;
    return streams;
  }

  const jsonStr = data.json as string | undefined;
  if (!jsonStr) throw new Error("STREAMS_MISSING");
  const streams = JSON.parse(jsonStr) as ActivityStreams;
  const ownerId = typeof data.userId === "string" ? data.userId : fallbackUserId;
  if (ownerId) streams.userId = ownerId;
  return streams;
}

export function useActivityStreamsLoader({
  activityId,
  activity,
  userId,
  getStreams,
  t,
}: UseActivityStreamsLoaderArgs) {
  const { auth, firestore } = useFirebaseServices();
  const [streams, setStreams] = useState<ActivityStreams | null>(null);
  const [showStreamSpinner, setShowStreamSpinner] = useState(false);
  const [streamsError, setStreamsError] = useState<string | null>(null);
  const [loadingStreams, setLoadingStreams] = useState(false);

  useEffect(() => {
    setStreams(null);
    setStreamsError(null);
    setLoadingStreams(false);
    setShowStreamSpinner(false);
  }, [activityId]);

  useEffect(() => {
    if (!activity || streams) return;

    const source = (activity as Activity & { source?: string }).source;
    const stravaId = getStravaActivityId(activity);

    if (activityId && (source === "orider" || activityId.startsWith("orider_"))) {
      setLoadingStreams(true);
      setStreamsError(null);
      const timer = setTimeout(() => setShowStreamSpinner(true), 500);
      loadOriderActivityStreams(activityId, activity.userId, { auth, firestore }).then((parsed) => {
        setStreams(parsed);
      }).catch((err) => {
        logClientError("ActivityPage.streams", err, {
          activityId,
          source: "orider",
          visibility: (activity as Activity & { visibility?: string }).visibility ?? null,
          isOwn: !!userId && activity.userId === userId,
        });
        setStreamsError(err instanceof Error && err.message !== "STREAMS_MISSING"
          ? err.message
          : t("page.streamsMissing"));
      }).finally(() => {
        clearTimeout(timer);
        setShowStreamSpinner(false);
        setLoadingStreams(false);
      });
      return;
    }

    if (!stravaId) return;

    setLoadingStreams(true);
    setStreamsError(null);
    const timer = setTimeout(() => setShowStreamSpinner(true), 500);
    getStreams(stravaId).then((data) => {
      setStreams(data as unknown as ActivityStreams);
    }).catch((err) => {
      if (isStreamNotCachedError(err)) {
        setStreamsError(t("page.streamsNotCached"));
      } else {
        logClientError("ActivityPage.streams", err, {
          activityId,
          source: "strava",
          stravaId,
          visibility: (activity as Activity & { visibility?: string }).visibility ?? null,
          isOwn: !!userId && activity.userId === userId,
        });
        const message = err instanceof Error ? err.message : "";
        setStreamsError(message === "STREAMS_INVALID" ? t("page.streamsErrorFallback") : message || t("page.streamsErrorFallback"));
      }
    }).finally(() => {
      clearTimeout(timer);
      setShowStreamSpinner(false);
      setLoadingStreams(false);
    });
  }, [activity, activityId, auth, firestore, getStreams, streams, t, userId]);

  return {
    streams,
    setStreams,
    showStreamSpinner,
    setShowStreamSpinner,
    streamsError,
    setStreamsError,
    loadingStreams,
    setLoadingStreams,
  };
}
