import type { BikeSnapshotPowerResult } from "@shared/types/bike-period-snapshot";
import type { CalculationWeightCounts } from "@shared/types/power-curve-periods";
import { validateDenseObservations } from "./powerCurvePeriods";
const fail=():never=>{throw Error("invalid_bike_snapshot");};
const validWeight=(n:number)=>Number.isFinite(n)&&n>=25&&n<=250;
function weightCounts(counts:CalculationWeightCounts,total:number){
 const keys=["includedActivityCount","missingWeightActivityCount","invalidWeightActivityCount","incompatibleWeightActivityCount"] as const;
 if(!counts||Object.keys(counts).sort().join()!==[...keys].sort().join()||!keys.every(k=>Number.isSafeInteger(counts[k])&&counts[k]>=0)||keys.reduce((sum,k)=>sum+counts[k],0)!==total)fail();
}
export function validateBikeSnapshotPower(period:BikeSnapshotPowerResult){
 try{
  if(period.powerDurationObservations!==undefined)validateDenseObservations(period.powerDurationObservations,period);
  const normalized=period.weightNormalized;if(!normalized)return;
  if(normalized.unit!=="W/kg"||normalized.basis!=="calculation_profile_snapshot")fail();
  weightCounts(normalized.weightCounts,period.coverage.includedActivityCount);
  if(Object.keys(normalized.coverage).sort().join()!==Object.keys(period.coverage).sort().join()||Object.keys(period.coverage).some(key=>{const k=key as keyof typeof period.coverage;return normalized.coverage[k] !== (k==="includedActivityCount"?normalized.weightCounts.includedActivityCount:period.coverage[k]);}))fail();
  for(const point of normalized.points)if(!validWeight(point.weightKg)||point.weightRevision!==point.metricsRevision||point.wattsPerKg!==point.watts/point.weightKg)fail();
  if(normalized.weightCounts.includedActivityCount===0&&normalized.points.length)fail();
  const dense=normalized.powerDurationObservations,original=period.powerDurationObservations;
  if(dense!==undefined){
   if(!original)return fail();
   if(!dense||dense.unit!=="W/kg"||dense.basis!=="calculation_profile_snapshot")return fail();
   weightCounts(dense.weightCounts,original.counts.available);
   if(!dense.counts||dense.counts.available!==dense.weightCounts.includedActivityCount||Object.keys(original.counts).some(key=>key!=="available"&&dense.counts[key as keyof typeof dense.counts]!==original.counts[key as keyof typeof original.counts]))fail();
   if(dense.partial!==(original.partial||dense.weightCounts.includedActivityCount<original.counts.available)||!Array.isArray(dense.points))fail();
   const points=dense.points.map(point=>{
    if(!validWeight(point.weightKg)||point.weightRevision!==point.parentRevision||point.maxAveragePowerWPerKg!==point.maxAveragePowerW/point.weightKg||point.observedActivityCount>dense.weightCounts.includedActivityCount)fail();
    const {maxAveragePowerWPerKg:_power,weightKg:_weight,weightRevision:_revision,...plain}=point;return plain;
   });
   const {unit:_unit,basis:_basis,weightCounts:_counts,...plain}=dense;
   validateDenseObservations({...plain,counts:original.counts,partial:original.partial,points},period);
  }
  if(normalized.status!==(period.status==="partial"||normalized.weightCounts.includedActivityCount<period.coverage.includedActivityCount||dense?.partial?"partial":"complete"))fail();
 }catch{fail();}
}
