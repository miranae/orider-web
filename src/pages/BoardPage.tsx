import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import { useBoardPosts, useBoardMeta, useDeletePost, useMyInquiryPosts } from '../features/board/useBoard';
import { useAuth } from '../contexts/AuthContext';
import { useDialog } from '../contexts/DialogContext';
import { useToast } from '../contexts/ToastContext';
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/redesign';
import type { BoardType } from '@shared/types';
import { Button, Card, Chip } from "../theme/components";
import { useMobile } from "../hooks/useMobile";
import SafeImage from "../components/SafeImage";
import { useBoardBlocks } from "../features/board/useBoardBlocks";
import { BoardImage } from "../features/board/BoardImage";
import { LocalizedLink } from "../components/LocalizedLink";
import "./BoardList.css";

/**
 * 체크 해제된 태그로부터 실제 제외 집합과 "총개수 보정이 필요한 태그 수"를 계산한다.
 * - 활성 태그(activeTag)는 스스로를 제외할 수 없다 — #AI 태그로 진입하면 AI 글이 보여야 한다.
 * - AI 는 Firestore 목록 경로에서만 서버가 거른다(sourceSite==null) — 그때는 총개수·페이지네이션이
 *   정확하므로 보정 대상에서 뺀다. "수집 글 ⟺ AI 태그" 는 크롤러(upload.js·tag_posts.js)와
 *   Firestore rules(사용자 쓰기의 AI 태그 금지)가 함께 보장한다 — orider-g1-web#2077.
 *   검색 경로(CF)는 아직 제외를 적용하지 않으므로(orider-g1-web#2086 배포 대기) AI 도 보정 대상이다.
 * - 나머지 태그는 서버가 거르지 못해(Firestore 에 array-not-contains 없음) 현재 페이지 안에서만
 *   걸러지므로, 총개수를 표시 건수로 낮춘다.
 */
export function getTagExclusion({
  uncheckedTags,
  activeTag,
  serverFiltersAiTag,
}: {
  uncheckedTags: Set<string>;
  activeTag?: string;
  serverFiltersAiTag: boolean;
}): { clientExcluded: Set<string>; clientOnlyExcludedCount: number } {
  const clientExcluded = new Set([...uncheckedTags].filter(t => t !== activeTag));
  const clientOnlyExcludedCount = [...clientExcluded]
    .filter(t => !(serverFiltersAiTag && t === 'AI'))
    .length;
  return { clientExcluded, clientOnlyExcludedCount };
}

/**
 * 목록 위에 표시할 "N개" — 클라이언트에서 거른 태그가 있으면 서버 총개수는 제외 전 값이라
 * 쓸 수 없다(검색 결과도 마찬가지). 그때는 화면에 실제로 남은 건수를 쓴다.
 */
export function getEffectiveListTotal({
  clientExcludedCount,
  displayedCount,
  listTotal,
}: {
  clientExcludedCount: number;
  displayedCount: number;
  listTotal: number;
}): number {
  if (clientExcludedCount > 0) return displayedCount;
  return listTotal;
}

const BoardPage: React.FC = () => {
  const { t, i18n } = useTranslation("board");
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const boardType = searchParams.get('type');
  const selectedBoard: BoardType | 'all' = boardType === 'inquiry' || boardType === 'devlog' || boardType === 'archive' ? boardType : 'all';
  const submittedQuery = searchParams.get('q') || '';
  const activeTag = searchParams.get('tag') || undefined;
  const [searchQuery, setSearchQuery] = useState(submittedQuery);
  useEffect(() => { setSearchQuery(submittedQuery); }, [submittedQuery]);
  const uncheckedTags = new Set(searchParams.getAll('exclude'));
  const updateFilters = (updates: Record<string, string | undefined>, excluded?: Set<string>) => {
    const params = new URLSearchParams(searchParams);
    params.delete('page');
    ['submitted', 'status', 'private', 'feedback'].forEach(key => params.delete(key));
    Object.entries(updates).forEach(([key, value]) => { if (value) params.set(key, value); else params.delete(key); });
    if (excluded) { params.delete('exclude'); excluded.forEach(tag => params.append('exclude', tag)); }
    sessionStorage.removeItem('board-scroll');
    setSearchParams(params);
  };
  const setActiveTag = (value: string | undefined | ((previous: string | undefined) => string | undefined)) => {
    updateFilters({ tag: typeof value === 'function' ? value(activeTag) : value });
  };
  const selectBoard = (type: BoardType | 'all') => updateFilters({ type: type === 'all' ? undefined : type, view: undefined, tag: undefined });
  const [tagsExpanded, setTagsExpanded] = useState(false);
  // 제외 태그는 모두 같은 기준(글의 tags)으로 걸러낸다 — 칩 이름과 실제 필터가 어긋나지 않게.
  const { clientExcluded, clientOnlyExcludedCount } = getTagExclusion({
    uncheckedTags,
    activeTag,
    // 검색 경로는 CF 가 제외를 적용하지 않는다 — 그때는 AI 도 클라이언트 보정 대상.
    serverFiltersAiTag: !submittedQuery,
  });
  const excludeTags = [...clientExcluded];

  const { tags: allTags } = useBoardMeta();
  // 상위 30개만 패널에 표시
  const panelTags = allTags.slice(0, 30);

  const isMyPosts = searchParams.get("view") === "mine";
  const pageParam = Number(searchParams.get('page'));
  const urlPage = Number.isSafeInteger(pageParam) && pageParam > 0 ? pageParam : 1;
  const { posts, loading, error, total, page, totalPages, goToPage: rawGoToPage, refresh } = useBoardPosts(selectedBoard, 20, activeTag, submittedQuery, excludeTags, urlPage, isMyPosts);
  const isMyInquiryView = selectedBoard === 'inquiry' && searchParams.get('view') === 'my';
  const submittedPostId = searchParams.get('submitted');
  const submittedStatus = searchParams.get('status') || 'new';
  const submittedPrivate = searchParams.get('private') === '1';
  const submittedFeedbackType = searchParams.get('feedback');
  const { posts: myInquiryPosts, loading: myInquiryLoading, error: myInquiryError, refresh: refreshMyInquiries } = useMyInquiryPosts(100);
  const { blockedUsers, loading: blocksLoading, error: blocksError, retry: retryBlocks, unblock, pending: unblockPending } = useBoardBlocks();
  const blockedIds = new Set(blockedUsers.map(item => item.targetUid));
  const listPosts = (isMyInquiryView ? myInquiryPosts : posts).filter(post => !blockedIds.has(post.userId));
  const listLoading = blocksLoading || (isMyInquiryView ? myInquiryLoading : loading);
  const listError = blocksError || (isMyInquiryView ? myInquiryError : error);
  const listTotal = isMyInquiryView ? myInquiryPosts.length : total;

  const goToPage = (p: number) => {
    rawGoToPage(p);
    const params = new URLSearchParams(searchParams);
    if (p > 1) params.set('page', String(p)); else params.delete('page');
    setSearchParams(params);
  };
  const setInquiryView = (view: 'all' | 'my') => updateFilters({ type: 'inquiry', view: view === 'my' ? 'my' : undefined, q: undefined, tag: undefined });
  const dismissSubmitConfirmation = () => {
    const params = new URLSearchParams(searchParams);
    ['submitted', 'status', 'private', 'feedback'].forEach(key => params.delete(key));
    setSearchParams(params, { replace: true });
  };

  // 게시글 로딩 완료 후 스크롤 복원
  const scrollRestoredRef = useRef(false);
  useEffect(() => {
    if (loading || scrollRestoredRef.current) return;
    scrollRestoredRef.current = true;
    const saved = sessionStorage.getItem('board-scroll');
    if (!saved || saved === '0') return;
    sessionStorage.removeItem('board-scroll');
    const main = document.querySelector('main');
    if (main) setTimeout(() => { main.scrollTop = Number(saved); }, 50);
  }, [loading]);

  // 서버가 이미 거른 뒤에도 한 번 더 확인한다 — 검색 CF 배포 전이거나(구버전 응답)
  // Firestore 경로에서 sourceSite 사전 축소를 통과한 글이 있으면 여기서 걸린다.
  const displayedPosts = clientExcluded.size > 0 && !isMyInquiryView && !isMyPosts
    ? listPosts.filter(p => !p.tags?.some(tag => clientExcluded.has(tag)))
    : listPosts;
  const filteredOutAllPosts = listPosts.length > 0 && displayedPosts.length === 0;
  const hasActiveFilters = Boolean(submittedQuery || activeTag || uncheckedTags.size);
  const effectiveListTotal = getEffectiveListTotal({
    clientExcludedCount: clientOnlyExcludedCount,
    displayedCount: displayedPosts.length,
    listTotal,
  });

  const toggleTag = (name: string) => {
    const next = new Set(uncheckedTags);
    if (next.has(name)) next.delete(name); else next.add(name);
    updateFilters({}, next);
  };
  const handleSearch = () => updateFilters({ q: searchQuery.trim() || undefined });
  const { user } = useAuth();
  const dialog = useDialog();
  const { showToast } = useToast();
  const { deletePost, deleting } = useDeletePost();
  const isMobile = useMobile();

  // 카드 ⋯ 메뉴 (#401): 위험 동작(삭제)을 카드에 상시 노출하는 대신 overflow 메뉴로 이동
  const [cardMenuOpenId, setCardMenuOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (!cardMenuOpenId) return;
    const close = () => setCardMenuOpenId(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCardMenuOpenId(null); };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [cardMenuOpenId]);

  const handleDeletePost = async (e: React.MouseEvent, postId: string, postUserId: string) => {
    e.stopPropagation();
    if (postUserId !== user?.uid) return;
    if (!(await dialog.confirm(t("message.deleteConfirm", { label: t("message.deleteLabel") }), { destructive: true }))) return;
    try {
      await deletePost(postId);
      updateFilters({});
      refresh();
      retryBlocks();
    } catch {
      void dialog.alert(t("message.postDeleteFailed"), { variant: "danger" });
    }
  };

  return (
    <div className="board-list space-y-6">
      {blockedUsers.length > 0 && <Card className="p-3 flex flex-wrap gap-2 items-center">
        <span>{t('block.listHint', { count: blockedUsers.length })}</span>
        {blockedUsers.map(item => <Button key={item.id} size="sm" disabled={unblockPending} onClick={() => { void unblock(item.targetUid).catch(() => { showToast(t('block.failed'), 'error'); }); }}>{t('block.unblock')} ({posts.find(post => post.userId === item.targetUid)?.nickname || item.targetUid})</Button>)}
      </Card>}
      <div className="md:sticky md:top-0 z-20 bg-[var(--bg-0)] pb-2 md:pb-4 mb-1 md:mb-2 space-y-2 md:space-y-4 border-b border-[var(--line-soft)]">
        {/* 제목과 주요 동작은 모든 화면에서 같은 순서로 표시한다. */}
        <div className="board-list-header">
          <div>
            <h1 data-testid="M2-0" className="text-[length:var(--fs-2xl)] font-bold">{t("page.communityTitle")}</h1>
            <p className="text-[var(--ink-3)] text-[length:var(--fs-sm)] mt-1">
              {t("page.communitySubtitle")}
            </p>
          </div>
          {selectedBoard !== 'devlog' && (
            <Button data-testid="M2-0-2"
              onClick={() => navigate(selectedBoard === 'inquiry' ? '/community/board/write?type=inquiry' : '/community/board/write')} variant="primary" className="px-4 py-2 text-[length:var(--fs-sm)] font-medium whitespace-nowrap"
            >
              {selectedBoard === 'inquiry' ? t("label.writingForm") : t("label.writingPost")}
            </Button>
          )}
        </div>

        {/* Search + Tabs */}
        <div className="board-list-controls">
          <div className="board-list-search">
            <div data-testid="M2-1" className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-3)]">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input data-testid="M2-1-1"
                type="search"
                aria-label={t("placeholder.search")}
                disabled={isMyPosts || isMyInquiryView}
                placeholder={t("placeholder.search")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSearch(); }}
                className="w-full min-h-[44px] pl-9 pr-3 py-1.5 sm:py-2 text-[length:var(--fs-sm)] rounded-[var(--r-lg)] focus:outline-none focus:ring-2 focus:ring-[var(--lime)] focus:border-transparent"
                style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--ink-1)' }}
              />
            </div>

            <div className="flex">
              <Button
                onClick={handleSearch}
                disabled={isMyPosts || isMyInquiryView || !searchQuery.trim()} variant="secondary" className="px-4 py-2 text-[length:var(--fs-sm)] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t("button.search")}
              </Button>
            </div>
            {submittedQuery && (
              <button
                onClick={() => { setSearchQuery(''); updateFilters({ q: undefined }); }}
                className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--ink-3)] hover:text-[var(--ink-1)] rounded-[var(--r-lg)] hover:bg-[var(--bg-2)] transition-colors"
                title={t("button.searchReset")}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}

          </div>
          <div className="board-list-tabs">
            {user && <Button data-testid="M2-1-2" size="sm" aria-pressed={isMyPosts} onClick={() => updateFilters({ view: isMyPosts ? undefined : "mine", type: undefined, q: undefined, tag: undefined }, new Set())}>{t("tab.mine")}</Button>}
            {(isMyPosts ? [] : ['all', 'devlog', 'inquiry', 'archive'] as const).map((type) => (
              <Button data-testid="M2-0-1"
                key={type}
                onClick={() => selectBoard(type)}
                variant={selectedBoard === type ? "outline" : "secondary"}
                size="sm"
                aria-pressed={selectedBoard === type}
                className="min-h-[44px] whitespace-nowrap"
              >
                {type === 'all' ? t("tab.all") : type === 'devlog' ? t("tab.devlog") : type === 'inquiry' ? t("tab.inquiry") : t("tab.archive")}
              </Button>
            ))}
          </div>
        </div>

        {/* 태그 필터 패널 */}
        {!isMyPosts && !isMyInquiryView && panelTags.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <button
                aria-expanded={tagsExpanded}
                aria-controls="board-tag-exclusions"
                onClick={() => setTagsExpanded(!tagsExpanded)}
                className="flex min-h-[44px] items-center gap-1 text-[length:var(--fs-xs)] text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors"
              >
                <svg className={`w-3.5 h-3.5 transition-transform ${tagsExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                {t("label.tagFilterCount", { count: panelTags.length })}
              </button>
              {/* 접혀있을 때도 activeTag 칩은 표시 */}
              {!tagsExpanded && activeTag && (
                <Button
                  onClick={() => setActiveTag(undefined)} variant="secondary" className="flex items-center gap-1 text-[length:var(--fs-xs)] px-2.5 py-1 rounded-full"
                >
                  #{activeTag}
                  <span className="font-bold">✕</span>
                </Button>
              )}
              {!tagsExpanded && uncheckedTags.size > 0 && (
                <span className="text-[length:var(--fs-xs)] text-[var(--ink-3)]">{t("label.excluded", { count: uncheckedTags.size })}</span>
              )}
            </div>
            {tagsExpanded && (
              <div id="board-tag-exclusions" className="flex flex-wrap gap-1.5 items-center">
                <p className="board-list-filter-hint">{t("label.tagExclusionHint")}</p>
                {/* 게시글 카드에서 선택한 태그 표시 */}
                {activeTag && (
                  <Button
                    onClick={() => setActiveTag(undefined)} variant="secondary" className="flex items-center gap-1 text-[length:var(--fs-xs)] px-2.5 py-1 rounded-full"
                  >
                    #{activeTag}
                    <span className="font-bold">✕</span>
                  </Button>
                )}
                {panelTags.map(({ name }) => {
                  if (name === activeTag) return null; // 상단 칩에서 이미 표시
                  const isUnchecked = uncheckedTags.has(name);
                  return (
                    <Chip
                      key={name}
                      selectable
                      aria-pressed={isUnchecked}
                      aria-label={t("label.excludeTag", { tag: name })}
                      onClick={() => toggleTag(name)}
                      className={`text-[length:var(--fs-xs)] px-2.5 py-1 rounded-full transition-colors ${isUnchecked ? 'opacity-40 line-through' : ''}`}
                    >
                      #{name}
                    </Chip>
                  );
                })}
                {(uncheckedTags.size > 0 || activeTag) && (
                  <button
                    onClick={() => updateFilters({ tag: undefined }, new Set())}
                    className="text-[length:var(--fs-xs)] px-2.5 py-1 rounded-full border border-[var(--lime)] text-[var(--lime)] hover:bg-[var(--lime)]/10 transition-colors"
                  >
                    {t("label.filterReset")}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Posts List — 공통 셸 너비를 채우고 xl 에서 인기 태그 사이드바와 2열 구성 */}
      <div className="relative z-0 xl:flex xl:gap-6">
      <div className="min-w-0 w-full xl:flex-1">
        {submittedPostId && selectedBoard === 'inquiry' && (
          <Card padding="none" className="mb-4 p-4! md:p-5! rounded-[var(--r-lg)] border-[var(--lime)]/40">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[length:var(--fs-sm)] font-bold text-[var(--lime)] mb-1">
                  {t("inquiry.confirmation.title")}
                </div>
                <div className="text-[length:var(--fs-sm)] text-[var(--ink-1)] leading-relaxed">
                  {t("inquiry.confirmation.body")}
                </div>
                <div className="grid sm:grid-cols-4 gap-2 mt-3 text-[length:var(--fs-xs)]">
                  <span className="rounded-[var(--r-sm)] bg-[var(--bg-2)] px-2 py-1">
                    {t("inquiry.confirmation.type")}: {submittedFeedbackType ? t(`label.feedbackTypes.${submittedFeedbackType}` as any) : t("label.feedbackTypes.other")}
                  </span>
                  <span className="rounded-[var(--r-sm)] bg-[var(--bg-2)] px-2 py-1">
                    {t("inquiry.confirmation.visibility")}: {submittedPrivate ? t("label.privatePost") : t("inquiry.public")}
                  </span>
                  <span className="rounded-[var(--r-sm)] bg-[var(--bg-2)] px-2 py-1">
                    {t("inquiry.confirmation.receipt")}: {submittedPostId.slice(0, 8)}
                  </span>
                  <span className="rounded-[var(--r-sm)] bg-[var(--bg-2)] px-2 py-1">
                    {t("inquiry.confirmation.status")}: {t(`inquiry.status.${submittedStatus}` as any)}
                  </span>
                </div>
                {submittedPrivate && (
                  <p className="mt-2 text-[length:var(--fs-xs)] text-[var(--ink-3)]">
                    {t("inquiry.confirmation.privateHint")}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={dismissSubmitConfirmation}
                className="text-[var(--ink-3)] hover:text-[var(--ink-1)]"
                aria-label={t("button.close")}
              >
                ✕
              </button>
            </div>
          </Card>
        )}

        {selectedBoard === 'inquiry' && (
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div data-testid="M2-3" className="flex gap-1">
              <Button
                type="button"
                onClick={() => setInquiryView('all')}
                variant={!isMyInquiryView ? "outline" : "secondary"}
                size="sm"
                aria-pressed={!isMyInquiryView}
              >
                {t("inquiry.all")}
              </Button>
              <Button data-testid="M2-3-1"
                type="button"
                onClick={() => setInquiryView('my')}
                variant={isMyInquiryView ? "outline" : "secondary"}
                size="sm"
                aria-pressed={isMyInquiryView}
              >
                {t("inquiry.mine")}
              </Button>
            </div>
            {isMyInquiryView && user && (
              <button
                type="button"
                onClick={refreshMyInquiries}
                className="text-[length:var(--fs-xs)] text-[var(--ink-3)] hover:text-[var(--lime)]"
              >
                {t("button.refresh")}
              </button>
            )}
          </div>
        )}

        {(isMyInquiryView || isMyPosts) && !user ? (
          <EmptyState
            icon="🔒"
            title={t("error.loginRequired")}
            description={t("inquiry.loginDesc")}
          />
        ) : listLoading ? (
          <LoadingSkeleton kind="list" count={5} />
        ) : listError ? (
          <ErrorState title={t("error.loadFailed")} description={t("error.retryHint")} onRetry={() => { retryBlocks(); if (isMyInquiryView) refreshMyInquiries(); else { updateFilters({}); refresh(); } }} />
        ) : listPosts.length === 0 || filteredOutAllPosts ? (
          <EmptyState
            icon="📝"
            title={isMyInquiryView ? t("inquiry.emptyMine") : hasActiveFilters || filteredOutAllPosts ? t("label.noResults") : selectedBoard === "archive" ? t("label.noResultsArchive") : t("empty.noPosts")}
            description={isMyInquiryView ? t("inquiry.emptyMineDesc") : hasActiveFilters || filteredOutAllPosts ? t("label.filterEmptyHint") : t("label.firstAuthor")}
            actions={hasActiveFilters || filteredOutAllPosts ? [{ label: t("label.filterReset"), variant: "secondary", onClick: () => { setSearchQuery(''); updateFilters({ q: undefined, tag: undefined }, new Set()); } }] : selectedBoard === "archive" || selectedBoard === "devlog" ? undefined : [{ label: selectedBoard === "inquiry" ? t("label.writingForm") : t("label.writingPost"), variant: "primary", onClick: () => navigate(selectedBoard === "inquiry" ? "/community/board/write?type=inquiry" : "/community/board/write") }]}
          />
        ) : (
          /* 제목 링크와 태그·관리 동작의 클릭 영역을 분리한다. */
          <div data-testid="M2-2" className={isMobile ? "" : "space-y-3"}>
                {submittedQuery && (
              <p className="text-[length:var(--fs-sm)] text-[var(--ink-3)] mb-2">
                {t(clientOnlyExcludedCount > 0 ? "label.pageLocalResults" : "label.searchResultsCount", { count: effectiveListTotal })}
              </p>
            )}
            {displayedPosts.map((post) => (
              <Card data-testid="M2-2-1"
                key={post.id}
                padding="none" className="board-list-card block p-4! md:p-6! transition-colors"

              >
                <div className="flex gap-3">
                <div className="flex-1 min-w-0">
                <div className="board-list-meta flex items-center gap-2 mb-1">
                  <span className={`text-[length:var(--fs-xs)] px-2 py-0.5 rounded-[var(--r-sm)] font-bold uppercase ${
                    post.boardType === 'free' ? 'bg-blue-900/30 text-blue-400' :
                    post.boardType === 'hot' ? 'bg-red-900/30 text-red-400' :
                    post.boardType === 'archive' ? 'bg-amber-900/30 text-[var(--amber)]' :
                    post.boardType === 'gear' ? 'bg-purple-900/30 text-purple-400' :
                    post.boardType === 'inquiry' ? 'bg-[var(--lime)]/10 text-[var(--lime)]' :
                    post.boardType === 'devlog' ? 'bg-emerald-900/30 text-emerald-400' :
                    'bg-green-900/30 text-green-400'
                  }`}>
                    {t(`label.boardTypes.${post.boardType}`)}
                  </span>
                  {post.feedbackType && (() => {
                    const icon = t(`label.feedbackIcons.${post.feedbackType}`);
                    const label = t(`label.feedbackTypes.${post.feedbackType}`);
                    return icon && label ? (
                      <span className="text-[length:var(--fs-xs)] px-2 py-0.5 rounded-[var(--r-sm)] bg-[var(--amber)]/10 text-[var(--amber)] font-medium">
                        {icon} {label}
                      </span>
                    ) : null;
                  })()}
                  {post.isPrivate && (
                    <span className="text-[length:var(--fs-xs)] px-2 py-0.5 rounded-[var(--r-sm)] bg-[var(--rose)]/10 text-[var(--rose)] font-medium">
                      {t("label.privatePost")}
                    </span>
                  )}
                  {isMyInquiryView && post.inquiryStatus && (
                    <span className="text-[length:var(--fs-xs)] px-2 py-0.5 rounded-[var(--r-sm)] bg-[var(--aqua)]/10 text-[var(--aqua)] font-medium">
                      {t(`inquiry.status.${post.inquiryStatus}` as any)}
                    </span>
                  )}
                  <span className="text-[length:var(--fs-xs)] text-[var(--ink-3)]">{new Date(post.createdAt).toLocaleDateString(i18n.language)}</span>
                  <div className="ml-auto flex items-center gap-1">
                    {post.sourceSite && (
                      <span className="text-[length:var(--fs-xs)] text-[var(--ink-3)]">{post.sourceSite}</span>
                    )}
                    {user && user.uid === post.userId && (
                      <div className="relative -my-3 -mr-2">
                        <button
                          aria-label={t("button.more")}
                          aria-expanded={cardMenuOpenId === post.id}
                          onClick={(e) => { e.stopPropagation(); setCardMenuOpenId(prev => prev === post.id ? null : post.id); }}
                          className="flex w-[44px] h-[44px] items-center justify-center rounded-[var(--r-md)] text-[var(--ink-3)] hover:text-[var(--ink-1)] hover:bg-[var(--bg-2)] transition-colors"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
                          </svg>
                        </button>
                        {cardMenuOpenId === post.id && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-1 top-[40px] z-10 min-w-[140px] rounded-[var(--r-lg)] border border-[var(--line-soft)] bg-[var(--bg-1)] p-1 shadow-lg"
                          >
                            <button
                              onClick={(e) => { setCardMenuOpenId(null); handleDeletePost(e, post.id, post.userId); }}
                              disabled={deleting}
                              className="flex w-full min-h-[44px] items-center gap-2 rounded-[var(--r-md)] px-3 text-left text-[length:var(--fs-sm)] text-[var(--rose)] hover:bg-[var(--bg-2)] transition-colors disabled:opacity-50"
                            >
                              {t("button.delete")}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {/* 모바일에서는 메타·제목·부가 정보에 본문 전체 너비를 제공한다. */}
                <h2 className="board-list-title"><LocalizedLink to={`/community/board/${post.id}`} state={{ boardReturnTo: location.pathname + location.search }} onClick={() => {
                  const main = document.querySelector('main');
                  if (main) sessionStorage.setItem('board-scroll', String(main.scrollTop));
                }}>{post.title}</LocalizedLink></h2>
                <div className="board-list-summary">
                  <p className="text-[length:var(--fs-sm)] text-[var(--ink-3)] line-clamp-2 md:line-clamp-3">{post.content.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/[#*_~`>\-[\]()!|]/g, '').replace(/\n+/g, ' ').slice(0, 200)}</p>
                  {isMobile && post.imageUrls && post.imageUrls.length > 0 && (
                    <BoardImage src={post.imageUrls[0]} alt={t("label.thumbnail", { title: post.title })} referrerPolicy="no-referrer" className="board-list-thumbnail rounded-[var(--r-lg)] object-cover flex-shrink-0 border border-[var(--line-soft)]" loading="lazy" decoding="async" />
                  )}
                </div>

                {post.tags && post.tags.length > 0 && (() => {
                  {/* 태그는 기본 2~3개만 노출, 나머지는 +N 축약 (#401) — 전체 태그는 상세에서 */}
                  const maxTags = isMobile ? 2 : 3;
                  const shownTags = post.tags.slice(0, maxTags);
                  const hiddenCount = post.tags.length - shownTags.length;
                  return (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {shownTags.map(tag => (
                        <Chip
                          key={tag}
                          selectable
                          variant={activeTag === tag ? 'accent' : 'default'}
                          aria-pressed={activeTag === tag}
                          aria-disabled={isMyPosts || isMyInquiryView}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isMyPosts || isMyInquiryView) return;
                            setActiveTag(prev => prev === tag ? undefined : tag);
                          }}
                        >
                          #{tag}
                        </Chip>
                      ))}
                      {hiddenCount > 0 && (
                        <Chip>+{hiddenCount}</Chip>
                      )}
                    </div>
                  );
                })()}

                <div className="board-list-footer text-[length:var(--fs-xs)] text-[var(--ink-3)]">
                  <div className="flex items-center gap-2">
                    {post.profileImage ? (
                      <SafeImage src={post.profileImage} alt={post.nickname} fallbackLabel={post.nickname} className="w-5 h-5 rounded-full object-cover" loading="lazy" decoding="async" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-[var(--bg-3)]" />
                    )}
                    <span>{post.nickname}</span>
                  </div>
                  <div className="board-list-counts">
                    <span>{t("label.viewCount")} {post.viewCount.toLocaleString(i18n.language)}</span>
                    <span>{t("label.likeCount")} {post.likeCount.toLocaleString(i18n.language)}</span>
                    <span>{t("label.commentCount")} {post.commentCount.toLocaleString(i18n.language)}</span>
                    {isMyInquiryView && post.resolvedAt && (
                      <span>{t("inquiry.resolvedAt")} {new Date(post.resolvedAt).toLocaleDateString(i18n.language)}</span>
                    )}
                  </div>
                </div>
              </div>{/* flex-1 min-w-0 */}
                {!isMobile && post.imageUrls && post.imageUrls.length > 0 && (
                  <BoardImage src={post.imageUrls[0]} alt={t("label.thumbnail", { title: post.title })} referrerPolicy="no-referrer" className="board-list-thumbnail rounded-[var(--r-lg)] object-cover flex-shrink-0 border border-[var(--line-soft)]" loading="lazy" decoding="async" />
                )}
              </div>{/* flex gap-3 */}
            </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {!isMyInquiryView && totalPages > 1 && (
          <div className="board-list-pagination" aria-label={t("label.pagination")}>
            <button
              aria-label={t("label.firstPage")}
              onClick={() => goToPage(1)}
              disabled={page === 1}
              className="min-w-[44px] min-h-[44px] px-2 text-[length:var(--fs-xs)] rounded-[var(--r-sm)] border border-[var(--line-soft)] text-[var(--ink-2)] disabled:opacity-30 hover:bg-[var(--bg-2)] transition-colors"
            >
              &laquo;
            </button>
            <button
              aria-label={t("label.previousPage")}
              onClick={() => goToPage(page - 1)}
              disabled={page === 1}
              className="min-w-[44px] min-h-[44px] px-2 text-[length:var(--fs-xs)] rounded-[var(--r-sm)] border border-[var(--line-soft)] text-[var(--ink-2)] disabled:opacity-30 hover:bg-[var(--bg-2)] transition-colors"
            >
              &lsaquo;
            </button>
            {(() => {
              const pages: number[] = [];
              let start = Math.max(1, page - 2);
              const end = Math.min(totalPages, start + 4);
              if (end - start < 4) start = Math.max(1, end - 4);
              for (let i = start; i <= end; i++) pages.push(i);
              return pages.map((p) => (
                <Button
                  key={p}
                  onClick={() => goToPage(p)}
                  variant={p === page ? 'outline' : 'secondary'}
                  size="sm"
                  aria-current={p === page ? 'page' : undefined}
                  className="min-w-[44px] min-h-[44px]"
                >
                  {p}
                </Button>
              ));
            })()}
            <button
              aria-label={t("label.nextPage")}
              onClick={() => goToPage(page + 1)}
              disabled={page === totalPages}
              className="min-w-[44px] min-h-[44px] px-2 text-[length:var(--fs-xs)] rounded-[var(--r-sm)] border border-[var(--line-soft)] text-[var(--ink-2)] disabled:opacity-30 hover:bg-[var(--bg-2)] transition-colors"
            >
              &rsaquo;
            </button>
            <button
              aria-label={t("label.lastPage")}
              onClick={() => goToPage(totalPages)}
              disabled={page === totalPages}
              className="min-w-[44px] min-h-[44px] px-2 text-[length:var(--fs-xs)] rounded-[var(--r-sm)] border border-[var(--line-soft)] text-[var(--ink-2)] disabled:opacity-30 hover:bg-[var(--bg-2)] transition-colors"
            >
              &raquo;
            </button>
          </div>
        )}
      </div>

      {/* 우측 사이드바 (xl 전용) — 인기 태그로 남는 폭 활용 (#401) */}
      {!isMyPosts && !isMyInquiryView && panelTags.length > 0 && (
        <aside className="hidden xl:block xl:w-[240px] xl:flex-none">
          <Card padding="none" className="p-4!">
            <p className="text-[length:var(--fs-xs)] font-semibold uppercase tracking-widest text-[var(--ink-3)] mb-3">
              {t("label.popularTags")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {panelTags.slice(0, 12).map(({ name }) => (
                <Chip
                  key={name}
                  selectable
                  variant={activeTag === name ? 'accent' : 'default'}
                  aria-pressed={activeTag === name}
                  onClick={() => setActiveTag(prev => prev === name ? undefined : name)}
                >
                  #{name}
                </Chip>
              ))}
            </div>
          </Card>
        </aside>
      )}
      </div>

    </div>
  );
};

export default BoardPage;
