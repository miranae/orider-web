/**
 * Form(TSB) 구간 어휘 — **서버 정본의 사본** (#2438, 에픽 app#2237 의 L).
 *
 * ⚠️ 원본은 `orider-g1-web/shared/training/formBand.ts` 다. 여기에는 **어휘만** 옮긴다 —
 * 경계값과 판정 함수(`formBandFromTsb`/`resolveFormBand`)는 일부러 가져오지 않았다.
 * 같은 TSB 가 플랫폼마다 다른 상태로 읽히던 문제(매트릭스 `fitness.form.label`)를 없애려면
 * 판정이 서버 한 곳에만 있어야 하고, 클라이언트는 **키를 라벨로 매핑하기만** 한다.
 *
 * 키는 웹 i18n `fitness:trainingStatus.*` 와 1:1 이다.
 */

export const FORM_BAND_KEYS = [
  "overload", // 과부하 주의
  "needsRecovery", // 회복 필요
  "productive", // 순항
  "fresh", // 회복 완료
  "overRecovered", // 과회복
] as const;
export type FormBandKey = (typeof FORM_BAND_KEYS)[number];

export interface FormBand {
  key: FormBandKey;
  /** FORM_BAND_KEYS 내 위치(0~4) — 스펙트럼 바 강조 위치. */
  index: number;
  /** 과부하 판정이 램프율 때문인가 — 조언 문구 분기. */
  drivenByRamp: boolean;
}

/** 서버가 준 문자열이 아는 구간인가. 모르는 값(서버 선행 배포)은 null 로 떨어뜨린다 — 파싱은 깨지 않는다. */
export function knownFormBandKey(value: string): FormBandKey | null {
  return (FORM_BAND_KEYS as readonly string[]).includes(value) ? (value as FormBandKey) : null;
}
