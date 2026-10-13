import type { StageRaceEstimateResponse } from "@shared/types/running-race-estimates-stage";
import wire from "./runningRaceEstimatesStage.wire.fixture.json";
/** 실제 컴파일된 서버 callable과 합성 저장소만 사용한 직렬화 응답이다. 운영/계정 데이터가 아니다. */
export function racePreviewFixture(label: "manual_positive_preview" | "excluded_unavailable_preview" = "manual_positive_preview"): Extract<StageRaceEstimateResponse, { mode: "preview" }> {
  return structuredClone(wire.cases.find(scenario => scenario.label === label)!.response) as unknown as Extract<StageRaceEstimateResponse, { mode: "preview" }>;
}
