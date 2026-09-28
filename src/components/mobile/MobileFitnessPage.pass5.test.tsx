import { screen } from "@testing-library/react";
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
  expect(screen.getByText(/이번 주 100/)).toBeInTheDocument();
});
it("uses this week's uncertainty separately from known load in the 42-day average",()=>{
  const data = {ctl:0,atl:0,tsb:0,pmcHistory:[],weeklyTSS:[100,0,0,0],thisWeekTSS:0,avgWeekTSS:50,restDays:0,
    loadUnknownCount:1,thisWeekUnknownCount:1,hasKnownWeeklyLoad:true,hasKnownThisWeekLoad:false,
    threshold:null,hasLoadData:false,combinedLoad:null,loadFocus:null,cyclingAbility:null,
    runEvidence:{thresholdPaceSec:null,records:[]},
    swimEvidence:{windowDays:90,cssSecPer100m:null,swolfAvg:null,distancePerStrokeM:null,activityCount:0},
    zones:[],zoneSource:"none",discipline:"bike"} satisfies MobileFitnessData;
  renderWithProviders(<MobileFitnessPage data={data} embedded/>);
  expect(screen.getByText(/이번 주 –.*평균 50/)).toBeInTheDocument();
  expect(screen.queryByText(/이번 주 0/)).not.toBeInTheDocument();
});
