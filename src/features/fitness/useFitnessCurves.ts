import { useEffect, useRef, useState } from "react";
import { doc, getDoc, onSnapshot, type DocumentSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { logClientError } from "../../services/errorLogger";
import {
  buildRunPacePeriods,
  buildSwimPacePeriods,
  type CurvePeriods,
  type RunPacePoint,
  type SwimPacePoint,
} from "./fitnessCurveDocuments";

export interface FitnessCurves {
  run: CurvePeriods<RunPacePoint>;
  swim: CurvePeriods<SwimPacePoint>;
}

const emptyCurves = (): FitnessCurves => ({
  run: { recent28: [], prev28: [] },
  swim: { recent28: [], prev28: [] },
});

function logCurveError(operation: string) {
  // Raw SDK errors can contain document paths and account identifiers.
  logClientError(`useFitnessCurves.${operation}`, new Error("Fitness curve read failed"));
}

export function useFitnessCurves(uid: string | null | undefined): FitnessCurves {
  const { firestore, functions, ensureAppCheckReady } = useFirebaseServices();
  const [state, setState] = useState<{ uid: typeof uid; curves: FitnessCurves }>(() => ({ uid, curves: emptyCurves() }));
  // Keep the same request through StrictMode's setup/cleanup replay, and never retry
  // a rejected backfill automatically during this hook's lifetime.
  const ensureRequests = useRef(new Map<string, Promise<boolean>>());
  const currentUid = useRef(uid);
  currentUid.current = uid;

  useEffect(() => {
    let active = true;
    setState({ uid, curves: emptyCurves() });
    if (!uid) return undefined;

    const refs = {
      run: doc(firestore, "users", uid, "fitness", "pace_run"),
      swim: doc(firestore, "users", uid, "fitness", "css_swim"),
    };
    const revisions = { run: 0, swim: 0 };
    let awaitingEnsure = false;

    function publish(discipline: "run" | "swim", snapshot: DocumentSnapshot) {
      if (!active) return;
      try {
        const periods = !snapshot.exists() ? { recent28: [], prev28: [] }
          : discipline === "run" ? buildRunPacePeriods(snapshot.data(), Date.now())
            : buildSwimPacePeriods(snapshot.data(), Date.now());
        setState((previous) => ({ uid, curves: { ...previous.curves, [discipline]: periods } }));
      } catch {
        logCurveError("invalidContract");
        setState((previous) => ({ uid, curves: {
          ...previous.curves, [discipline]: { recent28: [], prev28: [] },
        } }));
      }
    }

    function ensureMissingDocuments() {
      if (awaitingEnsure) return;
      awaitingEnsure = true;
      let request = ensureRequests.current.get(uid!);
      if (!request) {
        request = Promise.resolve().then(async () => {
          await ensureAppCheckReady();
          if (currentUid.current !== uid) return false;
          await httpsCallable(functions, "ensureFitnessCurves")({});
          return true;
        });
        ensureRequests.current.set(uid!, request);
      }
      void request.then(async (completed) => {
        if (!completed) {
          ensureRequests.current.delete(uid!);
          return;
        }
        if (!active) return;
        await Promise.all((Object.keys(refs) as Array<"run" | "swim">).map(async (discipline) => {
          const revision = revisions[discipline];
          try {
            const snapshot = await getDoc(refs[discipline]);
            if (active && revisions[discipline] === revision) publish(discipline, snapshot);
          } catch {
            if (!active || revisions[discipline] !== revision) return;
            logCurveError("reread");
            setState((previous) => ({ uid, curves: {
              ...previous.curves, [discipline]: { recent28: [], prev28: [] },
            } }));
          }
        }));
      }).catch(() => {
        if (!active) return;
        logCurveError("ensure");
        setState({ uid, curves: emptyCurves() });
      });
    }

    const unsubscribes = (Object.keys(refs) as Array<"run" | "swim">).map((discipline) => onSnapshot(
      refs[discipline],
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!active) return;
        revisions[discipline] += 1;
        publish(discipline, snapshot);
        // A cached absence does not prove the server document is missing.
        if (!snapshot.exists() && !snapshot.metadata.fromCache) ensureMissingDocuments();
      },
      () => {
        if (!active) return;
        logCurveError("snapshot");
        setState((previous) => ({ uid, curves: {
          ...previous.curves, [discipline]: { recent28: [], prev28: [] },
        } }));
      },
    ));
    return () => {
      active = false;
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [firestore, functions, ensureAppCheckReady, uid]);

  return state.uid === uid ? state.curves : emptyCurves();
}
