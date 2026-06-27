import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../LocalizedLink";
import type { User } from "firebase/auth";
import type { UserProfile } from "@shared/types";
import Avatar from "../Avatar";
import { Card, buttonClass } from "../../theme/components";

export interface KudoItem {
  userId: string;
  nickname: string;
  profileImage?: string | null;
}

export interface CommentItem {
  id: string;
  userId: string;
  nickname: string;
  profileImage: string | null;
  text: string;
  createdAt: number;
}

interface KudosCommentsCardProps {
  user: User | null;
  profile: UserProfile | null;
  liked: boolean;
  kudos: KudoItem[];
  comments: CommentItem[];
  commentText: string;
  setCommentText: (v: string) => void;
  submitting: boolean;
  editingCommentId: string | null;
  setEditingCommentId: (id: string | null) => void;
  editingText: string;
  setEditingText: (v: string) => void;
  onToggleKudos: () => void;
  onSubmitComment: () => void;
  onDeleteComment: (commentId: string) => void;
  onSaveEditComment: () => void;
  formatTimeAgo: (ts: number) => string;
}

export default function KudosCommentsCard({
  user,
  profile,
  liked,
  kudos,
  comments,
  commentText,
  setCommentText,
  submitting,
  editingCommentId,
  setEditingCommentId,
  editingText,
  setEditingText,
  onToggleKudos,
  onSubmitComment,
  onDeleteComment,
  onSaveEditComment,
  formatTimeAgo,
}: KudosCommentsCardProps) {
  const { t } = useTranslation("activity");
  return (
    <Card padding="none" style={{ padding: 'var(--space-5)' }}>
      <div className="flex items-center gap-4 pb-3" style={{ borderBottom: '1px solid var(--line-soft)' }}>
        <button
          onClick={onToggleKudos}
          disabled={!user}
          className="flex items-center gap-1.5 text-[length:var(--fs-sm)] transition-colors disabled:opacity-50"
          style={{ color: liked ? 'var(--lime)' : 'var(--ink-2)' }}
          aria-pressed={liked}
          aria-label={liked ? t("kudosCard.kudosCancel") : t("kudosCard.kudos")}
        >
          <svg className="w-5 h-5" fill={liked ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
          </svg>
          {kudos.length > 0 ? t("kudosCard.kudosWithCount", { count: kudos.length }) : t("kudosCard.kudos")}
        </button>
        <span className="text-[length:var(--fs-sm)]" style={{ color: 'var(--ink-2)' }}>
          {t("kudosCard.comments", { count: comments.length })}
        </span>
      </div>

      {kudos.length > 0 && (
        <div className="py-3" style={{ borderBottom: '1px solid var(--line-soft)' }}>
          <div className="flex -space-x-1">
            {kudos.map((k) => (
              <Avatar key={k.userId} name={k.nickname} imageUrl={k.profileImage} size="sm" userId={k.userId} />
            ))}
          </div>
        </div>
      )}

      {comments.length > 0 && (
        <div className="pt-3 space-y-3">
          {comments.map((c) => (
            <div key={c.id} className="flex items-start gap-2">
              <Avatar name={c.nickname} imageUrl={c.profileImage} size="sm" userId={c.userId} />
              <div className="flex-1 rounded-[var(--r-lg)] px-3 py-2" style={{ background: 'var(--bg-2)' }}>
                <div className="flex items-center gap-2">
                  <Link to={`/athlete/${c.userId}`} className="text-[length:var(--fs-xs)] font-semibold hover:underline" style={{ color: 'var(--ink-1)' }}>{c.nickname}</Link>
                  <span className="text-[length:var(--fs-xs)]" style={{ color: 'var(--ink-3)' }}>{formatTimeAgo(c.createdAt)}</span>
                  {user?.uid === c.userId && editingCommentId !== c.id && (
                    <span className="ml-auto flex gap-1">
                      <button
                        onClick={() => { setEditingCommentId(c.id); setEditingText(c.text); }}
                        className="text-[length:var(--fs-xs)] hover:underline" style={{ color: 'var(--ink-3)' }}
                      >{t("kudosCard.edit")}</button>
                      <button
                        onClick={() => { if (window.confirm(t("kudosCard.deleteConfirm"))) onDeleteComment(c.id); }}
                        className="text-[length:var(--fs-xs)] hover:underline" style={{ color: 'var(--ink-3)' }}
                      >{t("kudosCard.delete")}</button>
                    </span>
                  )}
                </div>
                {editingCommentId === c.id ? (
                  <div className="mt-1 flex gap-2">
                    <input
                      type="text"
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); onSaveEditComment(); }
                        if (e.key === "Escape") { setEditingCommentId(null); }
                      }}
                      autoFocus
                      aria-label={t("kudosCard.ariaEdit")}
                      className="flex-1 px-2 py-1 text-[length:var(--fs-sm)] rounded-[var(--r-sm)] focus:outline-none"
                      style={{ border: '1px solid var(--line-soft)', background: 'var(--bg-1)', color: 'var(--ink-0)' }}
                    />
                    <button onClick={onSaveEditComment} disabled={!editingText.trim()} className="text-[length:var(--fs-xs)] font-medium disabled:opacity-50 hover:underline" style={{ color: 'var(--lime)' }}>{t("kudosCard.save")}</button>
                    <button onClick={() => setEditingCommentId(null)} className="text-[length:var(--fs-xs)] hover:underline" style={{ color: 'var(--ink-3)' }}>{t("kudosCard.cancel")}</button>
                  </div>
                ) : (
                  <p className="text-[length:var(--fs-sm)] mt-0.5" style={{ color: 'var(--ink-1)' }}>{c.text}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {user && (
        <div className="pt-3 flex items-start gap-2">
          <Avatar
            name={profile?.nickname ?? user.displayName ?? "User"}
            imageUrl={user.photoURL}
            size="sm"
          />
          <div className="flex-1 flex gap-2">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  onSubmitComment();
                }
              }}
              placeholder={t("kudosCard.placeholder")}
              aria-label={t("kudosCard.ariaInput")}
              className="flex-1 px-3 py-2 text-[length:var(--fs-sm)] rounded-[var(--r-lg)] focus:outline-none"
              style={{ border: '1px solid var(--line-soft)', background: 'var(--bg-2)', color: 'var(--ink-0)' }}
            />
            <button
              onClick={onSubmitComment}
              disabled={submitting || !commentText.trim()}
              className={`${buttonClass({ variant: 'secondary', className: 'px-3 py-2 text-[length:var(--fs-sm)] rounded-[var(--r-lg)] disabled:opacity-50 transition-colors' })} ${submitting ? 'cursor-wait' : ''}`}
            >
              {submitting ? (
                <span className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t("kudosCard.submitting")}
                </span>
              ) : t("kudosCard.submit")}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
