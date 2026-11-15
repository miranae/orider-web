import { FOCUS_TARGETS, thresholdSettingsHref } from "../../../services/focusTarget";

/**
 * 활동 종목에 맞는 기준값 칸 링크. 사이클은 FTP, 러닝은 역치 페이스, 수영은 CSS,
 * 그 밖의 종목은 종목 공통인 최대심박 칸으로 보낸다.
 */
export function activityThresholdHref(discipline: "bike" | "run" | "swim" | "other"): string {
  if (discipline === "run") return thresholdSettingsHref("run", FOCUS_TARGETS.thresholdPace);
  if (discipline === "swim") return thresholdSettingsHref("swim", FOCUS_TARGETS.css);
  if (discipline === "other") return thresholdSettingsHref("bike", FOCUS_TARGETS.maxHr);
  return thresholdSettingsHref("bike", FOCUS_TARGETS.ftp);
}
