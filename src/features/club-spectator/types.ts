export interface SpectatorCourse {
  courseId: string;
  name: string;
  points: {lat: number; lon: number}[];
  distanceM: number;
}
export interface SpectatorRider {
  uid: string;
  displayName: string;
  lat: number;
  lng: number;
  sampledAtMs: number;
  courseId: string;
  progressM: number | null;
  speedMps: number | null;
  powerWatts: number | null;
  powerExpiresAtMs: number | null;
  gapToLeaderM: number | null;
  leaderGapExpiresAtMs: number | null;
  gapToSelectedM: number | null;
  selectedGapExpiresAtMs: number | null;
  status: "RIDING" | "STOPPED" | "LOST_SIGNAL" | "FINISHED" | "DNF";
  /** 화면 전용: 진행·격차가 위치 표본(sampledAtMs)의 월드 값이 아닐 때(더 이른 표본이거나 같은 표본의 콜러블 값) 그 계산 기준 표본 시각을 둔다. */
  progressSampledAtMs?: number;
}
export interface MeetingSpectatorSnapshot {
  eventId: string;
  groupId: string;
  title: string;
  status: "OPEN" | "LIVE" | "FINISHED" | "CANCELLED";
  serverNowMs: number;
  selectedUid: string | null;
  participants?: {uid: string; displayName: string; status: string}[];
  course: SpectatorCourse | null;
  locations: SpectatorRider[];
}
