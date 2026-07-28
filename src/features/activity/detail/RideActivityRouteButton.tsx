import { useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { useTranslation } from "react-i18next";
import type { Activity } from "@shared/types";
import { useAuth } from "../../../contexts/AuthContext";
import { useToast } from "../../../contexts/ToastContext";
import { track } from "../../../services/analytics";
import { logClientError } from "../../../services/errorLogger";
import { firestore, functions } from "../../../services/firebase";
import { Button } from "../../../theme/components";

type RideRouteStatus = "idle" | "creating" | "sending" | "sent";
type CourseLookup = { kind: "found"; courseId: string } | { kind: "missing" } | { kind: "error" };
type RouteIntent = { state: "pending" | "created"; courseId?: string; updatedAt: number };
type IntentRead = { kind: "value"; intent: RouteIntent } | { kind: "none" };

const INTENT_TTL_MS = 24 * 60 * 60 * 1000;
const intentKey = (uid: string, activityId: string) => `orider:ride-route:${uid}:${activityId}`;
const intentMemory = new Map<string, RouteIntent>();

export function clearRideRouteIntentMemoryForTests() {
  intentMemory.clear();
}

const AMBIGUOUS_CREATE_FAILURES = new Set([
  "unavailable",
  "deadline-exceeded",
  "internal",
  "unknown",
  "cancelled",
  "data-loss",
]);

function isDefinitiveCreateFailure(error: unknown) {
  const rawCode = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  const code = rawCode.replace(/^functions\//, "");
  return code.length > 0 && !AMBIGUOUS_CREATE_FAILURES.has(code);
}

class RideRouteFlowError extends Error {
  constructor(readonly reason: "lookup" | "ambiguous", cause?: unknown) {
    super(reason);
    if (cause !== undefined) (this as Error & { cause?: unknown }).cause = cause;
  }
}

export function RideActivityRouteButton({
  activityId,
  activity,
  hasRoute,
  sport,
}: {
  activityId?: string;
  activity: Activity;
  hasRoute: boolean;
  sport: "ride" | "run" | "swim" | "other";
}) {
  const { t } = useTranslation("activity");
  const { user, signInWithGoogle } = useAuth();
  const { showToast } = useToast();
  const [courseId, setCourseId] = useState<string | null>(null);
  const [status, setStatus] = useState<RideRouteStatus>("idle");
  const [flowAlert, setFlowAlert] = useState<string | null>(null);
  const busyRef = useRef(false);
  const generationRef = useRef(0);

  useEffect(() => {
    const generation = ++generationRef.current;
    setCourseId(null);
    setStatus("idle");
    setFlowAlert(null);
    busyRef.current = false;
    return () => {
      if (generationRef.current === generation) generationRef.current += 1;
    };
  }, [activityId, user?.uid]);

  if (sport !== "ride" || !hasRoute) return null;

  const handleClick = async () => {
    if (busyRef.current || status === "sent") return;
    const generation = generationRef.current;
    const isCurrent = () => generationRef.current === generation;
    if (!user) {
      try {
        await signInWithGoogle();
        if (!isCurrent()) return;
      } catch (err) {
        if (!isCurrent()) return;
        logClientError("ActivityPage.rideThisRoute.signIn", err, { activityId });
        showToast(t("page.rideThisRoute.signInFailed"), "error");
      }
      return;
    }
    if (!activityId || !hasRoute) {
      showToast(t("page.rideThisRoute.noRoute"), "error");
      return;
    }

    busyRef.current = true;
    setFlowAlert(null);
    let targetCourseId = courseId;
    try {
      if (!targetCourseId) {
        setStatus("creating");
        const findExistingCourse = async (phase: "beforeCreate" | "afterCreateError") => {
          try {
            const snapshot = await getDocs(query(
              collection(firestore, "courses"),
              where("creatorId", "==", user.uid),
              where("sourceActivityId", "==", activityId),
              where("deletedAt", "==", null),
              limit(1),
            ));
            if (!isCurrent()) return undefined;
            return snapshot.docs[0]
              ? { kind: "found", courseId: snapshot.docs[0].id } satisfies CourseLookup
              : { kind: "missing" } satisfies CourseLookup;
          } catch (err) {
            if (!isCurrent()) return undefined;
            logClientError("ActivityPage.rideThisRoute.findExistingCourse", err, { activityId, phase });
            return { kind: "error" } satisfies CourseLookup;
          }
        };

        const readIntent = (): IntentRead => {
          const key = intentKey(user.uid, activityId);
          const memoryIntent = intentMemory.get(key);
          if (memoryIntent) {
            if (Date.now() - memoryIntent.updatedAt <= INTENT_TTL_MS) return { kind: "value", intent: memoryIntent };
            intentMemory.delete(key);
          }
          try {
            const raw = window.sessionStorage.getItem(key);
            if (!raw) return { kind: "none" };
            const intent = JSON.parse(raw) as RouteIntent;
            if (!intent.updatedAt || Date.now() - intent.updatedAt > INTENT_TTL_MS) {
              window.sessionStorage.removeItem(key);
              return { kind: "none" };
            }
            if ((intent.state === "created" && intent.courseId) || intent.state === "pending") {
              intentMemory.set(key, intent);
              return { kind: "value", intent };
            }
            window.sessionStorage.removeItem(key);
            return { kind: "none" };
          } catch (err) {
            logClientError("ActivityPage.rideThisRoute.readIntent", err, { activityId });
            return { kind: "none" };
          }
        };
        const writeIntent = (intent: RouteIntent) => {
          const key = intentKey(user.uid, activityId);
          intentMemory.set(key, intent);
          try {
            window.sessionStorage.setItem(key, JSON.stringify(intent));
          } catch (err) {
            logClientError("ActivityPage.rideThisRoute.writeIntent", err, { activityId, state: intent.state });
          }
        };
        const clearIntent = () => {
          const key = intentKey(user.uid, activityId);
          intentMemory.delete(key);
          try {
            window.sessionStorage.removeItem(key);
          } catch (err) {
            logClientError("ActivityPage.rideThisRoute.clearIntent", err, { activityId });
          }
        };

        const savedIntent = readIntent();
        if (savedIntent.kind === "value" && savedIntent.intent.state === "created") {
          targetCourseId = savedIntent.intent.courseId ?? null;
        }

        if (!targetCourseId) {
          const existingCourse = await findExistingCourse("beforeCreate");
          if (!isCurrent() || existingCourse === undefined) return;
          if (existingCourse.kind === "error") throw new RideRouteFlowError("lookup");
          if (existingCourse.kind === "found") {
            targetCourseId = existingCourse.courseId;
            writeIntent({ state: "created", courseId: targetCourseId, updatedAt: Date.now() });
          } else if (savedIntent.kind === "value" && savedIntent.intent.state === "pending") {
            // 이전 create 결과가 모호한 동안은 TTL 만료 전까지 조회만 허용한다.
            // 새 create는 사용자가 다시 눌러도, 페이지를 새로 열어도 실행하지 않는다.
            throw new RideRouteFlowError("ambiguous");
          }
        }

        if (!targetCourseId) {
          writeIntent({ state: "pending", updatedAt: Date.now() });
          const createCourse = httpsCallable<
            { activityId: string; name: string; description: string; surface: null; difficulty: null },
            { courseId: string }
          >(functions, "createCourseFromActivity");
          const fallbackName = t("page.rideThisRoute.courseName");
          const activityName = activity.description?.trim();
          try {
            const result = await createCourse({
              activityId,
              name: (activityName && activityName.length >= 2 ? activityName : fallbackName).slice(0, 50),
              description: t("page.rideThisRoute.courseDescription"),
              surface: null,
              difficulty: null,
            });
            if (!isCurrent()) return;
            targetCourseId = result.data?.courseId;
            if (!targetCourseId) throw new Error("createCourseFromActivity returned no courseId");
            writeIntent({ state: "created", courseId: targetCourseId, updatedAt: Date.now() });
            track("activity_route_course_create_ok", { activity_id: activityId, course_id: targetCourseId });
          } catch (createError) {
            if (!isCurrent()) return;
            if (isDefinitiveCreateFailure(createError)) {
              clearIntent();
              throw createError;
            }
            // Callable 응답이 유실됐어도 서버 write는 끝났을 수 있다. 같은 요청 안에서는
            // 절대 다시 create하지 않고, sourceActivityId로 결과를 회복한 뒤에만 전송한다.
            const recovered = await findExistingCourse("afterCreateError");
            if (!isCurrent() || recovered === undefined) return;
            if (recovered.kind === "error") throw new RideRouteFlowError("lookup", createError);
            if (recovered.kind === "missing") throw new RideRouteFlowError("ambiguous", createError);
            targetCourseId = recovered.courseId;
            writeIntent({ state: "created", courseId: targetCourseId, updatedAt: Date.now() });
          }
        }

        if (!isCurrent()) return;
        setCourseId(targetCourseId);
      }

      if (!isCurrent()) return;
      setStatus("sending");
      const sendCourse = httpsCallable<{ courseId: string }, unknown>(functions, "sendCourseToApp");
      await sendCourse({ courseId: targetCourseId });
      if (!isCurrent()) return;
      setStatus("sent");
      setFlowAlert(null);
      track("activity_route_send_app_ok", { activity_id: activityId, course_id: targetCourseId });
      showToast(t("page.rideThisRoute.sent"));
    } catch (err) {
      if (!isCurrent()) return;
      const courseWasCreated = !!targetCourseId;
      setStatus("idle");
      logClientError("ActivityPage.rideThisRoute", err, {
        activityId,
        courseId: targetCourseId ?? undefined,
        stage: courseWasCreated ? "send" : "create",
      });
      const reason = err instanceof RideRouteFlowError ? err.reason : null;
      setFlowAlert(t(
        reason === "lookup"
          ? "page.rideThisRoute.lookupFailed"
          : reason === "ambiguous"
            ? "page.rideThisRoute.createPending"
            : courseWasCreated
              ? "page.rideThisRoute.sendFailed"
              : "page.rideThisRoute.createFailed",
      ));
    } finally {
      if (isCurrent()) busyRef.current = false;
    }
  };

  const label = status === "creating"
    ? t("page.rideThisRoute.creating")
    : status === "sending"
      ? t("page.rideThisRoute.sending")
      : status === "sent"
        ? t("page.rideThisRoute.sentButton")
        : user
          ? t("page.rideThisRoute.button")
          : t("page.rideThisRoute.signInButton");

  return (
    <>
      <Button
        onClick={handleClick}
        variant="primary"
        disabled={status !== "idle"}
        aria-busy={status === "creating" || status === "sending"}
        className="w-full justify-center"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 17.5V6.8a1 1 0 011.45-.9L10 8.2l4-2 4.55 2.3a1 1 0 01.55.9v8.8a1 1 0 01-1.45.9L14 17.2l-4 2-5.45-2.7A1 1 0 014 17.5zM10 8.2v11M14 6.2v11" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 3l3 3-3 3M20 6h-5" />
        </svg>
        {label}
      </Button>
      {flowAlert && <p role="alert" className="mt-2 text-[length:var(--fs-sm)] text-[var(--color-error)]">{flowAlert}</p>}
    </>
  );
}
