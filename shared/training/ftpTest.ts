/**
 * FTP 테스트 — 프로토콜별 FTP 후보값 산출 + 보수적 갱신 규칙 (라이덕 패리티 #307).
 *
 * 전용 테스트(Ramp / 20분 / All-out)에서 측정한 핵심 파워로 FTP 후보를 계산한다.
 * 자동 CP 추정(`CP×0.97`)과 별개로, 사용자가 명시적으로 수행한 테스트를 검증·반영하는 경로.
 *
 * 순수 함수. firebase/IO 없음 — 클라에서 직접 계산.
 */
import { isPositiveFinite } from "./mathUtil";

export type FtpTestProtocol = "ramp" | "twenty_min" | "all_out";

/**
 * 프로토콜별 입력 파워 → FTP 환산 계수 (표준 관행):
 * - ramp: 최종 1분 평균(MAP)의 75% (Ramp/MAP 테스트).
 * - twenty_min: 20분 평균의 95% (가장 보편적).
 * - all_out: 약 60분 전력 ≈ FTP 자체(100%).
 */
export const FTP_TEST_FACTORS: Record<FtpTestProtocol, number> = {
  ramp: 0.75,
  twenty_min: 0.95,
  all_out: 1.0,
};

/** 각 프로토콜이 요구하는 입력 파워의 의미(키). UI 라벨은 i18n. */
export const FTP_TEST_INPUT_KEY: Record<FtpTestProtocol, string> = {
  ramp: "lastMinuteMap",
  twenty_min: "avg20min",
  all_out: "avg60min",
};

/**
 * 프로토콜 + 입력 파워로 FTP 후보값을 산출한다.
 * @returns 반올림된 FTP 후보 W. 입력이 유효하지 않으면 null.
 */
export function estimateFtpFromTest(protocol: FtpTestProtocol, inputPowerW: number): number | null {
  const factor = FTP_TEST_FACTORS[protocol];
  if (factor == null) return null;
  if (!isPositiveFinite(inputPowerW)) return null;
  return Math.round(inputPowerW * factor);
}

/**
 * 보수적 갱신 규칙 — "이전보다 낮으면 신중 반영".
 * 후보가 현재 FTP보다 **낮으면** true(=사용자 명시 확인 필요). 같거나 높으면 false(바로 반영 가능).
 * 현재 FTP가 없으면(최초 설정) false.
 */
export function isConservativeDrop(currentFtp: number | null | undefined, candidate: number): boolean {
  if (!isPositiveFinite(currentFtp)) return false;
  if (!isPositiveFinite(candidate)) return false;
  return candidate < currentFtp;
}
