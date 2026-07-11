export interface ClimbGoalInput {
  climbName: string;
  climbDurationMin: number;
  targetWkg?: number;
  targetDate: string;
  weeklySessions: 1 | 2 | 3 | 4 | 5 | 6;
}

export function buildClimbGoalRequest(input: ClimbGoalInput) {
  const climbName = input.climbName.trim();
  if (!climbName || climbName.length > 80) throw new Error('invalid-climb-name');
  if (!Number.isFinite(input.climbDurationMin) || input.climbDurationMin < 3 || input.climbDurationMin > 240) throw new Error('invalid-duration');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.targetDate)) throw new Error('invalid-date');
  if (input.targetWkg != null && (!Number.isFinite(input.targetWkg) || input.targetWkg < 1 || input.targetWkg > 8)) throw new Error('invalid-wkg');
  return { goalType: 'climb' as const, ...input, climbName };
}
