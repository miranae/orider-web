import {act,renderHook} from "@testing-library/react";
import {useBikePeriodSnapshot} from "./useBikePeriodSnapshot";
const mocks=vi.hoisted(()=>({services:{auth:{currentUser:{uid:"owner",isAnonymous:false}}},load:vi.fn(),history:vi.fn()}));
vi.mock("../contexts/FirebaseServicesContext",()=>({useFirebaseServices:()=>mocks.services}));
vi.mock("../contexts/AuthContext",()=>({useAuth:()=>({user:mocks.services.auth.currentUser})}));
vi.mock("firebase/auth",()=>({onAuthStateChanged:()=>vi.fn()}));
vi.mock("../services/bikePeriodSnapshot",()=>({loadBikeSnapshot:mocks.load,loadBikeSnapshotHistory:mocks.history}));
const period={fromInclusive:1,toExclusive:100};
const page=()=>({runId:"run",version:0,state:"scanning",expiresAt:Date.now()+3000000,result:null,zoneGroups:[],nextZone:null});
beforeEach(()=>{mocks.load.mockReset();mocks.history.mockReset();mocks.services.auth.currentUser={uid:"owner",isAnonymous:false};Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"});});
it("runs sequentially to completion without exposing an aggregate between steps",async()=>{
 let calls=0,flight=0,max=0;mocks.load.mockImplementation(async()=>{max=Math.max(max,++flight);await Promise.resolve();flight--;return{...page(),version:++calls,state:calls===254?"complete":"scanning",result:calls===254?{total:1001}:null};});
 const h=renderHook(()=>useBikePeriodSnapshot("owner",period));await act(async()=>h.result.current.start());expect(calls).toBe(254);expect(max).toBe(1);expect(h.result.current.data?.result).toEqual({total:1001});expect(mocks.load.mock.calls[253][2].expectedVersion).toBe(253);
});
it("recovers an uncertain request using status and never automatically retries errors",async()=>{
 mocks.load.mockResolvedValueOnce(page()).mockRejectedValueOnce(Error("network"));const h=renderHook(()=>useBikePeriodSnapshot("owner",period));await act(async()=>h.result.current.start());expect(h.result.current.error).toBe(true);expect(mocks.load).toHaveBeenCalledTimes(2);
 mocks.load.mockResolvedValueOnce({...page(),version:5}).mockResolvedValueOnce({...page(),version:6,state:"complete",result:{total:1001}});await act(async()=>h.result.current.resume());expect(mocks.load.mock.calls[2][2].action).toBe("status");expect(mocks.load.mock.calls[3][2].expectedVersion).toBe(5);
});
it("stop and same-UID session replacement discard late aggregates",async()=>{
 let resolve!:(x:unknown)=>void;mocks.load.mockImplementation(()=>new Promise(r=>{resolve=r;}));const h=renderHook(()=>useBikePeriodSnapshot("owner",period));let pending!:Promise<void>;act(()=>{pending=h.result.current.start();});act(()=>h.result.current.stop());await act(async()=>{resolve({...page(),state:"complete",result:{total:1}});await pending;});expect(h.result.current.data).toBeNull();expect(mocks.load).toHaveBeenCalledTimes(1);
 act(()=>{pending=h.result.current.start();});mocks.services.auth.currentUser={uid:"owner",isAnonymous:false};h.rerender();await act(async()=>{resolve({...page(),state:"complete",result:{total:1}});await pending;});expect(h.result.current.data).toBeNull();
});
it("clears sensitive values while hidden and uses status on explicit return",async()=>{
 mocks.load.mockResolvedValue({...page(),state:"complete",result:{total:1001}});const h=renderHook(()=>useBikePeriodSnapshot("owner",period));await act(async()=>h.result.current.start());
 act(()=>{Object.defineProperty(document,"visibilityState",{configurable:true,value:"hidden"});document.dispatchEvent(new Event("visibilitychange"));});expect(h.result.current.data?.result).toBeNull();Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"});await act(async()=>h.result.current.resume());expect(mocks.load.mock.calls[1][2].action).toBe("status");expect(h.result.current.data?.result).not.toBeNull();
});
it("pages zone contexts using the returned cursor only after completion",async()=>{
 mocks.load.mockResolvedValueOnce({...page(),state:"complete",result:{total:1}}).mockResolvedValueOnce({...page(),state:"complete",result:{total:1},nextZone:"next",zoneGroups:[{id:"first"}]}).mockResolvedValueOnce({...page(),state:"complete",result:{total:1},zoneGroups:[{id:"second"}]});const h=renderHook(()=>useBikePeriodSnapshot("owner",period));await act(async()=>h.result.current.start());await act(async()=>h.result.current.zones());await act(async()=>h.result.current.zones());expect(mocks.load.mock.calls[2][2]).toMatchObject({action:"zones",afterZone:"next"});expect(h.result.current.data?.zoneGroups).toEqual([{id:"second"}]);
});
it("keeps one request in flight after stop until its old await settles",async()=>{
 let respond!:(v:unknown)=>void;mocks.load.mockImplementation(()=>new Promise(resolve=>{respond=resolve;}));const h=renderHook(()=>useBikePeriodSnapshot("owner",period));let pending!:Promise<void>;act(()=>{pending=h.result.current.start();});act(()=>h.result.current.stop());await act(async()=>h.result.current.start());expect(mocks.load).toHaveBeenCalledOnce();await act(async()=>{respond(page());await pending;});expect(h.result.current.data).toBeNull();
});
it("masks completed data on focus and deduplicates visibility plus focus",async()=>{
 const complete={...page(),state:"complete",result:{total:1}};mocks.load.mockResolvedValueOnce(complete);const h=renderHook(()=>useBikePeriodSnapshot("owner",period));await act(async()=>h.result.current.start());act(()=>{Object.defineProperty(document,"visibilityState",{configurable:true,value:"hidden"});document.dispatchEvent(new Event("visibilitychange"));});
 let respond!:(v:unknown)=>void;mocks.load.mockImplementationOnce(()=>new Promise(resolve=>{respond=resolve;}));act(()=>{Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"});document.dispatchEvent(new Event("visibilitychange"));window.dispatchEvent(new Event("focus"));});expect(mocks.load).toHaveBeenCalledTimes(2);expect(h.result.current.data?.result).toBeNull();await act(async()=>respond(complete));expect(h.result.current.data?.result).not.toBeNull();
});
it("revoked access and oversized identity groups remove checkpoints without offering resume",async()=>{
 const h=renderHook(()=>useBikePeriodSnapshot("owner",period));mocks.load.mockResolvedValueOnce(page()).mockRejectedValueOnce({code:"functions/failed-precondition",details:{reason:"identity_component_too_large"}});await act(async()=>h.result.current.start());expect(h.result.current.data).toBeNull();expect(h.result.current.canResume).toBe(false);expect(h.result.current.errorKind).toBe("limit");
 mocks.load.mockResolvedValueOnce(page()).mockRejectedValueOnce({code:"functions/permission-denied"});await act(async()=>h.result.current.start());expect(h.result.current.data).toBeNull();expect(h.result.current.errorKind).toBe("invalidated");
});
it("preserves the completed snapshot and its original period while a new run waits or fails",async()=>{
 const complete={...page(),state:"complete",retention:"saved_result",period,asOf:123,result:{total:1001}};
 mocks.load.mockResolvedValueOnce(complete);const h=renderHook(()=>useBikePeriodSnapshot("owner",period));await act(async()=>h.result.current.start());
 let reject!:(e:unknown)=>void;mocks.load.mockImplementationOnce(()=>new Promise((_,no)=>{reject=no;}));let pending!:Promise<void>;
 act(()=>{pending=h.result.current.start();});expect(h.result.current.data).toMatchObject({period,asOf:123,result:{total:1001}});
 await act(async()=>{reject(Error("network"));await pending;});expect(h.result.current.data).toMatchObject({period,asOf:123,result:{total:1001}});
 mocks.services.auth.currentUser={uid:"owner",isAnonymous:false};h.rerender();expect(h.result.current.data).toBeNull();
});
it("retains saved results after checkpoint expiry and revision changes but clears on access revocation",async()=>{
 const complete={...page(),state:"complete",retention:"saved_result",expiresAt:Date.now()-1,result:{total:1001}};
 mocks.load.mockResolvedValueOnce(complete);const h=renderHook(()=>useBikePeriodSnapshot("owner",period));await act(async()=>h.result.current.start());
 mocks.load.mockResolvedValueOnce({...complete,currentWinnerRevisionChanged:true});await act(async()=>h.result.current.resume());
 expect(h.result.current.data).toMatchObject({result:{total:1001},currentWinnerRevisionChanged:true});
 mocks.load.mockRejectedValueOnce({code:"functions/permission-denied"});await act(async()=>h.result.current.resume());expect(h.result.current.data).toBeNull();
});
it("does not label an old period's result as a newly selected period",async()=>{
 mocks.load.mockResolvedValueOnce({...page(),state:"complete",retention:"saved_result",period,result:{total:1001}});
 const h=renderHook(p=>useBikePeriodSnapshot("owner",p),{initialProps:period});await act(async()=>h.result.current.start());
 h.rerender({fromInclusive:100,toExclusive:200});expect(h.result.current.data).toBeNull();
});
it("selects the previous completed run after a new success without replacing its as-of label",async()=>{
 const h=renderHook(()=>useBikePeriodSnapshot("owner",period));
 mocks.load.mockResolvedValueOnce({...page(),runId:"old",asOf:100,state:"complete",retention:"saved_result",period,result:{total:1}});await act(async()=>h.result.current.start());
 mocks.load.mockResolvedValueOnce({...page(),runId:"new",asOf:200,state:"complete",retention:"saved_result",period,result:{total:2}});await act(async()=>h.result.current.start());
 expect(h.result.current.data).toMatchObject({runId:"new",asOf:200,result:{total:2}});
 mocks.load.mockResolvedValueOnce({...page(),runId:"old",asOf:100,state:"complete",retention:"saved_result",period,result:{total:1}});
 await act(async()=>h.result.current.selectPrevious("old"));expect(h.result.current.data).toMatchObject({runId:"old",asOf:100,period,result:{total:1}});
 act(()=>h.result.current.selectPrevious(null));expect(h.result.current.data).toMatchObject({runId:"new",asOf:200,result:{total:2}});
});
it("lists and opens a saved run after remount without starting a calculation",async()=>{
 mocks.history.mockResolvedValue({items:[{runId:"archived",asOf:100,scanned:3,representatives:2}],nextCursor:null});
 mocks.load.mockResolvedValue({...page(),runId:"archived",asOf:100,state:"complete",retention:"saved_result",period,result:{total:8}});
 const h=renderHook(()=>useBikePeriodSnapshot("owner",period));expect(mocks.history).not.toHaveBeenCalled();
 await act(async()=>h.result.current.loadHistory());expect(h.result.current.history?.items[0]?.runId).toBe("archived");
 await act(async()=>h.result.current.openSaved("archived"));expect(mocks.load.mock.lastCall?.[2]).toEqual({action:"status",period,runId:"archived"});
 expect(h.result.current.data).toMatchObject({runId:"archived",asOf:100,result:{total:8}});
});
it("reads selected historical zones and focus validation against that run, not the latest run",async()=>{
 const old={...page(),runId:"old",asOf:100,state:"complete",retention:"saved_result",period,nextZone:"old-next",result:{total:1}};
 const latest={...old,runId:"new",asOf:200,nextZone:"new-next",result:{total:2}};
 const h=renderHook(()=>useBikePeriodSnapshot("owner",period));mocks.load.mockResolvedValueOnce(old);await act(async()=>h.result.current.start());mocks.load.mockResolvedValueOnce(latest);await act(async()=>h.result.current.start());
 mocks.load.mockResolvedValueOnce(old);await act(async()=>h.result.current.selectPrevious("old"));
 mocks.load.mockResolvedValueOnce({...old,zoneGroups:[{id:"old-zone"}]});await act(async()=>h.result.current.zones());
 expect(mocks.load.mock.lastCall?.[2]).toMatchObject({action:"zones",runId:"old",afterZone:"old-next"});
 mocks.load.mockResolvedValueOnce(old);await act(async()=>window.dispatchEvent(new Event("focus")));expect(mocks.load.mock.lastCall?.[2]).toMatchObject({action:"status",runId:"old"});
 mocks.load.mockResolvedValueOnce({...latest,runId:"third",asOf:300});await act(async()=>h.result.current.start());expect(h.result.current.selectedRun).toBeNull();expect(h.result.current.data?.runId).toBe("third");
});
