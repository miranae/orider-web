import { describe, expect, it } from "vitest";

import type { Activity } from "@shared/types";
import type { BikeProfile } from "../types/bikeProfile";

/**
 * 활동의 자전거 귀속 (#1943 §3, #1950).
 *
 * 화면이 자전거에 기대는 계산(가상 파워 등)은 **활동이 기록된 자전거**로만 해야 한다.
 * 지금 선택된 자전거로 대신 계산하면, 자전거를 바꾼 사용자의 옛 활동 파워가 조용히 달라진다 —
 * 그 라이드를 그 자전거로 탄 적이 없는데도.
 *
 * 이 판정은 `useActivityAnalysisModel` 안에 있지만, 규칙 자체는 여기서 고정한다.
 */
function bikeForActivity(activity: Pick<Activity, "bikeProfileId">, profiles: BikeProfile[]) {
  return activity.bikeProfileId
    ? (profiles.find((p) => p.id === activity.bikeProfileId) ?? null)
    : null;
}

function profile(id: string): BikeProfile {
  return {
    id,
    name: id,
    sensors: [],
    wheelCircumferenceMm: 2105,
    virtualPower: { enabled: true } as BikeProfile["virtualPower"],
    createdAt: 0,
    updatedAt: 0,
  } as BikeProfile;
}

describe("활동의 자전거 선택", () => {
  const profiles = [profile("road"), profile("gravel")];

  it("활동에 기록된 자전거를 쓴다", () => {
    expect(bikeForActivity({ bikeProfileId: "gravel" }, profiles)?.id).toBe("gravel");
  });

  /** 기능 이전 기록은 자전거를 모른다 — 추측한 계산보다 계산하지 않는 편이 정확하다. */
  it("모르면 아무 자전거도 쓰지 않는다", () => {
    expect(bikeForActivity({ bikeProfileId: null }, profiles)).toBeNull();
    expect(bikeForActivity({}, profiles)).toBeNull();
  });

  /** 삭제된 자전거를 가리키면 다른 자전거로 대신하지 않는다. */
  it("목록에 없는 자전거는 대체하지 않는다", () => {
    expect(bikeForActivity({ bikeProfileId: "deleted" }, profiles)).toBeNull();
  });
});
