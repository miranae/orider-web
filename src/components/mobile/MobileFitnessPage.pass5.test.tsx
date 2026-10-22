import { fireEvent, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import MobileFitnessPage, { type MobileFitnessData } from "./MobileFitnessPage";
vi.mock("./SportPerformanceCard",()=>({default:()=>null}));
it("renders real translated partial caption and retained healthy weekly load",()=>{
  const data = {ctl:0,atl:0,tsb:0,pmcHistory:[],weeklyTSS:[0,0,0,100],thisWeekTSS:100,avgWeekTSS:100,restDays:0,
    loadUnknownCount:1,hasKnownWeeklyLoad:true,threshold:null,hasLoadData:false,combinedLoad:null,loadFocus:null,
    cyclingAbility:null,runEvidence:{thresholdPaceSec:null,records:[]},
    swimEvidence:{windowDays:90,cssSecPer100m:null,swolfAvg:null,distancePerStrokeM:null,activityCount:0},
    zones:[],zoneSource:"none",discipline:"bike"} satisfies MobileFitnessData;
  renderWithProviders(<MobileFitnessPage data={data} embedded/>);
  expect(screen.getByText("부하 미확인 1건 · 확인된 값만 합산")).toBeInTheDocument();
  expect(screen.queryByText("log.loadPartial")).not.toBeInTheDocument();
  expect(screen.getByText(/최근 7일 100/)).toBeInTheDocument();
});
it("uses this week's uncertainty separately from known load in the 42-day average",()=>{
  const data = {ctl:0,atl:0,tsb:0,pmcHistory:[],weeklyTSS:[100,0,0,0],thisWeekTSS:0,avgWeekTSS:50,restDays:0,
    loadUnknownCount:1,thisWeekUnknownCount:1,hasKnownWeeklyLoad:true,hasKnownThisWeekLoad:false,
    threshold:null,hasLoadData:false,combinedLoad:null,loadFocus:null,cyclingAbility:null,
    runEvidence:{thresholdPaceSec:null,records:[]},
    swimEvidence:{windowDays:90,cssSecPer100m:null,swolfAvg:null,distancePerStrokeM:null,activityCount:0},
    zones:[],zoneSource:"none",discipline:"bike"} satisfies MobileFitnessData;
  renderWithProviders(<MobileFitnessPage data={data} embedded/>);
  expect(screen.getByText(/최근 7일 –.*평균 50/)).toBeInTheDocument();
  expect(screen.queryByText(/최근 7일 0/)).not.toBeInTheDocument();
});


const weeklyFixture: MobileFitnessData = {
  ctl: 0, atl: 0, tsb: 0, pmcHistory: [], weeklyTSS: [], thisWeekTSS: null, avgWeekTSS: null, restDays: null,
  threshold: null, hasLoadData: false, combinedLoad: null, loadFocus: null, cyclingAbility: null,
  runEvidence: { thresholdPaceSec: null, records: [] },
  swimEvidence: { windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 },
  zones: [], zoneSource: "none", discipline: "run",
};

it("keeps all four weekly values and periods visible without interactive hover readouts", () => {
  renderWithProviders(<MobileFitnessPage data={{ ...weeklyFixture, weeklyTSS: [null, 0, 50, 100], hasKnownWeeklyLoad: true, loadUnknownCount: 1, weeklyLoadPartial: true }} part="condition" embedded />);
  const card = screen.getByTestId("K1-7-2");
  const list = within(card).getByRole("list");
  const items = within(list).getAllByRole("listitem");
  expect(items).toHaveLength(4);
  expect(items[0]).toHaveTextContent("–");
  expect(items[1]).toHaveTextContent("0");
  expect(items[2]).toHaveTextContent("50");
  expect(items[3]).toHaveTextContent("100");
  for (const label of ["21–27일 전", "14–20일 전", "7–13일 전", "0–6일 전"]) expect(within(list).getByText(label)).toBeVisible();
  expect(within(list).queryByRole("button")).not.toBeInTheDocument();
  const textBefore = card.textContent;
  const descendantsBefore = card.querySelectorAll("*").length;
  fireEvent.pointerEnter(items[2]!);
  fireEvent.focus(items[2]!);
  fireEvent.click(items[2]!);
  fireEvent.pointerLeave(items[2]!);
  expect(card.textContent).toBe(textBefore);
  expect(card.querySelectorAll("*")).toHaveLength(descendantsBefore);
  expect(within(card).queryByRole("status")).not.toBeInTheDocument();
  expect(within(card).queryByRole("tooltip")).not.toBeInTheDocument();
  expect(within(card).getByText("부하 미확인 1건 · 확인된 값만 합산").tagName).toBe("P");
});

it("shows four compact unknown periods without an empty plot or replacing them with confirmed zero", () => {
  renderWithProviders(<MobileFitnessPage data={{ ...weeklyFixture, weeklyTSS: [null, null, null, null], hasKnownWeeklyLoad: false, loadUnknownCount: 4, weeklyLoadPartial: true }} part="condition" embedded />);
  const list = within(screen.getByTestId("K1-7-2")).getByRole("list");
  expect(within(list).getAllByText("–")).toHaveLength(4);
  expect(within(list).queryByText("0")).not.toBeInTheDocument();
  expect(list.querySelector('[aria-hidden="true"]')).toBeNull();
  expect(within(list).getAllByRole("listitem")).toHaveLength(4);
});

it("keeps the stored summary separate from four weekly windows", () => {
  renderWithProviders(<MobileFitnessPage data={{ ...weeklyFixture, weeklyTSS: [0, 0, 0, 0], weeklyLoadStoredSummary: true }} part="condition" embedded />);
  expect(within(screen.getByTestId("K1-7-2")).queryByRole("list")).not.toBeInTheDocument();
});


it("summarizes wholly missing web weeks without a blank plot and retains confirmed zero", () => {
  const view = renderWithProviders(<MobileFitnessPage data={{ ...weeklyFixture, weeklyTSS: [null, null, null, null], weeklyLoadPartial: true }} part="condition" />);
  expect(screen.getByText("주별 비교에 필요한 일별 부하 근거가 부족해요.")).toBeVisible();
  expect(within(screen.getByTestId("K1-7-2")).queryByRole("list")).not.toBeInTheDocument();
  view.rerender(<MobileFitnessPage data={{ ...weeklyFixture, weeklyTSS: [null, 0, null, null], weeklyLoadPartial: true }} part="condition" />);
  expect(within(screen.getByTestId("K1-7-2")).getByRole("list")).toHaveTextContent("0");
  expect(screen.queryByText("주별 비교에 필요한 일별 부하 근거가 부족해요.")).not.toBeInTheDocument();
});
