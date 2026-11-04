import { liveRiders } from "./presentation";
import type { MeetingSpectatorSnapshot } from "./types";
export function spectatorPeople(snapshot: MeetingSpectatorSnapshot, now: number) {
  const riders = liveRiders(snapshot, now);
  const byId = new Map(riders.map(r => [r.uid, r]));
  // 구 서버에서도 위치 수신 인원만 표시한다. 신청 인원을 추측하지 않는다.
  const participants = snapshot.participants ?? riders.map(r => ({uid: r.uid, displayName: r.displayName, status: r.status}));
  return participants.map(p => ({...p, rider: byId.get(p.uid),
    state: byId.get(p.uid)?.status ?? (["REGISTERED", "PAID", "CHECKED_IN"].includes(p.status) ? "WAITING" : ["FINISHED", "DNF"].includes(p.status) ? p.status : "LOCATION_PENDING")}));
}
export function spectatorStatus(status: string, en: boolean) {
  const words: Record<string, [string, string]> = {WAITING: ["출발 대기", "Waiting to start"], LOCATION_PENDING: ["위치 대기", "Waiting for position"], RIDING: ["주행 중", "Riding"], STOPPED: ["정지", "Stopped"], LOST_SIGNAL: ["수신 지연", "Signal delayed"], FINISHED: ["주행 완료", "Finished"], DNF: ["중도 종료", "DNF"]};
  return words[status]?.[en ? 1 : 0] ?? status;
}
