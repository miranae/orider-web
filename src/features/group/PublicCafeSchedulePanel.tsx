import { useEffect, useState } from "react";
import type { ClubCafeSchedule } from "@shared/clubCafeSchedule";
import { getPublicCafeSchedule } from "../../services/publicClubs";
import { logClientError } from "../../services/errorLogger";
import { ErrorState, LoadingSkeleton } from "../../components/redesign";
import MeetingSchedule from "./MeetingSchedule";

export default function PublicCafeSchedulePanel({ groupId, language }: { groupId: string; language: string }) {
  const [result, setResult] = useState<{ groupId: string; schedule: ClubCafeSchedule | null } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setFailed(false);
    setResult(null);
    if (groupId !== "club-lara") { setResult({ groupId, schedule: null }); return; }
    getPublicCafeSchedule(groupId, controller.signal).then(schedule => { if (!cancelled) setResult({ groupId, schedule }); }).catch(error => {
      if (!cancelled) { logClientError("PublicCafeSchedule.load", error, { groupId }); setFailed(true); }
    });
    return () => { cancelled = true; controller.abort(); };
  }, [groupId, attempt]);
  if (groupId !== "club-lara") return null;
  if (failed) return <ErrorState title={language.startsWith("en") ? "Could not load cafe schedules" : "카페 일정을 불러오지 못했어요."} onRetry={() => setAttempt(a => a + 1)} />;
  if (result?.groupId !== groupId) return <LoadingSkeleton kind="list" count={2} />;
  return result?.groupId === groupId && result.schedule ? <MeetingSchedule key={groupId} schedule={result.schedule} language={language} /> : null;
}
