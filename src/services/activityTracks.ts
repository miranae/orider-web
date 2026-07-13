/**
 * activityTracks — 개인 히트맵(#413)·탐험 그리드(#363) 공용 활동 스트림 로더.
 *
 * 비용 근거: 전체 활동을 무제한 로드하면 대형 계정에서 비용 폭발 → 최근 1년 · 최대 500건으로
 * 캡. 두 기능이 완전히 동일한 쿼리 형태(`activities` where userId/deletedAt/startTime, limit)를
 * 쓰므로 쿼리 빌딩을 이 한 곳에만 두어 중복을 없앤다. 집계 결과(히트포인트/방문 타일)는 각
 * 훅이 자체 세션 캐시로 따로 보관 — 두 모드를 동시에 켜면 Firestore 조회는 각 훅에서 한 번씩
 * (최대 2회) 일어나지만, 결과 캐시 덕에 토글을 반복해도 재조회하지 않는다.
 */
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { firestore } from "./firebase";

export const RECENT_ACTIVITY_TRACKS_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;
export const RECENT_ACTIVITY_TRACKS_DOCUMENT_CAP = 500;

export interface RecentActivityTrack {
  thumbnailTrack?: string;
}

export async function fetchRecentActivityTracks(uid: string): Promise<RecentActivityTrack[]> {
  const cutoff = Date.now() - RECENT_ACTIVITY_TRACKS_WINDOW_MS;
  const snapshot = await getDocs(query(
    collection(firestore, "activities"),
    where("userId", "==", uid),
    where("deletedAt", "==", null),
    where("startTime", ">=", cutoff),
    orderBy("startTime", "desc"),
    limit(RECENT_ACTIVITY_TRACKS_DOCUMENT_CAP),
  ));
  return snapshot.docs.map((doc) => ({ thumbnailTrack: doc.data().thumbnailTrack as string | undefined }));
}
