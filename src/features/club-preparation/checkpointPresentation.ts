import { mt } from "./meetingText";
/** GPX 유형 코드의 표시 이름. 저장된 코드와 사용자가 쓴 자유형은 변경하지 않는다. */
const TYPE_LABELS: Record<string, string> = {
  GENERIC: "일반 경유지",
  FOOD: "음식·보급",
  AID: "보급",
  WATER: "물 보급",
  REST: "휴식",
  CAFE: "카페",
  RESTAURANT: "식당",
  CONVENIENCE: "편의점",
  STORE: "상점",
  SHOP: "상점",
  MART: "마트",
  TOILET: "화장실",
  KOM: "오르막",
  SUMMIT: "정상",
  CLIMB: "오르막",
  CUT: "제한 시간",
  CUTOFF: "제한 시간",
  TIMECUT: "제한 시간",
  START: "출발",
  FINISH: "도착",
};
export function checkpointTypeLabel(type?: string): string {
  return type ? mt(TYPE_LABELS[type.trim().toUpperCase()] ?? type) : "";
}
// 화면에 보이는 숫자는 소수점 한 자리까지만 쓴다(끝자리 0 은 뺀다).
const decimalFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, useGrouping: false });
export function oneDecimal(value: number): number {
  return Number.isFinite(value) ? Number(decimalFormatter.format(value)) : value;
}
export function checkpointDistanceValue(distanceKm?: number): string {
  return distanceKm === undefined ? "" : String(oneDecimal(distanceKm));
}
