import { afterEach, expect, it } from "vitest";
import type { User } from "firebase/auth";
import { activityMapWorldEndpoint } from "./activityMapSignalPool";
import { resetRuntimeConfigForTests } from "../../services/runtimeConfig";

const member = { uid: "member", isAnonymous: false } as User;

afterEach(() => resetRuntimeConfigForTests({}));

it("운영 설정을 물려받은 스테이지는 운영 월드 활동 지도 신호에 붙지 않는다(#1931)", () => {
  resetRuntimeConfigForTests({ firebaseProjectId: "miranae-orider-g1", worldActivityMapSignalsEnabled: true });
  expect(activityMapWorldEndpoint("miranae-orider-g1", member)).toBe("wss://world.orider.co.kr/activity-map-signals");
  for (const stage of [{ appEnvironment: "stage" }, { deploymentProfile: "production-parity-stage" }, { deploymentProfile: "bundled-development" }]) {
    resetRuntimeConfigForTests({ firebaseProjectId: "miranae-orider-g1", worldActivityMapSignalsEnabled: true, ...stage } as never);
    expect(activityMapWorldEndpoint("miranae-orider-g1", member)).toBeUndefined();
  }
});
