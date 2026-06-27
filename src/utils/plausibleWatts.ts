/**
 * 파워 스트림 신뢰성 가드 — 서버 analysis/activity-metrics.ts 의 plausibleWatts 미러 (#532).
 *
 * 클라 AnalysisTab 이 원본 watts 를 그대로 NP/IF/TSS/CP 계산에 넣어, 서버 사전계산값
 * (ServerMetricsBanner)·피드·PDC 와 발산했다(손상 활동: FTP 87 라이더 NP 867 등).
 * 클라/서버 동일 정제를 위해 같은 룰을 적용한다. (functions 는 런타임 shared import 불가라
 * 분석 클라/서버 미러 패턴 — CLAUDE.md "분석: 클라 vs 서버" — 을 따른다.)
 */
const MAX_PLAUSIBLE_WATTS = 2000;

/**
 * @param raw 원본 파워 스트림. 비거나 없으면 그대로 반환.
 * @param ftp 임계파워(W). cap 판정 기준(없으면 600/700 폴백).
 * @returns 신뢰 가능하면 고립 스파이크만 2000W 클램프한 배열, 비현실(평균/5분>2×FTP)이면 undefined.
 */
export function plausibleWatts(raw: number[] | undefined, ftp: number | undefined): number[] | undefined {
  if (!raw || raw.length === 0) return raw;

  // 평균은 RAW 기준 — 클램프 후 평균은 스파이크가 깎여 garbage 가 통과.
  let sum = 0, cnt = 0;
  for (const w of raw) {
    if (typeof w === "number" && Number.isFinite(w) && w >= 0) { sum += w; cnt++; }
  }
  const cap = typeof ftp === "number" && ftp > 0 ? ftp * 2 : 600;
  if (cnt > 0 && sum / cnt > cap) return undefined; // 평균 비현실 → 파워 신뢰 불가

  // 5분(≈300s) 최대 롤링평균이 2×FTP(또는 700W) 초과면 어떤 라이더도 불가능.
  const W5 = 300;
  if (raw.length >= W5) {
    const cap5 = typeof ftp === "number" && ftp > 0 ? ftp * 2 : 700;
    let win = 0;
    for (let i = 0; i < W5; i++) win += Number.isFinite(raw[i]!) && raw[i]! > 0 ? raw[i]! : 0;
    let maxWin = win;
    for (let i = W5; i < raw.length; i++) {
      win += (Number.isFinite(raw[i]!) && raw[i]! > 0 ? raw[i]! : 0)
           - (Number.isFinite(raw[i - W5]!) && raw[i - W5]! > 0 ? raw[i - W5]! : 0);
      if (win > maxWin) maxWin = win;
    }
    if (maxWin / W5 > cap5) return undefined; // 5분 지속파워 비현실 → 파워 신뢰 불가
  }

  // 신뢰 가능 → 고립 스파이크만 per-sample 클램프.
  return raw.map((w) => (typeof w === "number" && w > MAX_PLAUSIBLE_WATTS ? MAX_PLAUSIBLE_WATTS : w));
}
