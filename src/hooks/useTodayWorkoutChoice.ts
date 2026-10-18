import { useCallback, useEffect, useState } from "react";
import { saveTodayWorkoutChoice, subscribeTodayWorkoutChoice } from "../services/todayWorkoutChoiceClient";
import {
  todayChoiceOrNull,
  type TodayWorkoutChoice,
  type TodayWorkoutChoiceDiscipline,
  type TodayWorkoutChoiceType,
} from "../services/todayWorkoutChoiceContract";
import { logClientError } from "../services/errorLogger";

export interface TodayWorkoutChoiceState {
  /** 오늘(KST) 정한 운동. 없거나 지난 날짜면 null. */
  choice: TodayWorkoutChoice | null;
  loading: boolean;
  loadFailed: boolean;
  saving: boolean;
  saveFailed: boolean;
  save: (workoutType: TodayWorkoutChoiceType | null) => Promise<void>;
}

/** 종목별 "오늘 정한 운동"을 구독하고 저장한다. 수영·통합은 bike 로 보지 않고 호출부가 정한다. */
export function useTodayWorkoutChoice(uid: string | null | undefined, discipline: TodayWorkoutChoiceDiscipline): TodayWorkoutChoiceState {
  const owner = uid ? `${uid}:${discipline}` : null;
  const [snapshot, setSnapshot] = useState<{ owner: string; choice: TodayWorkoutChoice | null; failed: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    if (!uid || !owner) return;
    return subscribeTodayWorkoutChoice(uid, discipline,
      (choice) => setSnapshot({ owner, choice, failed: false }),
      (error) => { logClientError("todayWorkoutChoice.subscribe", error, { discipline }); setSnapshot({ owner, choice: null, failed: true }); });
  }, [uid, discipline, owner]);

  const save = useCallback(async (workoutType: TodayWorkoutChoiceType | null) => {
    if (!uid) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      const saved = await saveTodayWorkoutChoice(discipline, workoutType);
      // 구독이 곧 같은 값을 주지만, 버튼 상태가 바로 바뀌도록 응답을 먼저 반영한다.
      setSnapshot({ owner: `${uid}:${discipline}`, choice: saved, failed: false });
    } catch (error) {
      logClientError("todayWorkoutChoice.save", error, { discipline, workoutType });
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }, [uid, discipline]);

  const current = snapshot?.owner === owner ? snapshot : null;
  return {
    choice: todayChoiceOrNull(current?.choice ?? null, Date.now()),
    loading: Boolean(owner) && !current,
    loadFailed: current?.failed ?? false,
    saving,
    saveFailed,
    save,
  };
}
