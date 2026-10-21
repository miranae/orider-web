// 수영 구현·저장 데이터는 유지하고 프론트 노출만 이 플래그로 제어한다.
export const SWIMMING_UI_ENABLED = false;

export function isSportUiEnabled(sport: string): boolean {
  return SWIMMING_UI_ENABLED || sport.toLowerCase() !== "swim";
}
