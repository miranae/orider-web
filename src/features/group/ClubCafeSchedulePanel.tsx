import { useEffect, useState } from "react";
import type { ClubCafeSchedule } from "@shared/clubCafeSchedule";
import { getClubCafeSchedule } from "../../services/clubCafeSchedule";
import { logClientError } from "../../services/errorLogger";
import { ErrorState } from "../../components/redesign";
import MeetingSchedule from "./MeetingSchedule";
export default function ClubCafeSchedulePanel({groupId, language}: {groupId: string; language: string}) {
  const [result, setResult] = useState<{groupId: string; schedule: ClubCafeSchedule | null} | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setResult(null);
    getClubCafeSchedule(groupId).then(schedule => { if (!cancelled) setResult({groupId, schedule}); }).catch(error => {
      logClientError("ClubCafeSchedule.load", error, {groupId});
      if (!cancelled) setFailed(true);
    });
    return () => {cancelled = true;};
  }, [groupId, attempt]);
  if (failed) return <ErrorState title={language.startsWith("en") ? "Could not load cafe schedules" : "카페 일정을 불러오지 못했어요."} onRetry={() => setAttempt(a => a + 1)} />;
  return result?.groupId === groupId && result.schedule ? <MeetingSchedule key={groupId} schedule={result.schedule} language={language} /> : null;
}
