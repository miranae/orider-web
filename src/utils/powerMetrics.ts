/** Normalized Power: 30초 롤링 평균의 4제곱 평균 → 4제곱근 */
export function calculateNP(watts: number[]): number | null {
  if (watts.length < 30) return null

  const rollingAvg: number[] = []
  for (let i = 0; i <= watts.length - 30; i++) {
    let sum = 0
    for (let j = 0; j < 30; j++) sum += watts[i + j]!
    rollingAvg.push(sum / 30)
  }

  const mean4th = rollingAvg.reduce((sum, v) => sum + v ** 4, 0) / rollingAvg.length
  const np = Math.sqrt(Math.sqrt(mean4th))
  return Number.isFinite(np) ? np : null // NaN 입력(센서 글리치) 전파 차단 (#538)
}

/** Intensity Factor: NP / FTP */
export function calculateIF(watts: number[], ftp: number): number | null {
  const np = calculateNP(watts)
  if (np === null || ftp <= 0) return null
  return np / ftp
}

/** Training Stress Score: (seconds × NP × IF) / (FTP × 3600) × 100 */
export function calculateTSS(watts: number[], ftp: number): number | null {
  const np = calculateNP(watts)
  const ifactor = calculateIF(watts, ftp)
  if (np === null || ifactor === null) return null
  return (watts.length * np * ifactor) / (ftp * 3600) * 100
}

/** Variability Index: NP / Average Power */
export function calculateVI(watts: number[]): number | null {
  const np = calculateNP(watts)
  if (np === null) return null
  // 음수/NaN 글리치·대량 0(코스팅·정지)으로 평균이 0 근처면 VI=NP/avg 가 수백~수천으로
  // 폭주한다(#538). 유한값만 평균 + 1W 하한 가드로 비현실 VI 차단.
  let sum = 0, n = 0
  for (const w of watts) { if (Number.isFinite(w)) { sum += w; n++ } }
  const avg = n > 0 ? sum / n : 0
  if (avg < 1) return null
  return np / avg
}
