import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import ActivityAnalysisSurface from "./ActivityAnalysisSurface";
const props = vi.hoisted(()=>({evidence:vi.fn(),analysis:vi.fn()}));
vi.mock("../../hooks/useActivityAnalysisModel",()=>({useActivityAnalysisModel:()=>({
  activity:{id:"public"},isActivityOwner:false,loadingActivity:false,activityProcessing:false,
  loadingStreams:false,showStreamSpinner:false,overview:{response:{status:"available"}},
  analysisTabProps:{activityId:"public",isOwner:false,canonicalPresentationAvailable:true},
  retryActivity:vi.fn(),retryStreams:vi.fn(),
})}));
vi.mock("../../features/activity/detail/ActivityOverviewEvidence",()=>({default:(value:unknown)=>{props.evidence(value);return <div data-testid="evidence"/>;}}));
vi.mock("../../components/AnalysisTab",()=>({default:(value:unknown)=>{props.analysis(value);return <div data-testid="analysis"/>;}}));
it("public embed forwards canonical presentation and viewer ownership",()=>{
  render(<ActivityAnalysisSurface activityId="public" retryKey={0} onReady={vi.fn()} onError={vi.fn()}/>);
  expect(screen.getByTestId("analysis")).toBeInTheDocument();
  expect(props.evidence).toHaveBeenCalledWith(expect.objectContaining({isOwner:false}));
  expect(props.analysis).toHaveBeenCalledWith(expect.objectContaining({isOwner:false,canonicalPresentationAvailable:true}));
});
