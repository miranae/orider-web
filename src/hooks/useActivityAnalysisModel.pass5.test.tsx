import { act, renderHook, waitFor } from "@testing-library/react";
import { collection, getDoc, onSnapshot } from "firebase/firestore";
import { expect, it, vi } from "vitest";

import type { Activity, ActivityStreams } from "@shared/types";
import { setDocData } from "../__tests__/mocks/firebase";
import { useActivityAnalysisModel } from "./useActivityAnalysisModel";

vi.mock("./useActivityOverview",()=>({useActivityOverview:()=>({response:{status:"available",presentation:{}},loading:false})}));

const mocks = vi.hoisted(() => ({
  user: { uid: "owner" } as { uid: string } | null,
  getStreams: vi.fn(),
}));

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock("./useStrava", () => ({
  useStrava: () => ({ getStreams: mocks.getStreams }),
}));

vi.mock("./useFitnessTimeseries", () => ({
  useFitnessTimeseries: () => ({ timeseries: null }),
}));

vi.mock("../contexts/LocaleContext", () => ({
  useLocale: () => ({ units: "metric", locale: "ko-KR" }),
}));

vi.mock("../components/ZoneDistributionChart", () => ({
  default: ({ title, zones }: { title: string; zones: Array<{ seconds: number }> }) => (
    <div data-testid={`zone-chart-${title}`}>{zones.map(({ seconds }) => seconds).join(",")}</div>
  ),
}));
vi.mock("../components/PowerCurveChart", () => ({
  default: ({ points }: { points: Array<{ maxPower: number }> }) => (
    <div data-testid="power-curve-chart">{points.map(({ maxPower }) => maxPower).join(",")}</div>
  ),
}));

vi.mock("./useActiveBikeProfile", () => ({
  useActiveBikeProfile: () => ({ active: null }),
}));

function makeActivity(id: string, userId = "owner"): Activity {
  return {
    id,
    userId,
    nickname: "Rider",
    profileImage: null,
    type: "Ride",
    createdAt: 1_700_000_000_000,
    startTime: 1_700_000_000_000,
    endTime: 1_700_000_004_000,
    summary: {
      distance: 30,
      ridingTimeMillis: 4_000,
      elapsedTimeMillis: 4_000,
      averageSpeed: 27,
      maxSpeed: 35,
      averageCadence: 80,
      maxCadence: 100,
      averageHeartRate: 140,
      maxHeartRate: 160,
      averagePower: 175,
      maxPower: 300,
      normalizedPower: 190,
      elevationGain: 10,
      calories: 100,
      relativeEffort: 20,
      tss: 30,
      swolf: null,
    },
    thumbnailTrack: "",
    groupId: null,
    groupRideId: null,
    photoCount: 0,
    kudosCount: 0,
    commentCount: 0,
    segmentEffortCount: 0,
    description: "Morning Ride",
    visibility: "everyone",
    gpxPath: null,
    source: "orider",
  };
}

const streams: ActivityStreams = {
  userId: "owner",
  time: [0, 1, 2, 3],
  distance: [0, 10, 20, 30],
  altitude: [10, 11, 12, 13],
  velocity_smooth: [5, 6, 7, 8],
  watts: [100, 200, 300, 400],
  heartrate: [130, 140, 150, 160],
  cadence: [70, 80, 90, 100],
};

function seedActivity(activity: Activity, activityStreams: ActivityStreams = streams) {
  setDocData(`activities/${activity.id}`, activity as unknown as Record<string, unknown>);
  setDocData(`activity_streams/${activity.id}`, {
    userId: activity.userId,
    json: JSON.stringify(activityStreams),
  });
}

it("keeps full current B analysis after reverse provider completion", async () => {
 let resolveA!: (value:unknown)=>void; let resolveB!: (value:unknown)=>void;
 mocks.getStreams.mockImplementation((id:number)=>new Promise(resolve=>{if(id===111) resolveA=resolve; else resolveB=resolve;}));
 const a={...makeActivity("strava_111"),source:"strava",stravaActivityId:111} as Activity;
 const b={...makeActivity("strava_222"),source:"strava",stravaActivityId:222} as Activity;
 setDocData(`activities/${a.id}`,a as unknown as Record<string,unknown>);
 setDocData(`activities/${b.id}`,b as unknown as Record<string,unknown>);
 const {result,rerender}=renderHook(({id})=>useActivityAnalysisModel(id),{initialProps:{id:a.id}});
 await waitFor(()=>expect(mocks.getStreams).toHaveBeenCalledWith(111));
 rerender({id:b.id});
 await waitFor(()=>expect(mocks.getStreams).toHaveBeenCalledWith(222));
 await act(async()=>resolveB({...streams,distance:[0,20,40,60]}));
 await act(async()=>resolveA({...streams,distance:[0,10,20,30]}));
 expect(result.current.activity?.id).toBe(b.id);
 expect(result.current.analysisTabProps?.activityId).toBe(b.id);
 expect(result.current.analysisTabProps?.streams.distance).toEqual([0,20,40,60]);
});

it("actual public model supplies canonical presentation and non-owner voice", async()=>{
  mocks.user={uid:"viewer"};
  const activity=makeActivity("orider_public_pass5");
  seedActivity(activity);
  const {result}=renderHook(()=>useActivityAnalysisModel(activity.id));
  await waitFor(()=>expect(result.current.analysisTabProps).not.toBeNull());
  expect(result.current.isActivityOwner).toBe(false);
  expect(result.current.analysisTabProps).toMatchObject({isOwner:false,canonicalPresentationAvailable:true});
});
