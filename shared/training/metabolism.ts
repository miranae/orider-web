/**
 * 에너지대사 (Metabolism) — 강도별 지방/탄수 연소 추정 + FATMAX 존 v1.
 *
 * 운동 강도(%FTP)를 기준으로 지방산화율(상대)을 종형(bell) 곡선으로 모델링하고,
 * 라이드 전체 일량(kJ→kcal)을 지방/탄수 기여로 분할한다. 또한 지방산화가 최대가
 * 되는 강도(FATMAX)와 그 강도에서의 지속시간·TSS 를 추정한다.
 *
 * - 순수 함수만. firebase / 외부 IO 없음 → 클라에서 직접 파생 계산(서버 저장·백필 불필요).
 *
 * ── 모델 근거와 한계 ──────────────────────────────────────────────────────────
 * 지방산화율은 본래 간접 열량측정(RER, indirect calorimetry)으로 개인별 측정해야
 * 정확하다. 여기서는 RER 미측정 상황을 가정하므로 다음 **집단 평균 근사**를 쓴다:
 *   - 운동 강도 %VO2max 가 올라갈수록 지방산화율은 종형으로 증가하다 정점(FATMAX) 후 급감,
 *     고강도(>~85% VO2max)에서는 사실상 0 에 수렴한다 (Achten & Jeukendrup, 2003/2004).
 *   - 훈련된 지구성 athlete 의 FATMAX 는 대략 59~64% VO2max 부근에 분포한다
 *     (Achten et al., 2002; Nordby et al.). 본 모델은 %FTP 를 %VO2max 의 대용(proxy)으로
 *     쓰며, FTP(≈1시간 파워)는 대략 ~91% VO2max 강도에 해당하므로 %FTP 축에서의 정점은
 *     %VO2max 정점보다 살짝 높은 ~0.68 %FTP 로 둔다.
 *
 * 한계: 개인 RER·식이(저탄수/케토)·훈련 상태·환경에 따라 실제 곡선은 크게 달라진다.
 * 이 값은 "집단 평균 추정"이며 개인 보정(실측 FATMAX, RER)은 v2 과제.
 * 가상파워(파워미터 없는 추정 파워) 활동은 입력 자체가 추정이라 신뢰도가 더 낮다.
 */

/** 지방산화 종형곡선의 정점 강도 (%FTP). 집단 평균 근사 — 개인 보정은 v2. */
export const FATMAX_PEAK_PCT_FTP = 0.68;

/** 종형곡선 폭(표준편차, %FTP). 작을수록 정점이 날카롭다. */
const FATMAX_SIGMA = 0.18;

/** 라이드 지속가능시간 합리적 상한 (분). fatMaxWatts ≤ CP 인 저강도는 사실상 매우 길게
 *  지속 가능하므로 무한대 대신 이 값으로 캡한다. */
export const SUSTAINABLE_CAP_MIN = 240;

/**
 * 그로스 기계효율 (gross efficiency). 사이클링 기계효율은 보통 ~20~25% 범위.
 * 대사 에너지(kcal) = 기계일(kJ) / 효율 / 4.184.
 * 0.24 가정 → 1 kJ ≈ 1/0.24/4.184 ≈ 0.996 kcal, 즉 통상 "1 kJ ≈ 1 kcal" 관행과 일치.
 */
export const GROSS_EFFICIENCY = 0.24;

/**
 * 강도(%FTP) → 상대 지방산화율 (0~1, 정점에서 1).
 * 정점 FATMAX_PEAK_PCT_FTP 를 중심으로 한 비대칭 가우시안:
 *  - 정점 이하(저강도): 완만, Z1 영역으로 가면서 낮아짐
 *  - 정점 이상(고강도): 급격히 감소, ~1.0 %FTP(=무산소 영역) 부근에서 거의 0
 * intensityPctFtp 는 0 이상. 1.0 = FTP.
 */
export function relativeFatOxidation(intensityPctFtp: number): number {
  if (!Number.isFinite(intensityPctFtp) || intensityPctFtp <= 0) return 0;
  const d = intensityPctFtp - FATMAX_PEAK_PCT_FTP;
  // 정점 위쪽은 좁은 sigma 로 더 가파르게 떨어뜨려 고강도에서 빠르게 0 에 수렴.
  const sigma = d >= 0 ? FATMAX_SIGMA * 0.62 : FATMAX_SIGMA;
  const v = Math.exp(-(d * d) / (2 * sigma * sigma));
  return v < 0.02 ? 0 : v;
}

/**
 * 강도(%FTP) → 지방 기여 비율 (0~1). 해당 강도에서 소비 에너지 중 지방이 차지하는 분율.
 * relativeFatOxidation(상대 지방산화율)을 실제 에너지 분율로 매핑한다.
 *  - 저강도(FATMAX 부근): 지방 분율 높음(최대 ~0.6)
 *  - 고강도: 탄수 우세 → 지방 분율 ~0 에 수렴
 * 0.60 은 FATMAX 부근 지방 에너지 분율 상한 근사(집단 평균; 식이에 따라 변동).
 */
const FAT_FRACTION_AT_PEAK = 0.6;

export function fatEnergyFraction(intensityPctFtp: number): number {
  return relativeFatOxidation(intensityPctFtp) * FAT_FRACTION_AT_PEAK;
}

/** 정점(FATMAX) 강도를 %FTP 로 반환. (개인 보정은 v2) */
export function fatMaxIntensityPctFtp(): number {
  return FATMAX_PEAK_PCT_FTP;
}

export interface FatMaxProfile {
  /** FATMAX 강도의 절대 파워 (W). */
  fatMaxWatts: number;
  /** FATMAX 강도 (%FTP, 0~1). */
  fatMaxPctFtp: number;
  /** 해당 강도 지속가능시간 (분). CP 모델 없으면 null. 저강도는 SUSTAINABLE_CAP_MIN 로 캡. */
  sustainableMin: number | null;
  /** 해당 강도·지속시간 기준 TSS. sustainableMin 없으면 null. */
  tssAtFatMax: number | null;
}

/**
 * FATMAX 존 프로파일 계산.
 * @param ftp 기능적 임계파워 (W)
 * @param cp 임계파워 (W'). 없으면 지속시간·TSS 추정 불가 → null
 * @param wPrime 무산소 용량 (J)
 */
export function computeFatMaxProfile(
  ftp: number,
  cp: number | null,
  wPrime: number | null,
): FatMaxProfile {
  const fatMaxPctFtp = FATMAX_PEAK_PCT_FTP;
  const fatMaxWatts = Math.round(ftp * fatMaxPctFtp);

  let sustainableMin: number | null = null;
  if (cp != null && cp > 0) {
    if (fatMaxWatts <= cp) {
      // CP 이하 → 무산소 용량 소진 없이 장시간 지속 가능. 합리적 상한으로 캡.
      sustainableMin = SUSTAINABLE_CAP_MIN;
    } else if (wPrime != null && wPrime > 0) {
      // CP 초과 → W' 소진 시간 t = W' / (P - CP) (초) → 분.
      const tSec = wPrime / (fatMaxWatts - cp);
      sustainableMin = Math.round((tSec / 60) * 10) / 10;
    }
  }

  let tssAtFatMax: number | null = null;
  if (sustainableMin != null && sustainableMin > 0) {
    const durationSec = sustainableMin * 60;
    const intensity = fatMaxPctFtp; // IF ≈ %FTP
    tssAtFatMax = Math.round((durationSec * intensity * intensity) / 3600 * 100);
  }

  return { fatMaxWatts, fatMaxPctFtp, sustainableMin, tssAtFatMax };
}

export interface RideSubstrate {
  /** 지방 연소 추정 (kcal). */
  fatKcal: number;
  /** 탄수 연소 추정 (kcal). */
  carbKcal: number;
  /** 전체 에너지 중 지방 비율 (0~1). */
  fatPct: number;
  /** 총 소비 에너지 추정 (kcal). */
  totalKcal: number;
}

/**
 * 라이드 전체의 지방/탄수 연소 분할 추정.
 * 각 초의 파워 → %FTP → 지방 에너지 분율 → 그 초의 에너지를 지방/탄수로 나눈다.
 *
 * @param watts 1Hz 파워 스트림 (W)
 * @param ftp 기능적 임계파워 (W)
 * @param weightKg 체중. **현재 kcal 추정에는 미사용** — 파워(kJ) 기반 기계일을 그대로
 *   대사 에너지로 환산하므로 체중 비의존. 시그니처에 둔 이유는 v2 에서 체중 기반
 *   RMR/총소비 보정 여지 + 호출부 일관성. null 허용.
 *
 * kcal 추정 가정: 총 기계일(kJ) = Σ watts / 1000. 대사 에너지(kcal) =
 *   기계일(kJ) / GROSS_EFFICIENCY / 4.184 (≈ 1 kJ ≈ 1 kcal). 효율 0.24 가정(주석 참조).
 */
export function computeRideSubstrate(
  watts: number[],
  ftp: number,
  weightKg: number | null,
): RideSubstrate {
  void weightKg; // v1 미사용 (위 주석 참조)
  if (!watts || watts.length === 0 || !Number.isFinite(ftp) || ftp <= 0) {
    return { fatKcal: 0, carbKcal: 0, fatPct: 0, totalKcal: 0 };
  }

  // 초당 일(J) 누적을 지방/탄수로 분할 (각 초 1Hz 가정 → W=J/s).
  let fatJoules = 0;
  let totalJoules = 0;
  for (let i = 0; i < watts.length; i++) {
    const w = watts[i];
    if (w == null || !Number.isFinite(w) || w <= 0) continue;
    totalJoules += w;
    const frac = fatEnergyFraction(w / ftp);
    fatJoules += w * frac;
  }

  const kjToKcal = (kj: number) => kj / GROSS_EFFICIENCY / 4.184;
  const totalKcal = kjToKcal(totalJoules / 1000);
  const fatKcal = kjToKcal(fatJoules / 1000);
  const carbKcal = totalKcal - fatKcal;
  const fatPct = totalKcal > 0 ? fatKcal / totalKcal : 0;

  return {
    fatKcal: Math.round(fatKcal),
    carbKcal: Math.round(carbKcal),
    fatPct,
    totalKcal: Math.round(totalKcal),
  };
}
