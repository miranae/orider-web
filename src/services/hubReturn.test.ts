import { beforeEach, expect, it } from "vitest";
import { hubReturnTarget, isHubReturnState, rememberHubLocation, resetHubLocationsForTest } from "./hubReturn";

beforeEach(resetHubLocationsForTest);

it("허브마다 마지막 화면(쿼리 포함)을 기억하고 상세 화면은 건너뛴다", () => {
  rememberHubLocation("u1", "/coach/analysis", "?sport=tri");
  rememberHubLocation("u1", "/explore/segments", "");
  rememberHubLocation("u1", "/course/c1", "", { fromHub: "explore" });
  expect(hubReturnTarget("coach", "/coach/condition")).toBe("/coach/analysis?sport=tri");
  expect(hubReturnTarget("explore", "/explore/courses")).toBe("/explore/segments");
  expect(hubReturnTarget("club", "/clubs")).toBe("/clubs");
});

it("계정이 바뀌면 이전 계정의 화면을 버린다", () => {
  rememberHubLocation("u1", "/coach/plan", "");
  rememberHubLocation("u2", "/", "");
  expect(hubReturnTarget("coach", "/coach/condition")).toBe("/coach/condition");
});

it("탭 복귀 state 만 인식한다", () => {
  expect(isHubReturnState({ hubReturn: true })).toBe(true);
  expect(isHubReturnState({ fromHub: "home" })).toBe(false);
  expect(isHubReturnState(null)).toBe(false);
});
