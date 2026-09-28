import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityStreams } from "@shared/types";
import { mockDocData, setDocData } from "../__tests__/mocks/firebase";
import { resetCanonicalRolloutCacheForTests } from "../services/canonicalRollout";
import { resetRuntimeConfigForTests } from "../services/runtimeConfig";
import AnalysisTab from "./AnalysisTab";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../contexts/ThemeContext";
import { OriderThemeProvider } from "../theme";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../contexts/LocaleContext", () => ({ useLocale: () => ({ locale: "ko", units: "metric" }) }));

beforeEach(() => {
  mockDocData.clear();
  resetCanonicalRolloutCacheForTests();
  resetRuntimeConfigForTests();
});
afterEach(cleanup);

function metrics(fields: Record<string, unknown>) {
  return {
    version: 33, discipline: "run", durationSec: 300, movingTimeSec: 300,
    distanceKm: 0, avgSpeedKph: 20, maxSpeedKph: 20,
    avgPower: null, np: null, avgHr: 150, maxHr: 155,
    powerZoneSec: [], hrZoneSec: [], mmp: {}, splits: [], runMetrics: {},
    ...fields,
  };
}

async function show(fields: Record<string, unknown>, isOwner: boolean, recordedDistance?: number) {
  const id = "distance-evidence";
  setDocData(`${isOwner ? "activity_metrics" : "activity_metrics_public"}/${id}`, metrics(fields));
  render(<MemoryRouter><ThemeProvider><OriderThemeProvider><AnalysisTab activityId={id} sport="run" isOwner={isOwner}
    streams={{ time: [], distance: [] } as unknown as ActivityStreams}
    summary={recordedDistance === undefined ? undefined : { distance: recordedDistance } as never} /></OriderThemeProvider></ThemeProvider></MemoryRouter>);
  const label = await screen.findByText("analysis.metric.distance");
  const card = label.parentElement!.parentElement!;
  await waitFor(() => expect(screen.queryByText("analysis.state.loadingTitle")).not.toBeInTheDocument());
  return within(card);
}

describe("서버 거리 근거의 실제 구독과 화면", () => {
  it.each([true, false])("전체 결측 숫자 호환값을 0km로 표시하지 않는다 owner=%s", async (isOwner) => {
    const card = await show({ distanceSource: null }, isOwner, 1000);
    expect(card.getByText("—")).toBeInTheDocument();
    expect(card.queryByText("0.00")).not.toBeInTheDocument();
    expect(screen.getByText("150")).toBeInTheDocument();
  });
  it.each(["recorded_summary", "stream_counter"])("관측한 0km는 유지한다 source=%s", async (distanceSource) => {
    const card = await show({ distanceSource }, true);
    expect(card.getByText("0.00")).toBeInTheDocument();
  });
  it("공개 변환에서 잘못된 출처를 지우고 이전 숫자로 승격하지 않는다", async () => {
    const card = await show({ version: 31, distanceKm: 8, distanceSource: "unverified" }, false);
    expect(card.getByText("—")).toBeInTheDocument();
  });
  it("새 계산기 결과에서 출처가 빠졌으면 양수도 확정하지 않는다", async () => {
    const card = await show({ distanceKm: 8 }, true);
    expect(card.getByText("—")).toBeInTheDocument();
  });
  it("이전 형식의 양수 거리는 보존한다", async () => {
    const card = await show({ version: 32, distanceKm: 8 }, false);
    expect(card.getByText("8.00")).toBeInTheDocument();
  });
  it.each([true, false])("실제 dev32 출처필드 없는 양수 producer는 보존한다 owner=%s", async isOwner => {
    // dev75c7 실제 계산기 fixture: version32/distanceKm1/durationSec300, distanceSource 없음.
    const card = await show({version: 32, distanceKm: 1}, isOwner);
    expect(card.getByText("1.00")).toBeInTheDocument();
  });
  it("dev32 저장 요약으로 증명한0과 feature32 명시출처0을 보존한다", async () => {
    const card = await show({version: 32}, true, 0);
    expect(card.getByText("0.00")).toBeInTheDocument();
    cleanup();
    const proof = await show({version: 32, distanceSource: "stream_counter"}, false);
    expect(proof.getByText("0.00")).toBeInTheDocument();
  });
  it.each([true, false])("dev32 명시null출처는 이전 양수fallback으로 승격하지 않는다 owner=%s", async isOwner => {
    const card = await show({version: 32, distanceKm: 1, distanceSource: null}, isOwner);
    expect(card.getByText("—")).toBeInTheDocument();
  });
  it("이전 형식의 근거 없는 0km는 숨긴다", async () => {
    const card = await show({ version: 31 }, true);
    expect(card.getByText("—")).toBeInTheDocument();
  });
  it("이전 형식의 저장 요약도 0km이면 실제 0을 유지한다", async () => {
    const card = await show({ version: 31 }, true, 0);
    expect(card.getByText("0.00")).toBeInTheDocument();
  });
});
