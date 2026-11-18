import { beforeEach, expect, it, vi } from "vitest";
import type { FirebaseServices } from "../../contexts/FirebaseServicesContext";
const m = vi.hoisted(() => {
  const app = {name:"embedded-board"};
  return {app,user:{uid:"embedded-owner"},functions:{app,customDomain:"https://stage-parity-default-818364001341.asia-northeast3.run.app"},
    ready:vi.fn(),globalReady:vi.fn(),block:vi.fn(),log:vi.fn(),capture:vi.fn(),callable:vi.fn()};
});
vi.mock("../../contexts/AuthContext",()=>({useAuth:()=>({user:m.user})}));
vi.mock("../../contexts/FirebaseServicesContext",()=>({useFirebaseServices:()=>({})}));
vi.mock("../../services/firebase",()=>({auth:{currentUser:{uid:"global-user"}},functions:{app:{name:"global-app"}},ensureAppCheckReady:m.globalReady}));
vi.mock("../../services/sentry",()=>({captureError:m.capture}));
vi.mock("../../services/runtimeConfig",()=>({getRuntimeConfig:()=>({appEnvironment:"production"}),isStageComputeRuntime:()=>true,isEmulatorRuntime:()=>false}));
vi.mock("firebase/functions",()=>({getFunctions:vi.fn(),connectFunctionsEmulator:vi.fn(),httpsCallable:(client:unknown,name:string)=>{
  m.callable(client,name);return name==="setActivitySocialBlock"?m.block:m.log;
}}));
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();m.ready.mockResolvedValue(undefined);m.globalReady.mockRejectedValue(new Error("global Firebase not initialized"));m.log.mockResolvedValue({data:{}});});
it("records embedded block failures through the real injected logger without initializing the general web Firebase",async()=>{
  const {setBoardAuthorBlocked}=await import("./useBoardBlocks");
  const services={auth:{app:m.app,currentUser:m.user},functions:m.functions,ensureAppCheckReady:m.ready} as unknown as Pick<FirebaseServices,"auth"|"functions"|"ensureAppCheckReady">;
  const failure=Object.assign(new Error("private request body and token"),{code:"functions/unavailable"});m.block.mockRejectedValueOnce(failure);
  await expect(setBoardAuthorBlocked("private-target",true,services)).rejects.toBe(failure);
  await vi.waitFor(()=>expect(m.log).toHaveBeenCalledOnce());
  expect(m.ready).toHaveBeenCalledOnce();expect(m.globalReady).not.toHaveBeenCalled();
  expect(m.callable).toHaveBeenCalledWith(m.functions,"logClientError");
  expect(JSON.stringify(m.log.mock.calls)).not.toContain("private-target");expect(JSON.stringify(m.log.mock.calls)).not.toContain("private request body");
});

it("does not attribute a delayed failure to a replacement embedded account",async()=>{
  const {setBoardAuthorBlocked}=await import("./useBoardBlocks");
  const auth={app:m.app,currentUser:m.user};
  const services={auth,functions:m.functions,ensureAppCheckReady:m.ready} as unknown as Pick<FirebaseServices,"auth"|"functions"|"ensureAppCheckReady">;
  const failure=new Error("original request failure");
  let rejectRequest!:(error:Error)=>void;
  m.block.mockImplementationOnce(()=>new Promise((_,reject)=>{rejectRequest=reject;}));
  const pending=setBoardAuthorBlocked("private-target",false,services);
  auth.currentUser={uid:"replacement-owner"};
  rejectRequest(failure);
  await expect(pending).rejects.toBe(failure);
  expect(m.log).not.toHaveBeenCalled();expect(m.capture).not.toHaveBeenCalled();expect(m.ready).not.toHaveBeenCalled();
});
