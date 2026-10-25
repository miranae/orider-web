import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import SegmentLocalLegendProgress from "./SegmentLocalLegendProgress";
const mocks=vi.hoisted(()=>{const user={uid:"viewer",isAnonymous:false};return{load:vi.fn(),user,services:{auth:{currentUser:user}}};});
vi.mock("../../contexts/AuthContext",async original=>({...await original<typeof import("../../contexts/AuthContext")>(),useAuth:()=>({user:mocks.user})}));
vi.mock("../../contexts/FirebaseServicesContext",async original=>({...await original<typeof import("../../contexts/FirebaseServicesContext")>(),useFirebaseServices:()=>mocks.services}));
vi.mock("../../services/localTrainingEmulator",()=>({localTrainingEmulatorAvailable:()=>true}));
vi.mock("../../services/segmentLocalLegendProgress",()=>({loadLegendProgress:(...args:unknown[])=>mocks.load(...args)}));
const base={runId:"run",version:1,state:"census",expiresAt:Date.now()+300000,steps:1,result:null,finalAsOf:null};
const complete={...base,state:"complete",version:3,finalAsOf:Date.now(),result:{scannedCount:1001,totalEfforts:1001,riderCount:1,leader:{nickname:"라이더 A",effortCount:1001}}};
beforeEach(()=>{mocks.load.mockReset();mocks.services.auth.currentUser=mocks.user;Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"});});
it("finishes a prepared census with one explicit action and hides the leader on backgrounding",async()=>{
 mocks.load.mockResolvedValueOnce(base).mockResolvedValueOnce({...base,state:"ready",version:2}).mockResolvedValueOnce(complete);
 renderWithProviders(<SegmentLocalLegendProgress segmentId="s"/>);
 fireEvent.click(screen.getByRole("button",{name:"더 많은 기록 확인"}));
 await screen.findByText(/라이더 A/);
 expect(mocks.load.mock.calls.map(c=>c[2].action)).toEqual(["start","advance","finalize"]);
 act(()=>{Object.defineProperty(document,"visibilityState",{configurable:true,value:"hidden"});document.dispatchEvent(new Event("visibilitychange"));});
 expect(screen.queryByText(/라이더 A/)).not.toBeInTheDocument();
});
it("recovers an ambiguous advance through status before continuing, without retrying automatically",async()=>{
 mocks.load.mockResolvedValueOnce(base).mockRejectedValueOnce(Error("network"));
 renderWithProviders(<SegmentLocalLegendProgress segmentId="s"/>);
 fireEvent.click(screen.getByRole("button",{name:"더 많은 기록 확인"}));await screen.findByRole("alert");expect(mocks.load).toHaveBeenCalledTimes(2);
 mocks.load.mockResolvedValueOnce({...base,state:"ready",version:2}).mockResolvedValueOnce(complete);
 fireEvent.click(screen.getByRole("button",{name:"상태 확인하고 계속"}));await screen.findByText(/라이더 A/);
 expect(mocks.load.mock.calls.map(c=>c[2].action)).toEqual(["start","advance","status","finalize"]);
});
it("stop drops the in-flight result and prevents another dispatch",async()=>{
 let resolve!:(v:unknown)=>void;mocks.load.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 renderWithProviders(<SegmentLocalLegendProgress segmentId="s"/>);
 fireEvent.click(screen.getByRole("button",{name:"더 많은 기록 확인"}));
 fireEvent.click(screen.getByRole("button",{name:"중단하고 결과 지우기"}));
 await act(async()=>resolve(complete));
 expect(screen.queryByText(/라이더 A/)).not.toBeInTheDocument();expect(mocks.load).toHaveBeenCalledTimes(1);
 await waitFor(()=>expect(screen.getByRole("button",{name:"더 많은 기록 확인"})).toBeEnabled());
});
it("never accepts a response from a replaced SDK user",async()=>{
 mocks.load.mockImplementation(async()=>{mocks.services.auth.currentUser={...mocks.user};return complete;});
 renderWithProviders(<SegmentLocalLegendProgress segmentId="s"/>);
 fireEvent.click(screen.getByRole("button",{name:"더 많은 기록 확인"}));
 await waitFor(()=>expect(mocks.load).toHaveBeenCalledTimes(1));expect(screen.queryByText(/라이더 A/)).not.toBeInTheDocument();
});
it("clears a rendered result on same-UID SDK replacement and on focus",async()=>{
 mocks.load.mockResolvedValueOnce(complete);
 const view=renderWithProviders(<SegmentLocalLegendProgress segmentId="s"/>);
 fireEvent.click(screen.getByRole("button",{name:"더 많은 기록 확인"}));await screen.findByText(/라이더 A/);
 act(()=>window.dispatchEvent(new Event("focus")));expect(screen.queryByText(/라이더 A/)).not.toBeInTheDocument();
 mocks.load.mockResolvedValueOnce({...base,state:"ready"}).mockResolvedValueOnce(complete);
 fireEvent.click(screen.getByRole("button",{name:"상태 확인하고 계속"}));await screen.findByText(/라이더 A/);
 mocks.services.auth.currentUser={...mocks.user};view.rerender(<SegmentLocalLegendProgress segmentId="s"/>);
 expect(screen.queryByText(/라이더 A/)).not.toBeInTheDocument();
});
