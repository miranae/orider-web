import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ActivityReanalysisControl } from "./ActivityReanalysisControl";
const m=vi.hoisted(()=>({load:vi.fn(),request:vi.fn(),history:vi.fn(),sdk:{auth:{currentUser:{uid:"owner",isAnonymous:false}}}}));
vi.mock("../../../contexts/FirebaseServicesContext",()=>({useFirebaseServices:()=>m.sdk}));
vi.mock("../../../services/activityReanalysis",()=>({createActivityReanalysisClient:()=>({load:m.load,request:m.request,history:m.history})}));
const hash="a".repeat(64);
beforeEach(()=>{vi.clearAllMocks();m.load.mockResolvedValue({activityId:"a",metricsRevision:hash,calculatorVersion:1,latestCalculatorVersion:2,canReanalyze:true,pending:false,lastRequest:null});m.request.mockResolvedValue({status:"queued"});});
it("requires an explicit request and retries the same id without clearing saved results",async()=>{
 const select=vi.fn();m.request.mockRejectedValueOnce(Error("network"));render(<ActivityReanalysisControl activityId="a" onSelect={select}/>);
 expect(m.request).not.toHaveBeenCalled();fireEvent.click(screen.getByText("분석 상태 확인"));
 fireEvent.click(await screen.findByText("새 버전으로 다시 분석"));await screen.findByRole("alert");
 fireEvent.click(screen.getByText("새 버전으로 다시 분석"));await screen.findByRole("status");
 expect(m.request.mock.calls[0]).toEqual(m.request.mock.calls[1]);expect(select).not.toHaveBeenCalled();
});
it("loads a selected snapshot and passes actual stored metrics to the detail consumer",async()=>{
 const selected={revisionId:hash,metrics:{version:1,np:186.835}};const select=vi.fn();
 m.history.mockResolvedValueOnce({items:[{revisionId:hash,calculatorVersion:1,calculatedAt:null}],nextCursor:null,selected:null}).mockResolvedValueOnce({items:[],nextCursor:null,selected});
 render(<ActivityReanalysisControl activityId="a" onSelect={select}/>);fireEvent.click(screen.getByText("이전 분석 보기"));fireEvent.click(await screen.findByText("버전 1 · —"));
 await waitFor(()=>expect(select).toHaveBeenCalledWith(selected));
});
it("drops late history after exact SDK account replacement",async()=>{
 let done!:(v:unknown)=>void;m.history.mockReturnValue(new Promise(r=>{done=r;}));const select=vi.fn();
 const view=render(<ActivityReanalysisControl activityId="a" onSelect={select}/>);fireEvent.click(screen.getByText("이전 분석 보기"));m.sdk.auth.currentUser={uid:"owner",isAnonymous:false};view.rerender(<ActivityReanalysisControl activityId="a" onSelect={select}/>);
 await act(async()=>done({items:[{revisionId:hash,calculatorVersion:1,calculatedAt:null}],nextCursor:null,selected:null}));expect(screen.queryByText("버전 1 · —")).not.toBeInTheDocument();expect(select).not.toHaveBeenCalled();
});

it("allows a new explicit request after a completed request when new analysis is available", async () => {
 const state={activityId:"a",metricsRevision:hash,calculatorVersion:1,latestCalculatorVersion:2,canReanalyze:true,pending:false,lastRequest:null};
 m.load.mockResolvedValueOnce(state).mockResolvedValueOnce({...state,metricsRevision:"b".repeat(64),lastRequest:{requestId:"previous",status:"completed",previousRevision:hash}});
 m.request.mockResolvedValue({status:"completed"});render(<ActivityReanalysisControl activityId="a" onSelect={vi.fn()}/>);
 fireEvent.click(screen.getByText("분석 상태 확인"));fireEvent.click(await screen.findByText("새 버전으로 다시 분석"));await screen.findByText("새 분석이 완료되었습니다.");
 fireEvent.click(screen.getByText("분석 상태 확인"));fireEvent.click(await screen.findByText("새 버전으로 다시 분석"));await waitFor(()=>expect(m.request).toHaveBeenCalledTimes(2));
 expect(m.request.mock.calls[0]![1]).not.toBe(m.request.mock.calls[1]![1]);expect(m.request.mock.calls[1]![2]).toBe("b".repeat(64));
});

it("offers visitor history/current selection without status or reanalysis requests",async()=>{
 const select=vi.fn(),saved={revisionId:hash,metrics:{version:1,np:100}};
 m.history.mockResolvedValueOnce({items:[{revisionId:hash,calculatorVersion:1,calculatedAt:null}],nextCursor:null,selected:null}).mockResolvedValueOnce({items:[],nextCursor:null,selected:saved});
 render(<ActivityReanalysisControl activityId="a" canReanalyze={false} onSelect={select}/>);
 expect(screen.queryByText("분석 상태 확인")).not.toBeInTheDocument();
 fireEvent.click(screen.getByText("이전 분석 보기"));fireEvent.click(await screen.findByText("버전 1 · —"));
 await waitFor(()=>expect(select).toHaveBeenCalledWith(saved));expect(m.load).not.toHaveBeenCalled();expect(m.request).not.toHaveBeenCalled();
});
it("clears a selected snapshot on explicit history access denial",async()=>{
 const select=vi.fn(),revoked=vi.fn();m.history.mockRejectedValue({code:"permission-denied"});
 render(<ActivityReanalysisControl activityId="a" canReanalyze={false} selectedRevision={hash} onSelect={select} onAccessRevoked={revoked}/>);
 fireEvent.click(screen.getByText("이전 분석 보기"));await waitFor(()=>expect(select).toHaveBeenCalledWith(null));expect(revoked).toHaveBeenCalledTimes(1);
});
