import { useState, useEffect, useRef, useCallback } from "react";
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  deleteDoc,
  onSnapshot,
} from "firebase/firestore";
import { useTranslation } from "react-i18next";
import { firestore } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import { useAuth } from "../../contexts/AuthContext";
import { track } from "../../services/analytics";
import { getPublicUserProfiles } from "../../services/publicProfiles";
import { isPermissionDeniedError } from "../../utils/firebaseErrors";
import type { LikerAvatarItem } from "../../components/social/LikersAvatarStack";

/**
 * 좋아요 누른 사람을 몇 명까지 읽어 올지. 활동 쿠도스처럼 문서에 비정규화된 목록이 없어
 * 서브컬렉션을 직접 읽으므로(read N), 아바타 스택에 필요한 만큼만 가져온다.
 */
const LIKERS_FETCH_LIMIT = 15;

/**
 * 게시글 좋아요 기능을 위한 훅
 *
 * 좋아요 문서(`board_posts/{postId}/likes/{uid}`)엔 uid 와 createdAt 만 있고 닉네임·프로필
 * 이미지가 없다(활동 쿠도스와 다른 점). 표시용 정보는 `users_public` 에서 채운다 —
 * 문서 스키마·보안 규칙을 건드리지 않아 기존 좋아요도 그대로 이름이 나온다.
 */
export function useBoardLike(postId: string, serverLikeCount = 0) {
  const { t } = useTranslation("board");
  const { user, profile } = useAuth();
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(serverLikeCount);
  const [likers, setLikers] = useState<LikerAvatarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (!pendingRef.current) {
      setLikeCount(serverLikeCount);
    }
  }, [serverLikeCount]);

  useEffect(() => {
    if (!user || !postId) {
      setLoading(false);
      return;
    }

    const likeRef = doc(firestore, `board_posts/${postId}/likes`, user.uid);
    
    // 좋아요 여부 실시간 구독
    const unsubscribe = onSnapshot(likeRef, (snap) => {
      if (!pendingRef.current) {
        setIsLiked(snap.exists());
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [user, postId]);

  // 누른 사람 목록 — 규칙상 로그인 사용자만 likes 서브컬렉션을 읽을 수 있어(비로그인은 카운트만).
  // 실시간 구독 대신 진입 시 1회만 조회하고, 이후 내 토글은 낙관적으로 반영한다 —
  // 목록은 보조 정보라 read 를 아낀다(남이 누른 건 다음 진입에 반영).
  //
  // 조회는 두 번 await 하므로(서브컬렉션 → 공개 프로필) 늦게 끝난 이전 요청이 최신 상태를
  // 덮어쓸 수 있다. 세대 번호로 자기 차례가 아닌 응답은 버린다:
  //  - 게시글/사용자가 바뀐 뒤 도착한 이전 게시글의 목록 (다른 글 좋아요가 섞여 보임)
  //  - 진행 중이던 초기 조회가 토글의 낙관적 목록을 되돌리는 경우
  const likersRequestRef = useRef(0);

  const loadLikers = useCallback(async () => {
    const seq = ++likersRequestRef.current;
    // 대상이 바뀌면 이전 목록을 즉시 비운다 — 새 조회가 실패해도 남의 목록이 남지 않도록.
    setLikers([]);
    if (!user || !postId) return;

    const isStale = () => seq !== likersRequestRef.current;
    try {
      const snap = await getDocs(query(
        collection(firestore, `board_posts/${postId}/likes`),
        orderBy("createdAt", "desc"),
        limit(LIKERS_FETCH_LIMIT),
      ));
      if (isStale()) return;
      const userIds = snap.docs.map((d) => d.id);
      if (userIds.length === 0) return;

      const profiles = await getPublicUserProfiles(userIds);
      // 토글이 진행 중이면 낙관적 목록이 최신 의도 — 조회 결과로 되돌리지 않는다.
      if (isStale() || pendingRef.current) return;
      // 프로필이 없거나(탈퇴·비공개) 조회에 실패한 사람은 이름을 모르므로 아바타에서 뺀다 —
      // 전체 인원 수는 likeCount 로 표시되고, 스택은 "이름 아는 사람" 만 보여 준다.
      setLikers(userIds.flatMap((userId) => {
        const profile = profiles.get(userId);
        return profile
          ? [{ userId, nickname: profile.nickname, profileImage: profile.photoURL }]
          : [];
      }));
    } catch (err) {
      // 비로그인은 위에서 걸렀으므로, 여기서의 권한 거부는 규칙 변경·인증 이상 같은 운영
      // 문제일 수 있다 — 조용히 삼키지 않고 남긴다(화면은 카운트만으로 계속 동작).
      logClientError("useBoardLike.loadLikers", err, {
        postId,
        permissionDenied: isPermissionDeniedError(err),
      });
    }
  }, [user, postId]);

  useEffect(() => {
    void loadLikers();
  }, [loadLikers]);

  const toggleLike = async () => {
    if (!user) throw new Error(t("error.loginRequired"));

    const likeRef = doc(firestore, `board_posts/${postId}/likes`, user.uid);
    const action = isLiked ? "off" : "on";
    const previousLiked = isLiked;
    const previousCount = likeCount;
    const nextLiked = !previousLiked;
    const nextCount = Math.max(0, previousCount + (nextLiked ? 1 : -1));

    // tap 의도는 write 성공/실패와 무관하게 발사 (catch 에서 fail 별도 기록)
    track("board_like_tap", { action, post_id: postId });

    const previousLikers = likers;
    // 진행 중인 목록 조회를 무효화 — 세대를 올리지 않으면 쓰기가 끝나 pendingRef 가 풀린 뒤
    // 뒤늦게 도착한 조회 결과가 낙관적 목록을 덮어(누른 내 아바타가 사라지거나, 취소했는데
    // 다시 나타나) 실제 상태와 어긋난다.
    likersRequestRef.current += 1;
    pendingRef.current = true;
    setIsLiked(nextLiked);
    setLikeCount(nextCount);
    // 아바타도 같이 낙관적 반영 — 카운트만 움직이고 얼굴이 그대로면 어긋나 보인다.
    setLikers((list) => {
      const withoutMe = list.filter((l) => l.userId !== user.uid);
      if (!nextLiked) return withoutMe;
      return [{
        userId: user.uid,
        nickname: profile?.nickname ?? user.displayName ?? "User",
        profileImage: profile?.photoURL ?? user.photoURL ?? null,
      }, ...withoutMe];
    });

    try {
      if (previousLiked) {
        // 좋아요 취소
        await deleteDoc(likeRef);
      } else {
        // 좋아요 추가
        await setDoc(likeRef, {
          userId: user.uid,
          createdAt: Date.now()
        });
      }
    } catch (err) {
      setIsLiked(previousLiked);
      setLikeCount(previousCount);
      setLikers(previousLikers);
      track("board_like_tap_fail", {
        action,
        post_id: postId,
        err: err instanceof Error ? err.message : String(err),
      });
      logClientError("useBoardLike.toggleLike", err, { postId, action });
      throw err;
    } finally {
      pendingRef.current = false;
    }
  };

  return { isLiked, likeCount, likers, toggleLike, loading };
}
