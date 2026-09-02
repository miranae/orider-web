import React, { useState } from 'react';
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useDocument, useCollection, where, orderBy } from '../hooks/useFirestore';
import { softDeleteBoardComment, useCreateComment } from '../features/board/useComment';
import { BoardCommentComposer, BoardCommentText } from '../features/board/BoardCommentUi';
import { useBoardLike } from '../features/board/useBoardLike';
import LikersAvatarStack from '../components/social/LikersAvatarStack';
import { useDeletePost, useReportBoardContent } from '../features/board/useBoard';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useDialog } from '../contexts/DialogContext';
import { firestore } from '../services/firebase';
import ActivityCard from '../components/ActivityCard';
import { EmptyState, LoadingSkeleton } from '../components/redesign';
import SafeImage from '../components/SafeImage';
import type { BoardPost, BoardComment, Activity } from '@shared/types';
import { Button, Card, Chip } from "../theme/components";
import { normalizeUserContentUrl } from "../utils/userContentUrl";
import { ReportContentModal } from "../features/board/ReportContentModal";
import { buildBoardReportPayload, type BoardReportReason } from "../features/board/reportPayload";
import { useBoardPostView } from "./useBoardPostView";

type ReportTarget =
  | { targetType: "post"; postId: string; previewTitle: string; authorNickname: string; createdAt: number }
  | { targetType: "comment"; postId: string; commentId: string; previewTitle: string; authorNickname: string; createdAt: number };

const PostDetailPage: React.FC = () => {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation("board");
  const [commentText, setCommentText] = useState('');
  const { user } = useAuth();
  const { showToast } = useToast();
  const dialog = useDialog();
  const { deletePost, deleting: postDeleting } = useDeletePost();
  const { report, submitting: reportSubmitting } = useReportBoardContent();
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const { data: post, loading: postLoading } = useDocument<BoardPost>('board_posts', postId);
  const { data: linkedActivity } = useDocument<Activity>('activities', post?.activityId || undefined);
  const { data: comments } = useCollection<BoardComment>(
    `board_posts/${postId}/comments`,
    [where('deletedAt', '==', null), orderBy('createdAt', 'asc')]
  );
  const { createComment, submitting: commentSubmitting } = useCreateComment(postId || '');
  const { isLiked, likeCount, likers, toggleLike } = useBoardLike(postId || '', post?.likeCount ?? 0);
  const safeSourceUrl = normalizeUserContentUrl(post?.sourceUrl);

  useBoardPostView(postId, user?.uid, post);

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    if (!user) {
      showToast(t("error.loginRequired"), "info");
      return;
    }
    try {
      await createComment(commentText);
      setCommentText('');
      // 댓글 목록 새로고침을 위해 snapshot이 동작하겠지만,
      // commentCount는 onSnapshot이 post에도 걸려있어 자동 갱신됩니다.
    } catch {
      showToast(t('message.commentSubmitFailed'), "error");
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!(await dialog.confirm(t('message.commentDeleteConfirm'), { destructive: true }))) return;
    try {
      await softDeleteBoardComment(postId!, commentId);
    } catch {
      showToast(t('message.commentDeleteFailed'), "error");
    }
  };

  const handleLikeToggle = async () => {
    if (!user) {
      showToast(t("error.loginRequired"), "info");
      return;
    }
    try {
      await toggleLike();
    } catch {
      showToast(t('message.likeError'), "error");
    }
  };

  const handleDeletePost = async () => {
    if (!postId) return;
    if (post?.userId !== user?.uid) return;
    if (!(await dialog.confirm(t('message.deleteConfirm', { label: t('message.deleteLabel') }), { destructive: true }))) return;
    try {
      await deletePost(postId);
      navigate('/board', { replace: true });
    } catch {
      showToast(t('message.postDeleteFailed'), "error");
    }
  };

  const openReport = (target: ReportTarget) => {
    if (!user) {
      showToast(t("report.loginRequired"), "info");
      return;
    }
    setReportTarget(target);
  };

  const handleBlockAuthor = async () => {
    if (!user || !post || user.uid === post.userId) return;
    if (!(await dialog.confirm(t("block.confirm", { nickname: post.nickname }), { destructive: true }))) return;
    try {
      const { doc, setDoc } = await import("firebase/firestore");
      await setDoc(doc(firestore, "users", user.uid, "blocked_users", post.userId), {
        userId: post.userId,
        nickname: post.nickname,
        profileImage: post.profileImage ?? null,
        createdAt: Date.now(),
      }, { merge: true });
      showToast(t("block.done", { nickname: post.nickname }));
      navigate("/board", { replace: true });
    } catch {
      showToast(t("block.failed"), "error");
    }
  };

  const handleReportSubmit = async (reason: BoardReportReason, note: string) => {
    if (!reportTarget) return;
    try {
      await report(buildBoardReportPayload({
        targetType: reportTarget.targetType,
        postId: reportTarget.postId,
        commentId: reportTarget.targetType === "comment" ? reportTarget.commentId : undefined,
        reason,
        note,
        targetPreview: {
          title: reportTarget.previewTitle,
          authorNickname: reportTarget.authorNickname,
          createdAt: reportTarget.createdAt,
        },
      }));
      setReportTarget(null);
      showToast(t("report.success"), "success");
    } catch {
      showToast(t("report.failed"), "error");
    }
  };

  if (postLoading) {
    return (
      <div className="py-6 max-w-3xl mx-auto">
        <LoadingSkeleton kind="card" />
      </div>
    );
  }
  if (!post) {
    return (
      <div className="py-16 max-w-xl mx-auto">
        <EmptyState
          icon="📝"
          title={t('label.postNotFound')}
          actions={[{ label: t('label.backToBoard'), variant: "primary", onClick: () => navigate('/board') }]}
        />
      </div>
    );
  }

  if (post.deletedAt) {
    return (
      <div className="py-16 max-w-xl mx-auto">
        <EmptyState
          icon="🗑️"
          title={t('label.deletedPostText')}
          actions={[{ label: t('label.backToBoard'), variant: "primary", onClick: () => navigate('/board') }]}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <div className="mb-4">
        <button
          onClick={() => navigate(-1)}
          className="text-[var(--ink-3)] hover:text-[var(--lime)] flex items-center gap-1 transition-colors text-[length:var(--fs-sm)] font-medium"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('label.backNav')}
        </button>
      </div>

      <Card padding="none" className="rounded-[var(--r-lg)] p-6! md:p-8!">
        <header className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="bg-[var(--lime)]/10 text-[var(--lime)] px-2 py-0.5 rounded-[var(--r-sm)] text-[length:var(--fs-xs)] font-bold uppercase">
              {t(`label.boardTypes.${post.boardType}` as any)}
            </span>
            <span className="text-[length:var(--fs-xs)] text-[var(--ink-3)]">
              {new Date(post.createdAt).toLocaleString()}
            </span>
            <span className="text-[length:var(--fs-xs)] text-[var(--ink-3)] ml-auto flex items-center gap-2">
              {t('label.views')} {post.viewCount}
              {user?.uid !== post.userId && (
                <>
                  <button
                    onClick={() => openReport({
                      targetType: "post",
                      postId: post.id,
                      previewTitle: post.title,
                      authorNickname: post.nickname,
                      createdAt: post.createdAt,
                    })}
                    className="text-[var(--ink-3)] hover:text-[var(--rose)] transition-colors"
                  >
                    {t("report.action")}
                  </button>
                  {user && (
                    <button
                      onClick={handleBlockAuthor}
                      className="text-[var(--ink-3)] hover:text-[var(--rose)] transition-colors"
                    >
                      {t("block.action")}
                    </button>
                  )}
                </>
              )}
              {user && user.uid === post.userId && (
                <button
                  onClick={handleDeletePost}
                  disabled={postDeleting}
                  className="text-[var(--rose)] hover:opacity-70 transition-colors disabled:opacity-50"
                >
                  {t('button.delete')}
                </button>
              )}
            </span>
          </div>
          <h1 className="text-[length:var(--fs-2xl)] font-bold text-[var(--ink-0)] mb-4">{post.title}</h1>
          <div className="flex items-center gap-2">
            {post.profileImage ? (
              <SafeImage src={post.profileImage} alt={post.nickname} fallbackLabel={post.nickname} className="w-8 h-8 rounded-full object-cover" loading="lazy" decoding="async" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[var(--bg-3)]" />
            )}
            <span className="text-[length:var(--fs-sm)] font-medium text-[var(--ink-1)]">{post.nickname}</span>
          </div>
        </header>

        {post.selectionReason && (
          // 카드 안 콜아웃은 테두리 없이 배경 틴트만 — surface 3단계 유지 (#401)
          <div className="mb-6 p-4 bg-[var(--lime)]/10 rounded-[var(--r-lg)]">
            <div className="text-[length:var(--fs-xs)] font-bold text-[var(--lime)] mb-1.5">{t('label.selectionReason')}</div>
            <p className="text-[length:var(--fs-sm)] text-[var(--ink-1)] leading-relaxed whitespace-pre-line">{post.selectionReason}</p>
          </div>
        )}

        {(() => {
          const standAlone = (post.imageUrls || []).filter(url => normalizeUserContentUrl(url) && !post.content.includes(url));
          return standAlone.length > 0 ? (
            <div className="flex flex-wrap gap-3 mb-6">
              {standAlone.map((url, i) => (
                <SafeImage key={i} src={url} alt={t("label.postImage", { index: i + 1 })} referrerPolicy="no-referrer" className="rounded-[var(--r-lg)] max-h-96 object-cover border border-[var(--line-soft)]" loading="lazy" decoding="async" />
              ))}
            </div>
          ) : null;
        })()}

        {/*
          prose-invert 는 다크 테마 전용 (모든 색을 흰색 계열로 invert) 인데,
          이 사이트는 라이트/다크 토글 + 시스템 선호도 둘 다 지원하므로 prose-invert 를 제거하고
          헤딩/strong/em/code 등을 CSS 변수(`--ink-*`)로 직접 색상 지정해 양쪽 테마에서 일관 표시.
        */}
        <div className="prose max-w-none mb-6 text-[var(--ink-1)] text-[length:var(--fs-sm)] leading-relaxed prose-headings:text-[var(--ink-0)] prose-strong:text-[var(--ink-0)] prose-em:text-[var(--ink-1)] prose-code:text-[var(--ink-0)] prose-blockquote:text-[var(--ink-2)] prose-blockquote:border-[var(--line)] prose-hr:border-[var(--line-soft)] prose-li:text-[var(--ink-1)] prose-a:text-[var(--lime)] prose-a:no-underline hover:prose-a:underline prose-img:rounded-[var(--r-lg)]">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ node: _node, href, children, ...props }) => {
                const safeHref = normalizeUserContentUrl(href);
                if (!safeHref) return <>{children}</>;
                return <a {...props} href={safeHref} target="_blank" rel="noopener noreferrer">{children}</a>;
              },
              img: ({ node: _node, src, ...props }) => {
                const safeSrc = normalizeUserContentUrl(src);
                if (!safeSrc) return null;
                return <SafeImage {...props} src={safeSrc} alt={props.alt || t("label.embeddedImage")} referrerPolicy="no-referrer" />;
              },
            }}
          >
            {post.content}
          </ReactMarkdown>
        </div>

        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-8">
            {post.tags.map(t => (
              <Chip key={t} className="text-[length:var(--fs-xs)] px-2 py-0.5 rounded-full">
                #{t}
              </Chip>
            ))}
          </div>
        )}

        {linkedActivity && (
          // ActivityCard 가 자체 카드 서피스 — 래퍼 카드를 없애 3중 중첩 방지 (#401)
          <div className="mb-8">
            <div className="px-1 py-2 text-[length:var(--fs-xs)] font-bold text-[var(--lime)] flex items-center gap-1">
              <span>📍</span> {t('label.linkedActivity')}
            </div>
            <ActivityCard activity={linkedActivity} />
          </div>
        )}

        {post.commentReaction && (
          <div className="mb-4 p-4 bg-[var(--aqua)]/10 rounded-[var(--r-lg)]">
            <div className="text-[length:var(--fs-xs)] font-bold text-[var(--aqua)] mb-1.5">{t('label.commentReaction')}</div>
            <p className="text-[length:var(--fs-sm)] text-[var(--ink-1)] leading-relaxed whitespace-pre-line">{post.commentReaction}</p>
          </div>
        )}

        {safeSourceUrl && (
          <div className="mb-4 flex items-center gap-2 text-[length:var(--fs-xs)] text-[var(--ink-3)]">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.02a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L5.336 9.12" />
            </svg>
            <span>{t('label.source')}</span>
            <a href={safeSourceUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--lime)] hover:underline truncate">
              {post.sourceSite ? `${post.sourceSite} ${t('label.sourceView')}` : post.sourceUrl}
            </a>
          </div>
        )}

        <div className="flex items-center gap-4 pt-6 border-t border-[var(--line-soft)]">
          <button
            onClick={handleLikeToggle}
            className={`flex items-center gap-1.5 transition-colors text-[length:var(--fs-sm)] font-medium ${
              isLiked
                ? 'text-[var(--lime)]'
                : 'text-[var(--ink-3)] hover:text-[var(--lime)]'
            }`}
          >
            <span>{isLiked ? '🧡' : '👍'}</span>
            {t('likes')} {likeCount}
          </button>

          {/* 누른 사람 아바타 스택 — hover/focus/tap 시 이름 툴팁 (활동 쿠도스와 동일 컴포넌트) */}
          <LikersAvatarStack likers={likers} totalCount={likeCount} variant="like" />
          <span className="text-[var(--ink-3)] flex items-center gap-1.5 text-[length:var(--fs-sm)] font-medium">
            <span>💬</span>
            {t('comments')} {post.commentCount}
          </span>
        </div>
      </Card>

      {/* Comments Section */}
      <section className="space-y-4 mb-10">
        <h2 className="font-bold text-[length:var(--fs-lg)] text-[var(--ink-0)] flex items-center gap-2">
          {t('comments')} <span className="text-[var(--lime)]">{comments.length}</span>
        </h2>

        {/* Comment Input */}
        {user ? (
          <BoardCommentComposer
            value={commentText}
            onChange={setCommentText}
            onSubmit={handleCommentSubmit}
            submitting={commentSubmitting}
            placeholder={t('placeholder.comment')}
            submitLabel={t('button.submit')}
          />
        ) : (
          <Card className="mb-6" padding="compact">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[length:var(--fs-sm)] text-[var(--ink-2)]">{t("comment.loginRequired")}</span>
              <Button type="button" variant="secondary" size="sm" onClick={() => navigate("/settings")}>
                {t("comment.loginAction")}
              </Button>
            </div>
          </Card>
        )}

        <div className="space-y-3">
          {comments.map((comment) => (
            <Card key={comment.id} padding="none" className="p-4! md:p-6! rounded-[var(--r-lg)]">
              <div className="flex items-center gap-2 mb-2">
                {comment.profileImage ? (
                  <SafeImage src={comment.profileImage} alt={comment.nickname} fallbackLabel={comment.nickname} className="w-5 h-5 rounded-full object-cover" loading="lazy" decoding="async" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-[var(--bg-3)]" />
                )}
                <span className="font-bold text-[length:var(--fs-sm)] text-[var(--ink-1)]">{comment.nickname}</span>
                <span className="text-[length:var(--fs-xs)] text-[var(--ink-3)]">{new Date(comment.createdAt).toLocaleString()}</span>
                {user && user.uid === comment.userId && (
                  <button
                    onClick={() => handleDeleteComment(comment.id)}
                    className="ml-auto text-[length:var(--fs-xs)] text-[var(--ink-3)] hover:text-[var(--rose)] transition-colors"
                  >
                    {t('button.delete')}
                  </button>
                )}
                {user?.uid !== comment.userId && (
                  <button
                    onClick={() => openReport({
                      targetType: "comment",
                      postId: post.id,
                      commentId: comment.id,
                      previewTitle: post.title,
                      authorNickname: comment.nickname,
                      createdAt: comment.createdAt,
                    })}
                    className={`${user && user.uid === comment.userId ? "" : "ml-auto"} text-[length:var(--fs-xs)] text-[var(--ink-3)] hover:text-[var(--rose)] transition-colors`}
                  >
                    {t("report.action")}
                  </button>
                )}
              </div>
              <BoardCommentText>{comment.text}</BoardCommentText>
            </Card>
          ))}
        </div>
      </section>
      {reportTarget && (
        <ReportContentModal
          targetType={reportTarget.targetType}
          preview={{
            title: reportTarget.previewTitle,
            authorNickname: reportTarget.authorNickname,
            createdAt: reportTarget.createdAt,
          }}
          submitting={reportSubmitting}
          onClose={() => setReportTarget(null)}
          onSubmit={handleReportSubmit}
        />
      )}
    </div>
  );
};

export default PostDetailPage;
