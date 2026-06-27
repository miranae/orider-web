import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore } from "../services/firebase";

export interface BackfillJob {
  status: "queued" | "running" | "done" | "failed";
  mode: "new" | "recalc-all";
  total: number;
  done: number;
  failed: number;
  pendingStreams: number;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  error?: string;
}

export function useBackfillJob(uid: string | null) {
  const [job, setJob] = useState<BackfillJob | null>(null);
  useEffect(() => {
    if (!uid) {
      setJob(null);
      return;
    }
    const ref = doc(firestore, "users", uid, "jobs", "virtual_power_backfill");
    const unsub = onSnapshot(ref, (snap) => {
      setJob((snap.data() as BackfillJob | undefined) ?? null);
    });
    return () => unsub();
  }, [uid]);
  return job;
}
