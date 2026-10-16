import { describe, expect, it } from "vitest";
import type { UserFitness } from "@shared/types";
import { selectStoredDashboardFitness } from "./storedDashboardFitness";

const value = {state: "final", processingState: "processed", totalCTL: 60, totalATL: 70, totalTSB: -10,
  breakdown: {bike: {ctl: 50, atl: 55, tsb: -5}, run: {ctl: 10, atl: 15, tsb: -5}}} as unknown as UserFitness;

describe("저장된 현재 Fitness 소비", () => {
  it("통합·종목 값은 같은 서버 스냅샷을 사용한다", () => {
    expect(selectStoredDashboardFitness(value, "tri")).toEqual({ctl: 60, atl: 70, tsb: -10});
    expect(selectStoredDashboardFitness(value, "bike")).toEqual({ctl: 50, atl: 55, tsb: -5});
  });
  it.each([null, {...value, state: "partial"}, {...value, processingState: "pending"}, {...value, processingState: "failed"}, {...value, totalCTL: NaN}])("미확정 입력을 피드 기반 값이나 0으로 대신하지 않는다", input => {
    expect(selectStoredDashboardFitness(input as UserFitness | null, "tri")).toBeNull();
  });
  it("다른 종목이 미완료여도 확정된 선택 종목은 보존한다", () => {
    const partial = {...value, state: "pending", processingState: "pending", disciplineStates: {bike: "final", run: "pending"}} as UserFitness;
    expect(selectStoredDashboardFitness(partial, "bike")).toEqual({ctl: 50, atl: 55, tsb: -5});
    expect(selectStoredDashboardFitness(partial, "run")).toBeNull();
    expect(selectStoredDashboardFitness(partial, "tri")).toBeNull();
  });
  it("종목 누락은 통합 값으로 대체하지 않고 확정 0은 보존한다", () => {
    expect(selectStoredDashboardFitness(value, "swim")).toBeNull();
    expect(selectStoredDashboardFitness({...value, totalCTL: 0, totalATL: 0, totalTSB: 0}, "tri")).toEqual({ctl: 0, atl: 0, tsb: 0});
  });
});
