import { useState, useEffect, useRef } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  getDoc,
  getCountFromServer,
  addDoc,
  doc,
  updateDoc,
  type QueryConstraint,
  type DocumentSnapshot,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useTranslation } from "react-i18next";
import { firestore, functions } from "../../services/firebase";
import { useAuth } from "../../contexts/AuthContext";
import type { BoardPost, BoardType } from "@shared/types";
import { logClientError } from "../../services/errorLogger";

interface SearchResult {
  posts: BoardPost[];
  total: number;
  hasMore: boolean;
}

/**
 * 전체 태그 목록 훅 (board_meta/tags 문서)
 */
export function useBoardMeta() {
  const [tags, setTags] = useState<{ name: string; count: number }[]>([]);

  useEffect(() => {
    getDoc(doc(firestore, "board_meta", "tags")).then(snap => {
      if (snap.exists()) setTags(snap.data().tags || []);
    });
  }, []);

  return { tags };
}

/**
 * 페이지 기반 게시글 목록 훅
 * keyword가 있으면 Cloud Function 검색, 없으면 Firestore 페이지 쿼리
 */
export function useBoardPosts(boardType: BoardType | 'all', pageSize = 20, tag?: string, keyword?: string, excludeAI = false, initialPage = 1) {
  const { user } = useAuth();
  // 쿼리는 "로그인 여부"에만 의존(비로그인=공개글만). user 객체는 auth init 중 레퍼런스가
  // 여러 번 바뀌어 effect 를 중복 발사(count 쿼리 N회)시키므로, 안정적인 uid 문자열을 dep 로 쓴다.
  const uid = user?.uid ?? null;
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  // 페이지별 마지막 문서 스냅샷 캐시
  const [pageLastDocs, setPageLastDocs] = useState<Map<number, DocumentSnapshot>>(new Map());

  // 총개수(count) 캐시 — 같은 필터(filterKey+로그인여부)면 effect 가 여러 번 돌아도(인증
  // 정착·리렌더 등) count 쿼리를 1회만 친다. count 는 page 와 무관(전체 개수)이라 필터별 1회로 충분.
  // refresh() 시 refreshKey 가 바뀌어 새 키 → 자동 재조회(새 글 반영).
  const countCacheRef = useRef<Map<string, number>>(new Map());

  const refresh = () => { setRefreshKey((k) => k + 1); setPage(1); };

  // 필터 변경 시 1페이지로 리셋 (실제 값 변경만 감지, strict mode 안전)
  const filterKey = `${boardType}|${tag}|${keyword}|${excludeAI}|${refreshKey}`;
  const prevFilterKey = useRef(filterKey);
  useEffect(() => {
    if (prevFilterKey.current === filterKey) return;
    prevFilterKey.current = filterKey;
    setPage(1);
    setPageLastDocs(new Map());
  }, [filterKey]);

  useEffect(() => {
    let cancelled = false;
    const trimmed = keyword?.trim() ?? "";

    if (trimmed.length > 0 || boardType === 'archive') {
      // Cloud Function 호출: 키워드 검색 또는 archive 조회
      setLoading(true);
      setError(null);
      const search = httpsCallable<
        { keyword?: string; boardType: string; tag?: string; cursor?: number; page?: number; limitCount: number },
        SearchResult
      >(functions, "searchBoardPosts");

      const params: { keyword?: string; boardType: string; tag?: string; page?: number; limitCount: number } = {
        boardType,
        tag,
        limitCount: pageSize,
      };
      if (trimmed.length > 0) params.keyword = trimmed;
      if (boardType === 'archive') params.page = page;

      search(params)
        .then((result) => {
          if (cancelled) return;
          setPosts(result.data.posts);
          setTotal(result.data.total);
          setTotalPages(Math.max(1, Math.ceil(result.data.total / pageSize)));
        })
        .catch((err) => {
          if (cancelled) return;
          logClientError("board:search", err, { boardType, tag, keyword });
          setError(err as Error);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => { cancelled = true; };
    } else {
      // Firestore 페이지 쿼리
      const baseConstraints: QueryConstraint[] = [];

      // 공개 게시글만 목록 조회 — 로그인 여부 무관 항상 isPrivate==false.
      // board_posts read 규칙은 공개 글 또는 작성자 본인 열람만 허용한다.
      // list 쿼리는 쿼리 제약만으로 전 doc 의 가독을 보장해야 한다. 로그인 사용자가 이
      // 필터 없이 쿼리하면 비공개 글 포함 가능성 때문에 permission-denied → 캐시 없는
      // 사용자(예: 신규 iPhone)는 커뮤니티가 통째로 안 뜬다(2026-06 실장애). 비공개 글
      // (본인 문의 등)은 별도 owner 쿼리 경로가 필요(후속).
      baseConstraints.push(where("isPrivate", "==", false));

      if (boardType !== 'all') {
        baseConstraints.push(where("boardType", "==", boardType));
      }
      if (tag) {
        baseConstraints.push(where("tags", "array-contains", tag));
      }
      if (excludeAI) {
        baseConstraints.push(where("sourceSite", "==", null));
      }
      baseConstraints.push(where("deletedAt", "==", null));

      setLoading(true);
      setError(null);

      const fetchPage = async () => {
        // 총 개수(페이지네이션 "N개" 라벨용)는 글 렌더에 불필요 → 비차단으로 발사한다.
        // 목록 쿼리가 count 왕복을 기다리지 않아 콘텐츠가 더 빨리 뜬다(전: count→목록 순차 2왕복).
        // count 실패는 라벨에만 영향이라 무시.
        const countKey = `${boardType}|${tag}|${keyword}|${excludeAI}|${refreshKey}|${uid ? "1" : "0"}`;
        const cachedCount = countCacheRef.current.get(countKey);
        if (cachedCount !== undefined) {
          // 같은 필터 — 캐시된 총개수 사용, 네트워크 count 생략(중복 발사 제거).
          setTotal(cachedCount);
          setTotalPages(Math.max(1, Math.ceil(cachedCount / pageSize)));
        } else {
          getCountFromServer(query(collection(firestore, "board_posts"), ...baseConstraints))
            .then((countSnap) => {
              const totalCount = countSnap.data().count;
              countCacheRef.current.set(countKey, totalCount);
              if (cancelled) return;
              setTotal(totalCount);
              setTotalPages(Math.max(1, Math.ceil(totalCount / pageSize)));
            })
            .catch(() => { /* 라벨용 count 실패는 목록과 무관 — 무시 */ });
        }

        try {
          // 페이지 쿼리 (실제 콘텐츠)
          const pageConstraints: QueryConstraint[] = [
            ...baseConstraints,
            orderBy("createdAt", "desc"),
          ];

          if (page === 1) {
            pageConstraints.push(limit(pageSize));
          } else {
            const lastDoc = pageLastDocs.get(page - 1);
            if (lastDoc) {
              pageConstraints.push(startAfter(lastDoc), limit(pageSize));
            } else {
              // 캐시 없으면 offset 스킵 (앞 페이지 건너뛸 때)
              const skipCount = (page - 1) * pageSize;
              const skipSnap = await getDocs(
                query(collection(firestore, "board_posts"), ...baseConstraints, orderBy("createdAt", "desc"), limit(skipCount))
              );
              if (cancelled) return;
              const lastVisible = skipSnap.docs[skipSnap.docs.length - 1];
              if (lastVisible) {
                pageConstraints.push(startAfter(lastVisible), limit(pageSize));
              } else {
                pageConstraints.push(limit(pageSize));
              }
            }
          }

          const snap = await getDocs(query(collection(firestore, "board_posts"), ...pageConstraints));
          if (cancelled) return;

          const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as BoardPost));
          setPosts(items);

          // 스냅샷 캐시 저장
          if (snap.docs.length > 0) {
            setPageLastDocs(prev => new Map(prev).set(page, snap.docs[snap.docs.length - 1]!));
          }
        } catch (err) {
          if (cancelled) return;
          logClientError("board:list", err, { boardType, tag, excludeAI, page });
          setError(err as Error);
        } finally {
          if (!cancelled) setLoading(false);
        }
      };

      fetchPage();
      return () => { cancelled = true; };
    }
  }, [boardType, pageSize, tag, keyword, excludeAI, refreshKey, page, uid]);

  const goToPage = (p: number) => {
    if (p >= 1 && p <= totalPages) setPage(p);
  };

  return { posts, loading, error, total, page, totalPages, goToPage, refresh };
}

/**
 * 게시글 작성을 위한 훅
 */
export function useCreatePost() {
  const { t } = useTranslation("board");
  const { user, profile } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const createPost = async (data: {
    boardType: BoardType;
    title: string;
    content: string;
    activityId?: string | null;
    tags?: string[];
    imageUrls?: string[];
    feedbackType?: string | null;
    isPrivate?: boolean;
  }): Promise<string> => {
    if (!user) throw new Error(t("error.loginRequired"));

    setSubmitting(true);
    try {
      const postData = {
        ...data,
        userId: user.uid,
        nickname: profile?.nickname || user.displayName || "익명",
        profileImage: profile?.photoURL || user.photoURL || null,
        activityId: data.activityId || null,
        tags: data.tags || [],
        imageUrls: data.imageUrls || [],
        sourceSite: null,
        feedbackType: data.feedbackType || null,
        isPrivate: data.isPrivate || false,
        viewCount: 0,
        likeCount: 0,
        commentCount: 0,
        pinned: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
      };

      const docRef = await addDoc(collection(firestore, "board_posts"), postData);
      return docRef.id;
    } finally {
      setSubmitting(false);
    }
  };

  return { createPost, submitting };
}

/**
 * 게시글 삭제(soft delete)를 위한 훅
 */
export function useDeletePost() {
  const [deleting, setDeleting] = useState(false);

  const deletePost = async (postId: string) => {
    setDeleting(true);
    try {
      const postRef = doc(firestore, "board_posts", postId);
      await updateDoc(postRef, { deletedAt: Date.now() });
    } finally {
      setDeleting(false);
    }
  };

  return { deletePost, deleting };
}

/**
 * 게시글 복구(soft delete 취소)를 위한 훅
 */
export function useRestorePost() {
  const [restoring, setRestoring] = useState(false);

  const restorePost = async (postId: string) => {
    setRestoring(true);
    try {
      const postRef = doc(firestore, "board_posts", postId);
      await updateDoc(postRef, { deletedAt: null });
    } finally {
      setRestoring(false);
    }
  };

  return { restorePost, restoring };
}
