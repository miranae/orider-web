import { describe, expect, it } from 'vitest';
import type { FitnessTimeseriesDoc } from '@shared/types/fitness-timeseries';
import { periodLoadEvidence } from './periodLoadEvidence';
function source(): FitnessTimeseriesDoc {
  const computedAt = Date.parse('2026-10-25T12:00:00+09:00');
  const points = ['2026-10-23','2026-10-24','2026-10-25'].map((date, i) => ({ date, dailyLoad: 10 * i, ctl: 20 + i, atl: 30 + i, tsb: -10 }));
  return { discipline:'bike',schemaVersion:1,computedAt,startDate:points[0].date,endDate:points[2].date,pointCount:3,points,
    loadSnapshot: { inputRevision:1,inputDigest:'a'.repeat(64),asOf:computedAt,inputReadTime:{seconds:computedAt/1000,nanoseconds:0},coverageStartDate:points[0].date,coverageEndDate:points[2].date,dateKeyBasis:{segments:[{fromMs:null,tz:'Asia/Seoul'}]},points:points.map(p=>({date:p.date,dailyLoad:p.dailyLoad,status:'final',quality:'precomputed'})) },
    pmc:{status:'processed',attemptId:'a',inputRevision:1,processedInputRevision:1,asOf:computedAt,deadlineAt:computedAt+60000,errorCode:null} };
}
const start=Date.parse('2026-10-24T00:00:00+09:00'), end=Date.parse('2026-10-26T00:00:00+09:00');
describe('selected canonical period load',()=>{
 it('includes proven final zero days before the first saved PMC without inventing opening fitness',()=>{
  const s=source();
  const from=Date.parse('2026-09-28T00:00:00+09:00');
  s.points=s.points.filter(p=>p.date>='2026-10-24');s.startDate='2026-10-24';s.pointCount=2;
  s.loadSnapshot!.coverageStartDate='2026-09-28';
  s.loadSnapshot!.points=Array.from({length:28},(_,i)=>{
   const date=new Date(from+i*86400000+9*3600000).toISOString().slice(0,10);
   return {date,dailyLoad:date==='2026-10-24'?13:0,status:'final' as const,quality:date==='2026-10-24'?'precomputed' as const:'zero' as const};
  });
  const evidence=periodLoadEvidence(s,from,end);
  expect(evidence).toMatchObject({total:13,before:null,after:{date:'2026-10-25'},reason:null});
  expect(evidence.points).toHaveLength(28);
  expect(evidence.points[0]).toMatchObject({date:'2026-09-28',dailyLoad:0,loadStatus:'final',ctl:null,atl:null,tsb:null});
  s.loadSnapshot!.points[0].status='unknown';
  expect(periodLoadEvidence(s,from,end).total).toBeNull();
 });
 it('does not synthesize PMC even for an entirely zero load snapshot with no saved points',()=>{
  const s=source();s.points=[];s.startDate=null;s.endDate=null;s.pointCount=0;
  s.loadSnapshot!.points.forEach(p=>{p.dailyLoad=0;p.quality='zero';});
  expect(periodLoadEvidence(s,start,end)).toMatchObject({total:0,before:null,after:null,reason:null});
 });
 it('rejects partial days and overflowing totals',()=>{
  expect(periodLoadEvidence(source(),start+1,end).reason).toBe('partialDay');
  expect(periodLoadEvidence(source(),start,end-1).reason).toBe('partialDay');
  const s=source(); s.loadSnapshot!.points.forEach(p=>p.dailyLoad=Number.MAX_VALUE);
  expect(periodLoadEvidence(s,start,end).total).toBeNull();
 });
 it('keeps partial-day total absent but exposes only completed calendar days',()=>{
  const result=periodLoadEvidence(source(),start,end-1);
  expect(result).toMatchObject({total:null,observedTotal:10,observedEnd:'2026-10-24',reason:'partialDay',after:{date:'2026-10-24'}});
  const unknown=source(); unknown.loadSnapshot!.points[1].status='unknown';
  expect(periodLoadEvidence(unknown,start,end-1).observedTotal).toBeNull();
 });
 it('sums exactly selected days and reads preceding/closing PMC without reseeding',()=>{
  expect(periodLoadEvidence(source(),start,end)).toMatchObject({total:30,before:{date:'2026-10-23',ctl:20},after:{date:'2026-10-25',ctl:22},reason:null});
 });
 it('does not fill absent days or unknown loads with zero',()=>{
  const s=source(); s.points.splice(1,1);s.loadSnapshot!.points.splice(1,1);
  expect(periodLoadEvidence(s,start,end)).toMatchObject({total:null,reason:'unavailable'});
  const unknown=source();unknown.loadSnapshot!.points[1].status='unknown';
  expect(periodLoadEvidence(unknown,start,end).total).toBeNull();
 });
 it('withholds stale or pending PMC even when load snapshot is final',()=>{
  const s=source();s.pmc!.status='pending';s.pmc!.processedInputRevision=null;
  expect(periodLoadEvidence(s,start,end)).toMatchObject({total:30,before:null,after:null});
  s.inputInvalidatedAt={seconds:s.computedAt/1000+1,nanoseconds:0};
  expect(periodLoadEvidence(s,start,end).total).toBeNull();
 });
 it('rejects UTC, timezone transitions inside period and absent lifecycle',()=>{
  const s=source();s.loadSnapshot!.dateKeyBasis=undefined;
  expect(periodLoadEvidence(s,start,end).reason).toBe('timezone');
  s.loadSnapshot!.dateKeyBasis={segments:[{fromMs:null,tz:'Asia/Seoul'},{fromMs:start+1,tz:'UTC'}]};
  expect(periodLoadEvidence(s,start,end).total).toBeNull();
  expect(periodLoadEvidence(null,start,end).reason).toBe('unavailable');
 });
});
