import React, { useState, useEffect } from 'react';
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useDocument, useCollection, where, orderBy } from '../hooks/useFirestore';
import { useCreateComment } from '../features/board/useComment';
import { useBoardLike } from '../features/board/useBoardLike';
import { useDeletePost } from '../features/board/useBoard';
import { useAuth } from '../contexts/AuthContext';
import { firestore } from '../services/firebase';
import ActivityCard from '../components/ActivityCard';
import { EmptyState, LoadingSkeleton } from '../components/redesign';
import type { BoardPost, BoardComment, Activity } from '@shared/types';
import { Button, Card, Chip } from "../theme/components";
import { normalizeUserContentUrl } from "../utils/userContentUrl";

const PostDetailPage: React.FC = () => {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation("board");
  const [commentText, setCommentText] = useState('');
  const { user } = useAuth();
  const { deletePost, deleting: postDeleting } = useDeletePost();
  const { data: post, loading: postLoading } = useDocument<BoardPost>('board_posts', postId);
  const { data: linkedActivity } = useDocument<Activity>('activities', post?.activityId || undefined);
  const { data: comments } = useCollection<BoardComment>(
    `board_posts/${postId}/comments`,
    [where('deletedAt', '==', null), orderBy('createdAt', 'asc')]
  );
  const { createComment, submitting: commentSubmitting } = useCreateComment(postId || '');
  const { isLiked, toggleLike } = useBoardLike(postId || '');
  const safeSourceUrl = normalizeUserContentUrl(post?.sourceUrl);

  useEffect(() => {
    if (!postId || postLoading || !post) return;

    // 조회수 로깅 (세션당 1회 로직 생략하고 우선 매 로드 시 증가 처리)
    const logView = async () => {
      try {
        const { doc, updateDoc, increment } = await import("firebase/firestore");
        const postRef = doc(firestore, "board_posts", postId);
        await updateDoc(postRef, {
          viewCount: increment(1)
        });
      } catch {
        // Ignore view count errors
      }
    };
    logView();
  }, [postId, postLoading]);

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    try {
      await createComment(commentText);
      setCommentText('');
      // 댓글 목록 새로고침을 위해 snapshot이 동작하겠지만,
      // commentCount는 onSnapshot이 post에도 걸려있어 자동 갱신됩니다.
    } catch {
      alert(t('message.commentSubmitFailed'));
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm(t('message.commentDeleteConfirm'))) return;
    try {
      const { doc, updateDoc, increment } = await import("firebase/firestore");
      await updateDoc(doc(firestore, `board_posts/${postId}/comments`, commentId), {
        deletedAt: Date.now()
      });
      await updateDoc(doc(firestore, "board_posts", postId!), {
        commentCount: increment(-1)
      });
    } catch {
      alert(t('message.commentDeleteFailed'));
    }
  };

  const handleLikeToggle = async () => {
    try {
      await toggleLike();
    } catch {
      alert(t('message.likeError'));
    }
  };

  const handleDeletePost = async () => {
    if (!postId) return;
    if (post?.userId !== user?.uid) return;
    if (!window.confirm(t('message.deleteConfirm', { label: t('message.deleteLabel') }))) return;
    try {
      await deletePost(postId);
      navigate('/board', { replace: true });
    } catch {
      alert(t('message.postDeleteFailed'));
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
    <div className="space-y-6">
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
            <span className="bg-[var(--lime)]/10 text-[var(--lime)] px-2 py-0.5 rounded-[var(--r-sm)] text-[10px] font-bold uppercase">
              {t(`label.boardTypes.${post.boardType}` as any)}
            </span>
            <span className="text-[length:var(--fs-xs)] text-[var(--ink-3)]">
              {new Date(post.createdAt).toLocaleString()}
            </span>
            <span className="text-[length:var(--fs-xs)] text-[var(--ink-3)] ml-auto flex items-center gap-2">
              {t('label.views')} {post.viewCount}
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
              <img src={post.profileImage} alt="" className="w-8 h-8 rounded-full" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[var(--bg-3)]" />
            )}
            <span className="text-[length:var(--fs-sm)] font-medium text-[var(--ink-1)]">{post.nickname}</span>
          </div>
        </header>

        {post.selectionReason && (
          <div className="mb-6 p-4 bg-[var(--lime)]/10 border border-[var(--lime)]/30 rounded-[var(--r-lg)]">
            <div className="text-[length:var(--fs-xs)] font-bold text-[var(--lime)] mb-1.5">{t('label.selectionReason')}</div>
            <p className="text-[length:var(--fs-sm)] text-[var(--ink-1)] leading-relaxed whitespace-pre-line">{post.selectionReason}</p>
          </div>
        )}

        {(() => {
          const standAlone = (post.imageUrls || []).filter(url => normalizeUserContentUrl(url) && !post.content.includes(url));
          return standAlone.length > 0 ? (
            <div className="flex flex-wrap gap-3 mb-6">
              {standAlone.map((url, i) => (
                <img key={i} src={url} alt="" referrerPolicy="no-referrer" className="rounded-[var(--r-lg)] max-h-96 object-cover border border-[var(--line-soft)]" />
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
                return <img {...props} src={safeSrc} referrerPolicy="no-referrer" />;
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
          <div className="mb-8 p-1 rounded-[var(--r-xl)] border border-[var(--line-soft)]" style={{ background: 'var(--bg-2)' }}>
            <div className="px-3 py-2 text-[10px] font-bold text-[var(--lime)] flex items-center gap-1">
              <span>📍</span> {t('label.linkedActivity')}
            </div>
            <ActivityCard activity={linkedActivity} />
          </div>
        )}

        {post.commentReaction && (
          <div className="mb-4 p-4 bg-[var(--aqua)]/10 border border-[var(--aqua)]/30 rounded-[var(--r-lg)]">
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
            {t('likes')} {post.likeCount}
          </button>
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
        <form onSubmit={handleCommentSubmit} className="mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={t('placeholder.comment')}
              className="flex-1 p-2.5 rounded-[var(--r-lg)] text-[length:var(--fs-sm)] focus:outline-none focus:ring-2 focus:ring-[var(--lime)] focus:border-transparent"
              style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--ink-1)' }}
            />
            <Button
              type="submit"
              disabled={commentSubmitting || !commentText.trim()} variant="secondary" className="px-5 py-2 rounded-[var(--r-lg)] text-[length:var(--fs-sm)] font-bold disabled:opacity-50"
            >
              {commentSubmitting ? '...' : t('button.submit')}
            </Button>
          </div>
        </form>

        <div className="space-y-3">
          {comments.map((comment) => (
            <Card key={comment.id} padding="none" className="p-4! md:p-6! rounded-[var(--r-lg)]">
              <div className="flex items-center gap-2 mb-2">
                {comment.profileImage ? (
                  <img src={comment.profileImage} alt="" className="w-5 h-5 rounded-full" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-[var(--bg-3)]" />
                )}
                <span className="font-bold text-[length:var(--fs-sm)] text-[var(--ink-1)]">{comment.nickname}</span>
                <span className="text-[10px] text-[var(--ink-3)]">{new Date(comment.createdAt).toLocaleString()}</span>
                {user && user.uid === comment.userId && (
                  <button
                    onClick={() => handleDeleteComment(comment.id)}
                    className="ml-auto text-[10px] text-[var(--ink-3)] hover:text-[var(--rose)] transition-colors"
                  >
                    {t('button.delete')}
                  </button>
                )}
              </div>
              <p className="text-[length:var(--fs-sm)] text-[var(--ink-1)] leading-relaxed">{comment.text}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
};

export default PostDetailPage;
