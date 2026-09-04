import { getPublicUserProfile, type PublicUserProfile } from "./publicProfiles";
import { isPermissionDeniedError } from "../utils/firebaseErrors";

/**
 * `users_public` 프로필의 프로세스 수명 캐시.
 *
 * 활동 피드는 같은 작성자의 카드를 여러 장 그리므로, 카드마다 프로필을 읽으면 N+1 이 된다.
 * 여기서 **userId 당 1회**로 접어 준다 — 동시 요청은 in-flight 프로미스를 공유하고, 결과는
 * (없음/권한없음 포함) 캐시에 남겨 같은 사용자를 반복 조회하지 않는다.
 *
 * 활동 문서에 denormalize 된 이름을 쓰지 않고 프로필을 정본으로 삼기 위한 토대다
 * (앱 업로드분은 문서에 nickname 이 아예 없다 — orider-g1-web#2444).
 */
const cache = new Map<string, PublicUserProfile | null>();
const flights = new Map<string, Promise<PublicUserProfile | null>>();

/** 캐시 조회. `undefined` 는 "아직 조회 안 함", `null` 은 "조회했고 없음(또는 권한없음)". */
export function peekPublicUserProfile(userId: string): PublicUserProfile | null | undefined {
  return cache.get(userId);
}

/**
 * 캐시를 경유해 프로필을 읽는다. 권한 거부는 "없음"(`null`)으로 흡수한다 — 비공개 프로필은
 * 오류가 아니라 정상 상태이고, 오류로 두면 카드마다 재시도가 반복된다.
 */
export function loadPublicUserProfile(userId: string): Promise<PublicUserProfile | null> {
  const cached = cache.get(userId);
  if (cached !== undefined) return Promise.resolve(cached);

  const inFlight = flights.get(userId);
  if (inFlight) return inFlight;

  const flight = getPublicUserProfile(userId)
    .catch((err: unknown) => {
      if (isPermissionDeniedError(err)) return null;
      throw err;
    })
    .then((profile) => {
      cache.set(userId, profile);
      return profile;
    })
    .finally(() => {
      flights.delete(userId);
    });

  flights.set(userId, flight);
  return flight;
}

/** 테스트 전용 — 모듈 캐시는 프로세스 수명이라 케이스 간 격리가 필요하다. */
export function resetPublicProfileCache(): void {
  cache.clear();
  flights.clear();
}
