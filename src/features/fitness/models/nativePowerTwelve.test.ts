import {describe,it,expect} from "vitest";
import {nativeTwelveExactWinner,nativeTwelveDisplayValue} from "./nativePowerTwelve";
import {nativeTwelveFixture} from "../../../dev/nativeTwelveFixture";
const periods=[{id:"all",fromInclusiveMs:0,toExclusiveMs:Date.UTC(2026,9,13)}];
describe("native12 source-first scalar reducer",()=>{
 it("returns selected measured source and preserves short window",()=>{const v=nativeTwelveFixture(periods);expect(nativeTwelveExactWinner(v,0,15,"measured","W")?.activityId).toBe("orider_fixture_a");expect(nativeTwelveExactWinner(v,0,3600,"measured","W")).toBeNull();});
 it("does not resurrect a twin when preferred source is unavailable",()=>{const v=nativeTwelveFixture(periods);const twin=structuredClone(v.sources[0]!);twin.candidate.activityId="orider_fixture_b";twin.powerSource="stored_native_watts_unverified";v.sources[0]!.slots[0]!.state="no_continuous_window";v.sources[0]!.slots[0]!.witness=null;v.sources.push(twin);expect(nativeTwelveExactWinner(v,0,15,"stored_native_watts_unverified","W")).toBeNull();});
 it("suppresses unresolved known physical twins",()=>{const v=nativeTwelveFixture(periods);v.sources[0]!.unresolvedKnownTwin=true;expect(nativeTwelveExactWinner(v,0,15,"measured","W")).toBeNull();});
 it.each([[0,"W","0.0 W"],[1/30,"W","<0.1 W"],[.099,"W","<0.1 W"],[.1,"W","0.1 W"],[.004,"W/kg","<0.01 W/kg"],[0,"W/kg","0.00 W/kg"],[.01,"W/kg","0.01 W/kg"]] as const)("preserves positive %s %s",(value,unit,label)=>expect(nativeTwelveDisplayValue(value,unit)).toBe(label));

});
