import { useEffect, useState } from "react";
import { loadPublicUserProfile, peekPublicUserProfile } from "../services/publicProfileCache";
import { logClientError } from "../services/errorLogger";

export interface ActivityAuthorSource {
  userId: string;
  nickname?: string | null;
  profileImage?: string | null;
}

export interface ActivityAuthor {
  /** 표시할 이름. 아직 모르면 `null` — 폴백 문구는 호출부(i18n)가 고른다. */
  nickname: string | null;
  profileImage: string | null;
}

function readString(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * 활동 작성자의 표시 이름·사진을 해석한다.
 *
 * 활동 문서의 `nickname`/`profileImage` 는 **업로드 시점에 복제된 값**이라, 앱 업로드분처럼
 * 아예 없을 수 있고(orider-g1-web#2444) 개명 후에는 옛 이름으로 남는다. 그래서 정본인
 * `users_public/{userId}` 를 우선하고, 문서에 복제된 값은 프로필을 못 읽었을 때의 폴백으로만 쓴다.
 *
 * 프로필 조회는 [loadPublicUserProfile] 캐시가 userId 당 1회로 접으므로, 같은 작성자의 카드가
 * 여러 장이어도 읽기는 한 번이다.
 */
export function useActivityAuthor(source: ActivityAuthorSource): ActivityAuthor {
  const { userId } = source;
  const documentNickname = readString(source.nickname);
  const documentProfileImage = readString(source.profileImage);

  const [profile, setProfile] = useState(() => (userId ? peekPublicUserProfile(userId) : null));

  useEffect(() => {
    if (!userId) return;
    const cached = peekPublicUserProfile(userId);
    if (cached !== undefined) {
      setProfile(cached);
      return;
    }

    let cancelled = false;
    setProfile(undefined);
    loadPublicUserProfile(userId)
      .then((loaded) => {
        if (!cancelled) setProfile(loaded);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // 조회 실패는 표시를 막지 않는다 — 문서에 복제된 값(있으면)으로 이어서 그린다.
        setProfile(null);
        logClientError("useActivityAuthor", err, { userId });
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return {
    nickname: readString(profile?.nickname) ?? documentNickname,
    profileImage: readString(profile?.photoURL) ?? documentProfileImage,
  };
}
