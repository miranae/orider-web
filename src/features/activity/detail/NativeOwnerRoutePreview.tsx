import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import type { Activity } from "@shared/types";
import type { TFunction } from "i18next";
import { useAuth } from "../../../contexts/AuthContext";
import { useFirebaseServices } from "../../../contexts/FirebaseServicesContext";
import { loadActivityRouteEvidence } from "../../../services/activityRouteEvidence";
import RouteMap from "../../../components/RouteMap";
import { Button, Text } from "../../../theme";

export function boundedRoutePreview(points: ReadonlyArray<{ lat: number; lon: number }>): [number, number][] {
  const count = Math.min(200, points.length);
  return Array.from({ length: count }, (_, i) => {
    const point = points[Math.floor(i * (points.length - 1) / Math.max(1, count - 1))]!;
    return [point.lat, point.lon];
  });
}

export default function NativeOwnerRoutePreview({ activity, t }: { activity: Activity; t: TFunction<"activity"> }) {
  const { user } = useAuth();
  const services = useFirebaseServices();
  if (!user || user.isAnonymous || user.uid !== activity.userId || services.auth.currentUser?.uid !== user.uid || services.auth.currentUser.isAnonymous || activity.deletedAt != null) return null;
  const source = activity as Activity & { activityRevision?: string; sourceRevision?: unknown; sourceContentDigest?: unknown };
  const identity = JSON.stringify([user.uid, activity.id, source.activityRevision, source.sourceRevision, source.sourceContentDigest,
    services.auth.app.name, services.auth.app.options.projectId,
    activity.contentRevision, activity.contentSelectedRevision, activity.startTime, activity.endTime, activity.source]);
  return <Preview key={identity} activityId={activity.id} uid={user.uid} t={t} />;
}

function Preview({ activityId, uid, t }: { activityId: string; uid: string; t: TFunction<"activity"> }) {
  const services = useFirebaseServices();
  const pending = useRef<AbortController | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "empty" | "error" | "denied">("idle");
  const [points, setPoints] = useState<[number, number][]>([]);
  useEffect(() => {
    const stop = onAuthStateChanged(services.auth, user => {
      if (user?.uid === uid && !user.isAnonymous) return;
      pending.current?.abort(); setPoints([]); setState("denied");
    });
    return () => { pending.current?.abort(); stop(); };
  }, [services, uid]);
  async function load() {
    if (pending.current || services.auth.currentUser?.uid !== uid || services.auth.currentUser.isAnonymous) return;
    const controller = new AbortController(); pending.current = controller; setState("loading");
    // Firebase callable transport has no AbortSignal; abort cancels acceptance of its eventual result.
    try {
      const result = await loadActivityRouteEvidence(services, uid, activityId);
      if (controller.signal.aborted) return;
      if (result.state === "available") { setPoints(boundedRoutePreview(result.route.points)); setState("ready"); }
      else { setPoints([]); setState(result.reason === "missing_gps" ? "empty" : "error"); }
    } catch {
      if (!controller.signal.aborted) { setPoints([]); setState("error"); }
    } finally { if (pending.current === controller) pending.current = null; }
  }
  if (state === "denied") return null;
  return <section data-native-owner-route-preview className="mt-3">
    {state !== "ready" && state !== "empty" && <Button size="sm" variant="outline" loading={state === "loading"} disabled={state === "loading"} onClick={() => void load()}>{t(state === "error" ? "page.ownerRoutePreview.retry" : "page.ownerRoutePreview.load")}</Button>}
    {state === "ready" && <><Text as="p" variant="bodyMedium" tone="secondary">{t("page.ownerRoutePreview.scope")}</Text><div style={{ height: 280, width: "100%" }}><RouteMap latlng={points} height="h-full" showRouteEndpoints interactive /></div></>}
    {(state === "empty" || state === "error") && <Text as="p" variant="bodyMedium" tone="secondary">{t(`page.ownerRoutePreview.${state}`)}</Text>}
  </section>;
}
