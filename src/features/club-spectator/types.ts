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
