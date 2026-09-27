export interface ExecutionPrescriptionDay {
  workout: string;
  executionWorkoutOverride?: string | null;
  adjustedDurationMin?: number | null;
  closedLoopAdjustment?: { originalWorkout: string; suggestedWorkout: string } | null;
}

/** 확인된 강도 교체만 원본 임포트 구간보다 우선한다. 새 import는 이전 조정 근거를 지운다. */
export function usesEffectiveExecutionPrescription(day: ExecutionPrescriptionDay, weekAdjustmentReason?: string | null): boolean {
  if (day.executionWorkoutOverride != null) return day.executionWorkoutOverride === day.workout;
  return day.closedLoopAdjustment != null && day.closedLoopAdjustment.suggestedWorkout === day.workout
    && day.closedLoopAdjustment.originalWorkout !== day.workout
    || weekAdjustmentReason === 'recovery_critical' && day.adjustedDurationMin != null
    && (day.workout === 'rec' || day.workout === 'z2');
}
