/**
 * HR 구간 시간으로 총열량을 나누는 낮은 신뢰도의 공통 모델(hr-fuel-v1).
 * RER 실측이 아니다. 아래 HRmax-지방 비율 앵커는 제품의 근사 가정이며 연구 회귀계수가 아니다.
 * 식사·훈련 상태·환경과 구간별 에너지 차이는 반영하지 않는다.
 * 연구 근거는 강도가 높을수록 탄수 기여가 커진다는 방향성에 한정한다:
 * https://pubmed.ncbi.nlm.nih.gov/19079940/
 */
export interface HrFuelSplit {
  totalKcal: number; fatKcal: number; carbKcal: number; fatPct: number; carbPct: number;
  fatGrams: number; carbGrams: number; basis: "heart_rate_zones";
}
const anchors = [[.5, .65], [.65, .55], [.75, .4], [.85, .2], [.95, .05], [1, 0]] as const;
function fatShare(hrRatio: number): number {
  if (hrRatio <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) {
    const [x, y] = anchors[i]!; const [previousX, previousY] = anchors[i - 1]!;
    if (hrRatio <= x) return previousY + (y - previousY) * (hrRatio - previousX) / (x - previousX);
  }
  return 0;
}
/** 실제 체중 기준 정본 총열량은 바꾸지 않는다. 충분히 관측된 정상 HR 구간에서만 분할한다. */
export function estimateHrFuelSplit(totalKcal: unknown, movingSec: unknown, maxHr: unknown,
  zoneSeconds: unknown, boundaries: unknown): HrFuelSplit | undefined {
  if (typeof totalKcal !== "number" || !Number.isFinite(totalKcal) || totalKcal < 1
    || typeof movingSec !== "number" || !Number.isFinite(movingSec) || movingSec <= 0
    || typeof maxHr !== "number" || !Number.isFinite(maxHr) || maxHr < 100 || maxHr > 240
    || !Array.isArray(zoneSeconds) || zoneSeconds.length !== 5 || !Array.isArray(boundaries) || boundaries.length !== 5
    || !zoneSeconds.every(v => typeof v === "number" && Number.isFinite(v) && v >= 0)) return undefined;
  const seconds = zoneSeconds.reduce((sum, value) => sum + value, 0);
  if (seconds / movingSec < .9 || seconds / movingSec > 1.1) return undefined;
  let weighted = 0; let previousUpper = 0;
  for (let i = 0; i < 5; i++) {
    const row = boundaries[i];
    if (!row || row.zone !== i + 1 || typeof row.minBpm !== "number" || typeof row.maxBpmExclusive !== "number"
      || !Number.isFinite(row.minBpm) || !Number.isFinite(row.maxBpmExclusive) || row.minBpm < 0
      || row.maxBpmExclusive <= row.minBpm || i > 0 && Math.abs(row.minBpm - previousUpper) > 1) return undefined;
    previousUpper = row.maxBpmExclusive;
    const midpoint = Math.min(maxHr, (row.minBpm + row.maxBpmExclusive) / 2);
    weighted += zoneSeconds[i] * fatShare(midpoint / maxHr);
  }
  const total = Math.round(totalKcal); const fatKcal = Math.round(total * weighted / seconds); const carbKcal = total - fatKcal;
  const fatPct = Math.round(fatKcal / total * 1000) / 10;
  return { totalKcal: total, fatKcal, carbKcal, fatPct, carbPct: Math.round((100 - fatPct) * 10) / 10,
    fatGrams: Math.round(fatKcal / 9 * 10) / 10, carbGrams: Math.round(carbKcal / 4 * 10) / 10, basis: "heart_rate_zones" };
}
