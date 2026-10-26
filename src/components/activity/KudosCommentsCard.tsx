import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../LocalizedLink";
import type { User } from "firebase/auth";
import type { UserProfile } from "@shared/types";
import Avatar from "../Avatar";
import LikersAvatarStack from "../social/LikersAvatarStack";
import { Card, Button, Input, buttonClass } from "../../theme/components";
import { useDialog } from "../../contexts/DialogContext";
import { useHydratedSocialProfiles } from "./useHydratedSocialProfiles";

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
  hiddenByOwner?: boolean;
  deletedAt?: number | null;
}

interface KudosCommentsCardProps {
  user: User | null;
  profile: UserProfile | null;
  liked: boolean;
  kudosBusy?: boolean;
  kudos: KudoItem[];
  kudosCount?: number;
  comments: CommentItem[];
  commentCount?: number;
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
  onSignIn: () => void;
  formatTimeAgo: (ts: number) => string;
  activityOwnerId?: string;
  hiddenComments?: CommentItem[];
  moderationBusy?: boolean;
  onReportComment?: (id: string) => void;
  onSetCommentHidden?: (id: string, hidden: boolean) => void;
}

export default function KudosCommentsCard({
  user,
  profile,
  liked,
  kudosBusy = false,
  kudos,
  kudosCount,
  comments,
  commentCount,
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
  onSignIn,
  formatTimeAgo,
  activityOwnerId, hiddenComments = [], moderationBusy = false, onReportComment, onSetCommentHidden,
}: KudosCommentsCardProps) {
  const { t } = useTranslation("activity");
  const dialog = useDialog();
  const hydratedKudos = useHydratedSocialProfiles(kudos, "KudosCommentsCard.kudos");
  const hydratedComments = useHydratedSocialProfiles(comments.filter(comment => comment.deletedAt == null && comment.hiddenByOwner !== true), "KudosCommentsCard.comments");
  const displayedKudosCount = Math.max(hydratedKudos.length, kudosCount ?? 0);
  const displayedCommentCount = Math.max(hydratedComments.length, commentCount ?? 0);
  const currentProfileImage = profile?.photoURL ?? user?.photoURL ?? null;

  return (
    <Card padding="none" style={{ padding: 'var(--space-5)' }}>
      <div className="flex flex-wrap items-center gap-4 pb-3" style={{ borderBottom: '1px solid var(--line-soft)' }}>
        <Button
          variant="neutral"
          size="sm"
          loading={kudosBusy}
          leadingIcon={<svg className="w-5 h-5" fill={liked ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
          </svg>}
          onClick={user ? onToggleKudos : onSignIn}
          aria-pressed={liked}
          aria-label={!user ? t("kudosCard.loginToKudos") : liked ? t("kudosCard.kudosCancel") : t("kudosCard.kudos")}
        >
          {displayedKudosCount > 0 ? t("kudosCard.kudosWithCount", { count: displayedKudosCount }) : t("kudosCard.kudos")}
        </Button>
        <span className="text-[length:var(--fs-sm)]" style={{ color: 'var(--ink-2)' }}>
          {t("kudosCard.comments", { count: displayedCommentCount })}
        </span>
      </div>

      {hydratedKudos.length > 0 && (
        <div className="py-3" style={{ borderBottom: '1px solid var(--line-soft)' }}>
          {/* 상세는 목록 전체를 받으므로 피드보다 많이 펼쳐 보여준다(초과분은 +N + 툴팁) */}
          <LikersAvatarStack
            likers={hydratedKudos}
            totalCount={displayedKudosCount}
            max={12}
            ringColor="var(--bg-1)"
          />
        </div>
      )}

      {hydratedComments.length > 0 && (
        <div className="pt-3 space-y-3">
          {hydratedComments.map((c) => (
            <div key={c.id} className="flex items-start gap-2">
              <Avatar name={c.nickname} imageUrl={c.profileImage} size="sm" userId={c.userId} />
              <div className="flex-1 rounded-[var(--r-lg)] px-3 py-2" style={{ background: 'var(--bg-2)' }}>
                <div className="flex items-center gap-2">
                  <Link to={`/athlete/${c.userId}`} className="text-[length:var(--fs-xs)] font-semibold hover:underline" style={{ color: 'var(--ink-1)' }}>{c.nickname}</Link>
                  <span className="text-[length:var(--fs-xs)]" style={{ color: 'var(--ink-3)' }}>{formatTimeAgo(c.createdAt)}</span>
                  {user && user.uid !== c.userId && onReportComment && <button disabled={moderationBusy} onClick={() => onReportComment(c.id)} className="text-[length:var(--fs-xs)] hover:underline">{t("kudosCard.report")}</button>}
                  {user?.uid === activityOwnerId && onSetCommentHidden && <button disabled={moderationBusy} onClick={() => onSetCommentHidden(c.id, true)} className="text-[length:var(--fs-xs)] hover:underline">{t("kudosCard.hide")}</button>}
                  {user?.uid === c.userId && editingCommentId !== c.id && (
                    <span className="ml-auto flex gap-1">
                      <button
                        onClick={() => { setEditingCommentId(c.id); setEditingText(c.text); }}
                        className="text-[length:var(--fs-xs)] hover:underline" style={{ color: 'var(--ink-3)' }}
                      >{t("kudosCard.edit")}</button>
                      <button
                        onClick={async () => { if (await dialog.confirm(t("kudosCard.deleteConfirm"), { destructive: true })) onDeleteComment(c.id); }}
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

      {user?.uid === activityOwnerId && hiddenComments.length > 0 && <details data-testid="D1-6-hidden" className="py-3">
        <summary>{t("kudosCard.hiddenComments", { count: hiddenComments.length })}</summary>
        {hiddenComments.map(comment => <div key={comment.id} className="flex items-center gap-2 py-2">
          <span>{comment.nickname}: {comment.text}</span>
          <button disabled={moderationBusy} onClick={() => onSetCommentHidden?.(comment.id, false)}>{t("kudosCard.restore")}</button>
        </div>)}
      </details>}

      {user && (
        <div className="pt-3 flex flex-wrap items-start gap-2">
          <Avatar
            name={profile?.nickname ?? user.displayName ?? "User"}
            imageUrl={currentProfileImage}
            size="sm"
          />
          <div className="min-w-0 flex-1 flex flex-wrap gap-2">
            <Input
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
              className="min-w-0 flex-1 basis-full sm:basis-0"
            />
            <Button variant="secondary" onClick={onSubmitComment}
              loading={submitting} disabled={submitting || !commentText.trim()}>
              {submitting ? t("kudosCard.submitting") : t("kudosCard.submit")}
            </Button>
          </div>
        </div>
      )}
      {!user && (
        <div className="pt-3">
          <div className="flex flex-col gap-3 rounded-[var(--r-lg)] border border-[var(--line-soft)] bg-[var(--bg-2)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[length:var(--fs-sm)] font-semibold text-[var(--ink-0)]">{t("kudosCard.loginTitle")}</p>
              <p className="mt-0.5 text-[length:var(--fs-xs)] text-[var(--ink-3)]">{t("kudosCard.loginDesc")}</p>
            </div>
            <button
              type="button"
              onClick={onSignIn}
              className={buttonClass({ variant: "secondary", size: "sm", className: "shrink-0" })}
            >
              {t("kudosCard.loginAction")}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
