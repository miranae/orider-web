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
export function checkpointDistanceValue(distanceKm?: number): string {
  return distanceKm === undefined ? "" : String(Number(distanceKm.toFixed(2)));
}
