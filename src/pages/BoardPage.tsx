import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import { useBoardPosts, useBoardMeta, useDeletePost } from '../features/board/useBoard';
import { useAuth } from '../contexts/AuthContext';
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/redesign';
import type { BoardType } from '@shared/types';
import { Button, Card } from "../theme/components";
import { useMobile } from "../hooks/useMobile";

const BoardPage: React.FC = () => {
  const { t } = useTranslation("board");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialBoard = searchParams.get('type') === 'inquiry' ? 'inquiry' : searchParams.get('type') === 'devlog' ? 'devlog' : 'all';
  const [selectedBoard, setSelectedBoard] = useState<BoardType | 'all'>(initialBoard);

  const selectBoard = (type: BoardType | 'all') => {
    setSelectedBoard(type);
    setActiveTag(undefined);
    sessionStorage.removeItem('board-scroll');
    if (type === 'all') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ type }, { replace: true });
    }
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | undefined>();


  const [uncheckedTags, setUncheckedTags] = useState<Set<string>>(new Set());
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const excludeAI = uncheckedTags.has('AI');

  const { tags: allTags } = useBoardMeta();
  // 상위 30개만 패널에 표시
  const panelTags = allTags.slice(0, 30);

  const urlPage = Number(searchParams.get('page')) || 1;
  const { posts, loading, error, total, page, totalPages, goToPage: rawGoToPage, refresh } = useBoardPosts(selectedBoard, 20, activeTag, submittedQuery, excludeAI, urlPage);

  // 페이지 변경 시 URL에 반영
  const goToPage = (p: number) => {
    rawGoToPage(p);
    const params: Record<string, string> = {};
    const type = searchParams.get('type');
    if (type) params.type = type;
    if (p > 1) params.page = String(p);
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

  // AI 외 태그는 클라이언트 사이드 제외 필터
  const clientExcluded = new Set([...uncheckedTags].filter(t => t !== 'AI'));
  const displayedPosts = clientExcluded.size > 0
    ? posts.filter(p => !p.tags?.some(tag => clientExcluded.has(tag)))
    : posts;

  const toggleTag = (name: string) => {
    setUncheckedTags(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleSearch = () => setSubmittedQuery(searchQuery.trim());
  const { user } = useAuth();
  const { deletePost, deleting } = useDeletePost();
  const isMobile = useMobile();

  const handleDeletePost = async (e: React.MouseEvent, postId: string, postUserId: string) => {
    e.stopPropagation();
    if (postUserId !== user?.uid) return;
    if (!window.confirm(t("message.deleteConfirm", { label: t("message.deleteLabel") }))) return;
    try {
      await deletePost(postId);
      refresh();
    } catch {
      alert(t("message.postDeleteFailed"));
    }
  };

  return (
    <div className="space-y-6">
      <div className="md:sticky md:top-0 z-20 bg-[var(--bg-0)] pb-2 md:pb-4 mb-1 md:mb-2 space-y-2 md:space-y-4 border-b border-[var(--line-soft)]">
        {/* 제목+글쓰기 행 — 모바일에선 제목이 숨겨져 글쓰기만 외톨이로 남으므로 행 전체를 숨기고,
            글쓰기는 아래 탭 줄 우측으로 옮긴다(아래 참조). 데스크톱은 그대로 표시. */}
        <div className="hidden md:flex items-center justify-between">
          <div>
            <h1 className="text-[length:var(--fs-2xl)] font-bold">{t("page.communityTitle")}</h1>
            <p className="text-[var(--ink-3)] text-[length:var(--fs-sm)] mt-1">
              {t("page.communitySubtitle")}
            </p>
          </div>
          {selectedBoard !== 'devlog' && (
            <Button
              onClick={() => navigate(selectedBoard === 'inquiry' ? '/board/write?type=inquiry' : '/board/write')} variant="secondary" className="px-4 py-2 text-[length:var(--fs-sm)] font-medium whitespace-nowrap"
            >
              {selectedBoard === 'inquiry' ? t("label.writingForm") : t("label.writingPost")}
            </Button>
          )}
        </div>

        {/* Search + Tabs */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="relative flex-1 flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-3)]">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                placeholder={t("placeholder.search")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSearch(); }}
                className="w-full pl-9 pr-3 py-1.5 sm:py-2 text-[length:var(--fs-sm)] rounded-[var(--r-lg)] focus:outline-none focus:ring-2 focus:ring-[var(--lime)] focus:border-transparent"
                style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--ink-1)' }}
              />
            </div>
            {/* 검색 버튼은 데스크톱만 — 모바일은 Enter 로 검색하고 그 자리에 글쓰기를 둔다.
                .ds-btn 의 display:inline-flex 가 Tailwind .hidden 을 소스순서로 이기므로
                버튼에 직접 hidden 을 못 줌 → wrapper div 로 반응형 표시 제어. */}
            <div className="hidden md:flex">
              <Button
                onClick={handleSearch}
                disabled={!searchQuery.trim()} variant="secondary" className="px-4 py-2 text-[length:var(--fs-sm)] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t("button.search")}
              </Button>
            </div>
            {submittedQuery && (
              <button
                onClick={() => { setSearchQuery(''); setSubmittedQuery(''); }}
                className="p-2 text-[var(--ink-3)] hover:text-[var(--ink-1)] rounded-[var(--r-lg)] hover:bg-[var(--bg-2)] transition-colors"
                title={t("button.searchReset")}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            {/* 모바일 전용 글쓰기 — 검색줄 우측(최상단). 데스크톱은 상단 제목 행에 있음.
                wrapper div 로 md:hidden (위 .ds-btn 우선순위 이슈 동일). */}
            {selectedBoard !== 'devlog' && (
              <div className="md:hidden shrink-0">
                <Button
                  onClick={() => navigate(selectedBoard === 'inquiry' ? '/board/write?type=inquiry' : '/board/write')} variant="secondary" className="px-3 py-1.5 text-[length:var(--fs-sm)] font-medium whitespace-nowrap"
                >
                  {selectedBoard === 'inquiry' ? t("label.writingForm") : t("label.writingPost")}
                </Button>
              </div>
            )}
          </div>
          <div className="flex gap-1">
            {(['all', 'devlog', 'inquiry', 'archive'] as const).map((type) => (
              <button
                key={type}
                onClick={() => selectBoard(type)}
                className={`px-2.5 py-1.5 sm:px-3 sm:py-2 text-[length:var(--fs-sm)] rounded-[var(--r-lg)] font-medium transition-colors whitespace-nowrap ${
                  selectedBoard === type && !activeTag
                    ? "ds-btn ds-btn--md"
                    : "border text-[var(--ink-2)] hover:text-[var(--ink-1)] hover:bg-[var(--bg-2)]"
                }`}
                style={selectedBoard === type && !activeTag ? {} : { background: 'var(--bg-1)', borderColor: 'var(--line-soft)' }}
              >
                {type === 'all' ? t("tab.all") : type === 'devlog' ? t("tab.devlog") : type === 'inquiry' ? t("tab.inquiry") : t("tab.archive")}
              </button>
            ))}
          </div>
        </div>

        {/* 태그 필터 패널 */}
        {panelTags.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <button
                onClick={() => setTagsExpanded(!tagsExpanded)}
                className="flex items-center gap-1 text-[length:var(--fs-xs)] text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors"
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
              <div className="flex flex-wrap gap-1.5 items-center">
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
                    <button
                      key={name}
                      onClick={() => toggleTag(name)}
                      className={`ds-chip text-[length:var(--fs-xs)] px-2.5 py-1 rounded-full transition-colors${
                        isUnchecked ? 'opacity-40 line-through' : ''
                      }`}
                    >
                      #{name}
                    </button>
                  );
                })}
                {(uncheckedTags.size > 0 || activeTag) && (
                  <button
                    onClick={() => { setUncheckedTags(new Set()); setActiveTag(undefined); }}
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

      {/* Posts List */}
      <div className="relative z-0">
        {loading ? (
          <LoadingSkeleton kind="list" count={5} />
        ) : error ? (
          <ErrorState title={t("error.loadFailed")} description={error.message} onRetry={refresh} />
        ) : posts.length === 0 ? (
          <EmptyState
            icon="📝"
            title={submittedQuery ? t("label.noResults") : selectedBoard === "archive" ? t("label.noResultsArchive") : t("empty.noPosts")}
            description={submittedQuery ? undefined : t("label.firstAuthor")}
            actions={submittedQuery || selectedBoard === "archive" ? undefined : [{ label: t("label.writingPost"), variant: "primary", onClick: () => navigate("/board/write") }]}
          />
        ) : (
          /* 모바일: 카드 간 gap 제거, 상하 구분선만 (전폭 섹션 스타일) */
          <div className={isMobile ? "" : "space-y-3"}>
            {submittedQuery && (
              <p className="text-[length:var(--fs-sm)] text-[var(--ink-3)] mb-2">
                {t("label.searchResultsCount", { count: total })}
              </p>
            )}
            {displayedPosts.map((post) => (
              <Card
                key={post.id}
                onClick={() => {
                  const main = document.querySelector('main');
                  if (main) sessionStorage.setItem('board-scroll', String(main.scrollTop));
                  navigate(`/board/${post.id}`);
                }} padding="none" className="block p-4! md:p-6! hover:border-[var(--lime)]/50 transition-colors cursor-pointer"
                style={isMobile ? {
                  // 전폭 카드: Layout px-4(16px) 인셋 음수마진으로 상쇄, 좌우 border·radius 제거
                  margin: "0 -16px",
                  borderRadius: 0,
                  borderLeft: "none",
                  borderRight: "none",
                  borderTop: "none",
                } : { borderRadius: "var(--r-lg)" }}
              >
                <div className="flex gap-3">
                <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] px-2 py-0.5 rounded-[var(--r-sm)] font-bold uppercase ${
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
                      <span className="text-[10px] px-2 py-0.5 rounded-[var(--r-sm)] bg-[var(--amber)]/10 text-[var(--amber)] font-medium">
                        {icon} {label}
                      </span>
                    ) : null;
                  })()}
                  {post.isPrivate && (
                    <span className="text-[10px] px-2 py-0.5 rounded-[var(--r-sm)] bg-[var(--rose)]/10 text-[var(--rose)] font-medium">
                      {t("label.privatePost")}
                    </span>
                  )}
                  <span className="text-[length:var(--fs-xs)] text-[var(--ink-3)]">{new Date(post.createdAt).toLocaleDateString()}</span>
                  {post.sourceSite && (
                    <span className="text-[10px] text-[var(--ink-3)] ml-auto">{post.sourceSite}</span>
                  )}
                </div>
                <h3 className="font-semibold mb-1 text-[var(--ink-0)] line-clamp-1">{post.title}</h3>
                <p className="text-[length:var(--fs-sm)] text-[var(--ink-3)] line-clamp-2 mb-3">{post.content.replace(/[#*_~`>\-[\]()!|]/g, '').replace(/\n+/g, ' ').slice(0, 200)}</p>

                {post.tags && post.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {post.tags.map(tag => (
                      <span
                        key={tag}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTag(prev => prev === tag ? undefined : tag);
                        }}
                        className={`ds-chip text-[10px] px-1.5 py-0.5 rounded-[var(--r-sm)]${activeTag === tag ? 'ds-btn ds-btn--md' : ''}`}
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between text-[length:var(--fs-xs)] text-[var(--ink-3)]">
                  <div className="flex items-center gap-2">
                    {post.profileImage ? (
                      <img src={post.profileImage} alt="" className="w-5 h-5 rounded-full" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-[var(--bg-3)]" />
                    )}
                    <span>{post.nickname}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span>{t("label.viewCount")} {post.viewCount}</span>
                    <span>{t("label.likeCount")} {post.likeCount}</span>
                    <span>{t("label.commentCount")} {post.commentCount}</span>
                    {user && user.uid === post.userId && (
                      <button
                        onClick={(e) => handleDeletePost(e, post.id, post.userId)}
                        disabled={deleting}
                        className="text-[var(--rose)] hover:text-[var(--rose)]/70 transition-colors disabled:opacity-50"
                      >
                        {t("button.delete")}
                      </button>
                    )}
                  </div>
                </div>
              </div>{/* flex-1 min-w-0 */}
                {post.imageUrls && post.imageUrls.length > 0 && (
                  <img src={post.imageUrls[0]} alt="" referrerPolicy="no-referrer" className="w-32 h-32 rounded-[var(--r-lg)] object-cover flex-shrink-0 border border-[var(--line-soft)]" />
                )}
              </div>{/* flex gap-3 */}
            </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1 pt-4">
            <button
              onClick={() => goToPage(1)}
              disabled={page === 1}
              className="px-2 py-1.5 text-[length:var(--fs-xs)] rounded-[var(--r-sm)] border border-[var(--line-soft)] text-[var(--ink-2)] disabled:opacity-30 hover:bg-[var(--bg-2)] transition-colors"
            >
              &laquo;
            </button>
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page === 1}
              className="px-2 py-1.5 text-[length:var(--fs-xs)] rounded-[var(--r-sm)] border border-[var(--line-soft)] text-[var(--ink-2)] disabled:opacity-30 hover:bg-[var(--bg-2)] transition-colors"
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
                <button
                  key={p}
                  onClick={() => goToPage(p)}
                  className={`min-w-[32px] py-1.5 text-[length:var(--fs-xs)] rounded-[var(--r-sm)] font-medium transition-colors ${
                    p === page
                      ? 'ds-btn ds-btn--md'
                      : 'border border-[var(--line-soft)] text-[var(--ink-2)] hover:bg-[var(--bg-2)]'
                  }`}
                >
                  {p}
                </button>
              ));
            })()}
            <button
              onClick={() => goToPage(page + 1)}
              disabled={page === totalPages}
              className="px-2 py-1.5 text-[length:var(--fs-xs)] rounded-[var(--r-sm)] border border-[var(--line-soft)] text-[var(--ink-2)] disabled:opacity-30 hover:bg-[var(--bg-2)] transition-colors"
            >
              &rsaquo;
            </button>
            <button
              onClick={() => goToPage(totalPages)}
              disabled={page === totalPages}
              className="px-2 py-1.5 text-[length:var(--fs-xs)] rounded-[var(--r-sm)] border border-[var(--line-soft)] text-[var(--ink-2)] disabled:opacity-30 hover:bg-[var(--bg-2)] transition-colors"
            >
              &raquo;
            </button>
          </div>
        )}
      </div>

    </div>
  );
};

export default BoardPage;
