export interface CourseClimbStructure {
  gain: number;
  dist: number;
  cat: number;
}

/** Firestore/API 입력을 계산 가능한 클라임 구조로 정규화한다. */
export function sanitizeCourseClimbs(input: unknown): CourseClimbStructure[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((value) => {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) return [];
    const climb = value as Record<string, unknown>;
    const { gain, dist, cat } = climb;
    if (typeof gain !== 'number' || !Number.isFinite(gain) || gain < 0) return [];
    if (typeof dist !== 'number' || !Number.isFinite(dist) || dist <= 0) return [];
    if (typeof cat !== 'number' || !Number.isFinite(cat) || !Number.isInteger(cat) || cat < 1 || cat > 5) return [];
    return [{ gain, dist, cat }];
  });
}
