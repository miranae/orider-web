import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { BikePeriodSnapshotResponse } from "@shared/types/bike-period-snapshot";
import actual from "../../../services/__fixtures__/bike-snapshot-1001.json";
import { chooseDropdownAt } from "../fitnessControlTestUtils";
import BikePeriodSnapshotPanel from "./BikePeriodSnapshotPanel";
import { POWER_DURATION_GRID } from "../../../services/powerCurvePeriods";
const mocks=vi.hoisted(()=>({snapshot:{data:null as BikePeriodSnapshotResponse|null,running:false,error:false,errorKind:undefined as string|undefined,canResume:false,start:vi.fn(),resume:vi.fn(),zones:vi.fn(),stop:vi.fn()}}));
vi.mock("../../../hooks/useBikePeriodSnapshot",()=>({useBikePeriodSnapshot:()=>mocks.snapshot}));
vi.mock("../../../services/localTrainingEmulator",()=>({localTrainingEmulatorAvailable:()=>true}));
vi.mock("../../../contexts/LocaleContext",()=>({useLocale:()=>({units:"metric"})}));
vi.mock("../../../hooks/usePeriodControls",async()=>{const {useState}=await import('react');return{usePeriodControls:(_:unknown,__:unknown,initial:()=>unknown)=>useState(initial)};});
vi.mock("react-i18next",()=>({useTranslation:()=>({t:(key:string,p?:Record<string,unknown>)=>key+(p?JSON.stringify(p):""),i18n:{language:"ko"}})}));
function mount(){return render(<MemoryRouter><BikePeriodSnapshotPanel ownerUid="owner" period={actual.period}/></MemoryRouter>);}
beforeEach(()=>{mocks.snapshot.data=structuredClone(actual) as unknown as BikePeriodSnapshotResponse;mocks.snapshot.error=false;mocks.snapshot.errorKind=undefined;mocks.snapshot.canResume=true;});
it("distinguishes partial stored-weight coverage from complete W values and labels KST",()=>{mount();expect(screen.getByText("bikeSnapshot.weightPartial")).toBeInTheDocument();expect(screen.getByText(/^periodCurve.weightCoverage/)).toHaveTextContent('"missingWeightActivityCount":1001');expect(screen.getByText(/^bikeSnapshot.basis/)).toHaveTextContent('KST');});
it("explains oversized identity groups without offering continuation",()=>{mocks.snapshot.data=null;mocks.snapshot.error=true;mocks.snapshot.errorKind="limit";mocks.snapshot.canResume=false;mount();expect(screen.getByRole('alert')).toHaveTextContent('bikeSnapshot.identityLimit');expect(screen.queryByRole('button',{name:'bikeSnapshot.resume'})).not.toBeInTheDocument();});
it("supports the dense duration grid and independent W and W/kg source links",()=>{
 const power=mocks.snapshot.data!.result!.power;
 const dense={points:POWER_DURATION_GRID.map((durationSeconds,index)=>({durationSeconds,maxAveragePowerW:300-index,sourceActivityId:`watts-${durationSeconds}`,startTime:actual.period.fromInclusive,parentRevision:'revision',provenance:'direct_file' as const,observedActivityCount:1})),partial:false};
 power.powerDurationObservations=dense as typeof power.powerDurationObservations;
 power.weightNormalized!.powerDurationObservations={...dense,points:dense.points.map(p=>({...p,sourceActivityId:`weight-${p.durationSeconds}`,maxAveragePowerWPerKg:p.maxAveragePowerW/70,weightKg:70,weightRevision:'revision'}))} as typeof power.weightNormalized.powerDurationObservations;
 mount();const select=screen.getByRole('combobox',{name:'periodCurve.duration'});const duration=POWER_DURATION_GRID.find(d=>![1,5,10,30,60,120,300,600,1200,1800,3600].includes(d))!;chooseDropdownAt(select,POWER_DURATION_GRID.indexOf(duration));
 expect(screen.getByRole('link',{name:/ · W$/})).toHaveAttribute('href',`/ko/activity/watts-${duration}`);expect(screen.getByRole('link',{name:/ · W\/kg$/})).toHaveAttribute('href',`/ko/activity/weight-${duration}`);
});

it("separates metric and coverage copy into block paragraphs",()=>{mount();expect(screen.getByText(/^bikeSnapshot.metrics.distanceM/).tagName).toBe("P");expect(screen.getAllByText(/^bikeSnapshot.coverage/)[0].tagName).toBe("P");expect(screen.getByText("bikeSnapshot.powerComplete").tagName).toBe("P");expect(screen.getByText("bikeSnapshot.weightPartial").tagName).toBe("P");});
