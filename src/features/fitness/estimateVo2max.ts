/** 현재 적용 FTP와 프로필 체중으로 계산한 간접 추정. PDC 추정과 구분한다. */
export function estimateVo2max(ftp: number | null, weightKg: number | undefined): number | null {
  if (!ftp || ftp <= 0 || !weightKg || weightKg <= 0) return null;
  return Math.round((ftp / weightKg) * 15.7 + 3.5);
}
