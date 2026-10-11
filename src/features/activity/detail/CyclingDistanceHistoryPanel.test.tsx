import type { Activity } from "@shared/types";
import type { CyclingDistanceHistoryRequest, CyclingDistanceHistoryResponse, CyclingDistanceHistoryRow } from "@shared/types/training-cycling-distance-history";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ko from "../../../i18n/resources/ko/activity.json";
import en from "../../../i18n/resources/en/activity.json";
import CyclingDistanceHistoryPanel from "./CyclingDistanceHistoryPanel";
const mocks=vi.hoisted(()=>({hook:vi.fn(),start:vi.fn(),more:vi.fn(),restart:vi.fn(),language:"ko",units:"metric"}));
vi.mock("../../../hooks/useCyclingDistanceHistory",()=>({useCyclingDistanceHistory:mocks.hook}));
vi.mock("../../../contexts/LocaleContext",()=>({useLocale:()=>({units:mocks.units,locale:mocks.language})}));
vi.mock("react-i18next",()=>({useTranslation:()=>({i18n:{language:mocks.language},t:(key:string,params?:Record<string,unknown>)=>{let text:unknown=mocks.language==="ko"?ko:en;for(const part of key.split("."))text=(text as Record<string,unknown>)?.[part];return typeof text==="string"?text.replace(/{{(\w+)}}/g,(_,name:string)=>String(params?.[name]??"")):key;}})}));
// Derived from actual compiled backend fixture 60a7dc6caa1b556ff04e1128797fe1381cf8c53c95e5a8e9c9ddf6cd6128ea94; anonymous synthetic data only.
const wire = {
  "version": 1,
  "mode": "cycling_distance_history_page",
  "discipline": "bike",
  "calendarBasis": "Asia/Seoul",
  "rangeBasis": "calendar_year",
  "year": 2026,
  "targetsVersion": 1,
  "timingBasis": "original_activity_elapsed",
  "quality": "unknown",
  "coverage": "unknown",
  "scope": "page",
  "queryScope": "owner_activities_with_valid_start_time",
  "range": {
    "fromInclusive": 1767193200000,
    "toExclusive": 1791676800000
  },
  "readTime": {
    "seconds": 1791676800,
    "nanoseconds": 0
  },
  "expiresAt": 1791678600000,
  "page": {
    "limit": 50,
    "scannedActivityCount": 0,
    "candidateActivityCount": 0,
    "skippedActivityCount": 0,
    "exhausted": true,
    "observationCounts": {
      "observed": 0,
      "noObserved": 0,
      "unsupported": 0,
      "unavailable": 0
    },
    "nextCursor": null
  },
  "activities": []
} as CyclingDistanceHistoryResponse;
const native = {
  "activityId": "native",
  "startTime": 1767225600000,
  "activityRevision": "100:1",
  "metricsRevision": "100:1",
  "representativeInput": {
    "source": "orider",
    "type": "Ride",
    "discipline": "bike",
    "localSessionId": null,
    "stravaActivityId": null,
    "stravaTwinActivityId": 123,
    "endTime": 1767226600000,
    "movingSec": null,
    "hasLoad": false
  },
  "analysis": {
    "state": "ready",
    "calculatorVersion": 35,
    "inputCoverage": "complete"
  },
  "distanceObservations": {
    "state": "observed",
    "points": [
      {
        "distance": "5miles",
        "elapsedSec": 1000
      },
      {
        "distance": "10km",
        "elapsedSec": 999
      },
      {
        "distance": "10miles",
        "elapsedSec": 998
      },
      {
        "distance": "20km",
        "elapsedSec": 997
      },
      {
        "distance": "30km",
        "elapsedSec": 996
      },
      {
        "distance": "40km",
        "elapsedSec": 995
      },
      {
        "distance": "50km",
        "elapsedSec": 994
      },
      {
        "distance": "80km",
        "elapsedSec": 993
      },
      {
        "distance": "50miles",
        "elapsedSec": 992
      },
      {
        "distance": "90km",
        "elapsedSec": 991
      },
      {
        "distance": "100km",
        "elapsedSec": 990
      },
      {
        "distance": "100miles",
        "elapsedSec": 989
      },
      {
        "distance": "180km",
        "elapsedSec": 988
      }
    ]
  }
} as CyclingDistanceHistoryRow;
const NOW = wire.readTime.seconds * 1000;
const selection: CyclingDistanceHistoryRequest = { mode: "cycling_distance_history_page", discipline: "bike", calendarBasis: "Asia/Seoul", rangeBasis: "calendar_year", year: 2026 };
function row(id = "native", offset = 1000): CyclingDistanceHistoryRow { const r=structuredClone(native); r.activityId=id; r.startTime=wire.range.fromInclusive+offset; if(r.representativeInput.endTime!==null)r.representativeInput.endTime=r.startTime+1000000; r.representativeInput.localSessionId=null; r.representativeInput.stravaActivityId=null; r.representativeInput.stravaTwinActivityId=null; return r; }
function page(rows: CyclingDistanceHistoryRow[] = [row()], exhausted = true, offset = 0): CyclingDistanceHistoryResponse {
 const r=structuredClone(wire); r.activities=rows;
 const observed={observed:0,noObserved:0,unsupported:0,unavailable:0};
 for(const item of rows)observed[item.distanceObservations.state === "observed"?"observed":item.distanceObservations.state === "no_observed_efforts"?"noObserved":item.distanceObservations.state === "legacy_unsupported"?"unsupported":"unavailable"]++;
 r.page={limit:50,scannedActivityCount:exhausted?rows.length:50,candidateActivityCount:rows.length,skippedActivityCount:exhausted?0:50-rows.length,exhausted,observationCounts:observed,nextCursor:exhausted?null:{scope:"cycling_distance_history_v1_targets1",readTime:r.readTime,range:r.range,after:{startTime:wire.range.fromInclusive+offset+49000,activityId:"zz"},requestBinding:"a".repeat(64)}};
 return r;
}

const activity={id:"current",userId:"owner",type:"Ride",startTime:NOW-1000000} as Activity;
const idle=()=>({available:true,status:"idle",pages:[] as CyclingDistanceHistoryResponse[],start:mocks.start,loadMore:mocks.more,restart:mocks.restart});
function open(){const details=document.querySelector("details")!;details.open=true;fireEvent(details,new Event("toggle"));return details;}
beforeEach(()=>{mocks.hook.mockReset().mockReturnValue(idle());mocks.start.mockReset();mocks.more.mockReset();mocks.restart.mockReset();mocks.language="ko";mocks.units="metric";});
describe("compact observed cycling history",()=>{
 it("starts collapsed and reads only via manual button",()=>{
  render(<CyclingDistanceHistoryPanel activity={activity} selection={selection}/>);expect(document.querySelector("details")!.open).toBe(false);expect(screen.queryByRole("button")).not.toBeInTheDocument();expect(mocks.start).not.toHaveBeenCalled();
  open();fireEvent.click(screen.getByRole("button",{name:ko.cyclingDistanceHistory.start}));expect(mocks.start).toHaveBeenCalledOnce();
 });
 it("uses actual native source even when the canonical twin is unsupported",()=>{
  const a=row("러닝😀");a.representativeInput.stravaTwinActivityId=123;const b=row("strava_123",50000);b.representativeInput.source="strava";b.representativeInput.stravaActivityId=123;b.distanceObservations={state:"legacy_unsupported",points:[]};
  mocks.hook.mockReturnValue({...idle(),status:"partial",pages:[page([a],false),page([b])]});render(<CyclingDistanceHistoryPanel activity={activity} selection={selection}/>);open();
  const leaders=screen.getByText("1 · 16:39").closest("li")!;expect(within(leaders).getByRole("link")).toHaveAttribute("href","/ko/activity/%EB%9F%AC%EB%8B%9D%F0%9F%98%80");expect(leaders).toHaveAttribute("data-metrics-revision",a.metricsRevision);expect(within(leaders).getByRole("link")).toHaveTextContent("orider");expect(screen.getByText(ko.cyclingDistanceHistory.underlyingSource)).toBeInTheDocument();
 });
 it("shows top three then five locally in a year and ten for an explicit range",()=>{
  const rows=Array.from({length:12},(_,i)=>row(`r${i}`,i*1000));mocks.hook.mockReturnValue({...idle(),status:"complete",pages:[page(rows)]});
  const view=render(<CyclingDistanceHistoryPanel activity={activity} selection={selection}/>);open();expect(document.querySelectorAll("li")).toHaveLength(3);
  fireEvent.click(screen.getByRole("button",{name:"상위 5개 보기"}));expect(document.querySelectorAll("li")).toHaveLength(5);expect(mocks.more).not.toHaveBeenCalled();
  view.rerender(<CyclingDistanceHistoryPanel activity={activity} selection={{mode:selection.mode,discipline:"bike",calendarBasis:"Asia/Seoul",rangeBasis:"explicit_range",range:{fromInclusive:wire.range.fromInclusive,toExclusive:NOW}}}/>);
  expect(document.querySelectorAll("li")).toHaveLength(3);fireEvent.click(screen.getByRole("button",{name:"상위 10개 보기"}));expect(document.querySelectorAll("li")).toHaveLength(10);expect(mocks.start).not.toHaveBeenCalled();
 });
 it("keeps all thirteen SI targets distinct in imperial presentation without requests",()=>{
  mocks.units="imperial";mocks.hook.mockReturnValue({...idle(),status:"complete",pages:[page()]});render(<CyclingDistanceHistoryPanel activity={activity} selection={selection}/>);open();const select=screen.getByRole("combobox");expect(within(select).getAllByRole("option")).toHaveLength(13);
  fireEvent.change(select,{target:{value:"80km"}});expect(screen.getByRole("heading")).toHaveTextContent("49.7mi");fireEvent.change(select,{target:{value:"50miles"}});expect(screen.getByRole("heading")).toHaveTextContent("50.0mi");expect(mocks.start).not.toHaveBeenCalled();expect(mocks.more).not.toHaveBeenCalled();
 });
 it.each(["ko","en"])("shows unknown evidence and honest partial scope in %s",language=>{
  mocks.language=language;const r=row();r.distanceObservations={state:"legacy_unsupported",points:[]};mocks.hook.mockReturnValue({...idle(),status:"partial",pages:[page([r],false)]});render(<CyclingDistanceHistoryPanel activity={activity} selection={selection}/>);open();const copy=language==="ko"?ko:en;expect(screen.getByText(copy.cyclingDistanceHistory.unknown)).toBeInTheDocument();expect(screen.getByText(copy.cyclingDistanceHistory.partial)).toBeInTheDocument();expect(screen.queryByText(copy.cyclingDistanceHistory.noObserved)).not.toBeInTheDocument();expect(screen.getByText(copy.cyclingDistanceHistory.basis)).toBeInTheDocument();
 });
 it("preserves the Seoul date boundary and marks accessible 14px/44px controls",()=>{
  const r=row();r.startTime=Date.UTC(2025,11,31,15);mocks.hook.mockReturnValue({...idle(),status:"partial",pages:[page([r],false)]});render(<CyclingDistanceHistoryPanel activity={activity} selection={selection}/>);open();expect(screen.getAllByRole("link")[0]).toHaveTextContent("2026. 01. 01.");expect(screen.getByRole("combobox").className).toContain("var(--fs-md)");expect(screen.getByRole("button",{name:ko.cyclingDistanceHistory.more}).className).toContain("var(--dim-button-height)");
 });
 it.each(["expired","invalidated"])("requires a manual restart after %s",status=>{mocks.hook.mockReturnValue({...idle(),status});render(<CyclingDistanceHistoryPanel activity={activity} selection={selection}/>);open();expect(screen.queryByRole("link")).not.toBeInTheDocument();expect(mocks.restart).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:ko.cyclingDistanceHistory.restart}));expect(mocks.restart).toHaveBeenCalledOnce();});
 it("renders nothing for an ineligible account",()=>{mocks.hook.mockReturnValue({...idle(),available:false});render(<CyclingDistanceHistoryPanel activity={activity} selection={selection}/>);expect(document.querySelector("details")).toBeNull();});
});

it("builds source links only when opened and reveals another fifty without a request",()=>{
 const rows=Array.from({length:120},(_,i)=>row(`source-${i}`,i*1000));mocks.hook.mockReturnValue({...idle(),status:"partial",pages:[page(rows.slice(0,50),false),page(rows.slice(50,100),false,50000),page(rows.slice(100))]});render(<CyclingDistanceHistoryPanel activity={activity} selection={selection}/>);open();const details=screen.getByText("받은 원본 활동 120개").closest("details")!;expect(within(details).queryAllByRole("link")).toHaveLength(0);
 details.open=true;fireEvent(details,new Event("toggle"));expect(within(details).getAllByRole("link")).toHaveLength(50);fireEvent.click(within(details).getByRole("button",{name:ko.cyclingDistanceHistory.moreSources}));expect(within(details).getAllByRole("link")).toHaveLength(100);expect(mocks.more).not.toHaveBeenCalled();
});
