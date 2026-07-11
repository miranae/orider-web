export interface ClimbGoalInput {
  climbName: string;
  climbDurationMin: number;
  targetWkg?: number;
  targetDate: string;
  weeklySessions: 1 | 2 | 3 | 4 | 5 | 6;
}

const WEEK_MS = 7 * 86400000;
const KST_OFFSET_MS = 9 * 3600000;

function kstDateAtOrAfter(instantMs: number): string {
  const shifted = new Date(instantMs + KST_OFFSET_MS);
  const hasTime = shifted.getUTCHours() !== 0 || shifted.getUTCMinutes() !== 0
    || shifted.getUTCSeconds() !== 0 || shifted.getUTCMilliseconds() !== 0;
  if (hasTime) shifted.setUTCDate(shifted.getUTCDate() + 1);
  return shifted.toISOString().slice(0, 10);
}

function kstDateAtOrBefore(instantMs: number): string {
  return new Date(instantMs + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function climbGoalDateBounds(nowMs: number = Date.now()) {
  return {
    min: kstDateAtOrAfter(nowMs + 4 * WEEK_MS),
    max: kstDateAtOrBefore(nowMs + 24 * WEEK_MS),
  };
}

export function buildClimbGoalRequest(input: ClimbGoalInput, nowMs: number = Date.now()) {
  const climbName = input.climbName.trim();
  if (!climbName || climbName.length > 80) throw new Error('invalid-climb-name');
  if (!Number.isFinite(input.climbDurationMin) || input.climbDurationMin < 3 || input.climbDurationMin > 240) throw new Error('invalid-duration');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.targetDate)) throw new Error('invalid-date');
  const targetMs = new Date(`${input.targetDate}T00:00:00+09:00`).getTime();
  if (targetMs < nowMs + 4 * WEEK_MS || targetMs > nowMs + 24 * WEEK_MS) throw new Error('invalid-date-range');
  if (input.targetWkg != null && (!Number.isFinite(input.targetWkg) || input.targetWkg < 1 || input.targetWkg > 8)) throw new Error('invalid-wkg');
  if (!Number.isInteger(input.weeklySessions) || input.weeklySessions < 1 || input.weeklySessions > 6) throw new Error('invalid-sessions');
  return { goalType: 'climb' as const, ...input, climbName };
}
