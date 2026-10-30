import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Heart, MessageCircle } from "lucide-react";
import { Button, Textarea } from "../../theme/components";
import Avatar from "../Avatar";
import { timeAgo } from "../../utils/timeAgo";
import type { CommentItem } from "./KudosCommentsCard";
import "./ActivitySocialFooter.css";
import type { Activity } from "@shared/types";
import LikersAvatarStack from "../social/LikersAvatarStack";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { track, trackActivationStep } from "../../services/analytics";
import { logClientError } from "../../services/errorLogger";
import { getDiscipline } from "../../utils/disciplineFilter";
import { useHydratedSocialProfiles } from "./useHydratedSocialProfiles";
import { activitySocialErrorMessageKey, activitySocialMutations } from "../../services/activitySocialMutations";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { ICON_SIZE } from "../../theme/tokens/icon";

/**
 * 스트라바형 활동 카드 소셜 푸터 — 좋아요(토글 + 누른 사람 아바타 스택) + 댓글 수.
 *
 * 데스크톱 ActivityCard 와 모바일 CompactActivityCard 가 공유. 좋아요 아바타는 활동 doc 에
 * 비정규화된 `recentKudos` 를 그대로 쓰므로 카드당 추가 Firestore read 가 없다(read 0).
 * discovery가 제공하는 현재 viewerHasKudos를 우선 사용합니다.
 * 필드가 없는 기존 owner 기록에서만 recentKudos를 호환용으로 사용합니다.
 */
export default function ActivitySocialFooter({ activity, presentation = "default", commentsPreview = [] }: { activity: Activity; presentation?: "default" | "feed"; commentsPreview?: readonly CommentItem[] }) {
  const { t } = useTranslation("activity");
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { showToast } = useToast();

  const services = useFirebaseServices();
  const sdkUser = services.auth.currentUser;
  const initialRecent = activity.recentKudos ?? [];
  const canonicalLiked = activity.viewerHasKudos ?? (!!user && initialRecent.some((k) => k.userId === user.uid));
  const [liked, setLiked] = useState(canonicalLiked);
  const [localKudos, setLocalKudos] = useState(activity.kudosCount ?? 0);
  const [recent, setRecent] = useState(initialRecent);
  const hydratedRecent = useHydratedSocialProfiles(recent, "ActivitySocialFooter.recentKudos");
  const currentProfileImage = profile?.photoURL ?? user?.photoURL ?? null;
  // 댓글 인라인 작성 — 💬 클릭 시 카드 안에서 바로 입력(상세 이동 없이). 기존 댓글 "목록"은
  // 직접 구독하지 않고 상위에서 전달한 제한된 미리보기만 표시한다. 전체 목록은 상세에서 읽는다.
  const [showComment, setShowComment] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [localComments, setLocalComments] = useState(activity.commentCount ?? 0);

  const scope = JSON.stringify([activity.id, user?.uid, canonicalLiked, activity.kudosCount, activity.commentCount]);
  const identity = useRef({ scope, sdkUser, generation: 0 });
  const pendingKudos = useRef(false);
  const [kudosBusy, setKudosBusy] = useState(false);
  if (identity.current.scope !== scope || identity.current.sdkUser !== sdkUser) {
    identity.current = { scope, sdkUser, generation: identity.current.generation + 1 };
    pendingKudos.current = false;
    setLiked(canonicalLiked); setLocalKudos(activity.kudosCount ?? 0); setRecent(initialRecent);
    setLocalComments(activity.commentCount ?? 0); setCommentText(""); setCommentSubmitting(false); setKudosBusy(false);
  }
  useEffect(() => () => { identity.current.generation++; }, []);

  // 좋아요 토글 — canonical callable write (recentKudos·kudosCount 는 서버 트리거가 갱신).
  // 카드에선 낙관적으로 카운트/아바타만 즉시 반영. 비로그인은 무동작.
  // write 실패 시 낙관적 변경을 롤백해 UI 가 실제 Firestore 상태와 어긋나지 않게 하고(좋아요
  // 안 됐는데 하트 채워짐 방지), 표준 로거로 운영 가시성 확보.
  const handleToggleKudos = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user || !profile || pendingKudos.current) return;
    const generation = identity.current.generation;
    const current = () => identity.current.generation === generation && services.auth.currentUser === sdkUser;
    pendingKudos.current = true; setKudosBusy(true);
    const wasLiked = liked;
    // 롤백용 스냅샷 — 실패 시 이 값으로 복구.
    const prev = { liked, localKudos, recent };
    track("kudos_tap", {
      action: wasLiked ? "off" : "on",
      activity_id: activity.id,
      activity_sport: getDiscipline(activity.type),
      is_own_activity: activity.userId === user.uid ? "true" : "false",
      activity_source: (activity as Activity & { source?: string }).source ?? "unknown",
    });
    // 낙관적 반영
    if (wasLiked) {
      setLiked(false);
      setLocalKudos((c) => Math.max(0, c - 1));
      setRecent((r) => r.filter((k) => k.userId !== user.uid));
    } else {
      setLiked(true);
      setLocalKudos((c) => c + 1);
      setRecent((r) => [
        { userId: user.uid, nickname: profile.nickname ?? user.displayName ?? "User", profileImage: currentProfileImage },
        ...r.filter((k) => k.userId !== user.uid),
      ].slice(0, 5));
    }
    try {
      await activitySocialMutations.setKudos(activity.id, !wasLiked);
      if (!current()) return;
      if (!wasLiked) {
        showToast(t("card.kudosToast"));
        trackActivationStep(user.uid, "first_kudos", { activity_id: activity.id });
      }
    } catch (err) {
      if (!current()) return;
      // 롤백 — 낙관적 변경을 되돌려 실제 상태와 일치시킴.
      setLiked(prev.liked);
      setLocalKudos(prev.localKudos);
      setRecent(prev.recent);
      logClientError("ActivitySocialFooter.kudosToggle", err, {
        activityId: activity.id,
        action: wasLiked ? "off" : "on",
      });
      showToast(t(activitySocialErrorMessageKey(err)), "error");
    } finally { if (current()) { pendingKudos.current = false; setKudosBusy(false); } }
  };

  // 댓글 버튼 — 카드 안 입력칸을 토글(상세 이동 없이 바로 입력). 비로그인도 펼침은 되나
  // 입력칸이 로그인 유도(placeholder/disabled)로 안내.
  const handleToggleComment = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowComment((v) => !v);
  };

  // 댓글 등록 — canonical callable write (commentCount 는 서버 트리거가 갱신).
  // 낙관적으로 카운트만 +1, 실패 시 롤백 + 표준 로깅. 댓글 목록의 별도 구독은 만들지 않는다.
  const handleSubmitComment = async () => {
    const text = commentText.trim();
    if (!user || !profile || !text || commentSubmitting) return;
    setCommentSubmitting(true);
    setLocalComments((c) => c + 1); // 낙관적
    try {
      await activitySocialMutations.postComment(activity.id, text);
      track("activity_comment_send", {
        activity_id: activity.id,
        text_len: text.length,
        activity_sport: getDiscipline(activity.type),
        is_own_activity: activity.userId === user.uid ? "true" : "false",
        activity_source: (activity as Activity & { source?: string }).source ?? "unknown",
      });
      setCommentText("");
      setShowComment(false);
      showToast(t("card.commentSent"));
    } catch (err) {
      setLocalComments((c) => Math.max(0, c - 1)); // 롤백
      logClientError("ActivitySocialFooter.commentSubmit", err, { activityId: activity.id });
      showToast(t(activitySocialErrorMessageKey(err)), "error");
    } finally {
      setCommentSubmitting(false);
    }
  };

  const feed = presentation === "feed";
  const CommentInput = feed ? Textarea : "input";
  const visibleComments = commentsPreview.filter(comment => !comment.hiddenByOwner && comment.deletedAt == null && Number.isFinite(new Date(comment.createdAt).getTime())).slice(0, 3);
  return (
    <div className={feed ? "activity-social-feed" : "border-t"} style={{ borderColor: "var(--line-soft)" }} onClick={(e) => e.stopPropagation()}>
      <div className={feed ? "activity-social-feed-row" : "flex items-center gap-4 px-4 py-2.5"}>
        {feed && <div className="activity-social-feed-totals">
          <LikersAvatarStack likers={hydratedRecent} totalCount={localKudos} compact />
          <span>{t("card.kudosShort")} {localKudos}</span>
        </div>}
        {/* 좋아요 토글 + 카운트 */}
        {/* HIG 피드 동작: 배경 없는 22 아이콘, 터치 44. */}
        {feed ? <button type="button" className="activity-social-feed-action" onClick={handleToggleKudos} disabled={!user || kudosBusy}
          aria-label={t("card.kudosShort")} aria-pressed={liked}><Heart size={ICON_SIZE.lg} fill={liked ? "currentColor" : "none"} aria-hidden="true" /></button> :         <button
          type="button"
          onClick={handleToggleKudos}
          disabled={!user || kudosBusy}
          className="flex items-center justify-center gap-1.5 transition-opacity disabled:opacity-50"
          style={{ color: liked ? "var(--lime)" : "var(--ink-3)", background: "none", border: "none", cursor: user ? "pointer" : "default", minHeight: 44, minWidth: 44, padding: "0 var(--space-2)", margin: "-6px calc(var(--space-2) * -1)" }}
          aria-label={t("card.kudosShort")}
          aria-pressed={liked}
        >
          <Heart size={ICON_SIZE.lg} fill={liked ? "currentColor" : "none"} />
          {!feed && <span className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-1)" }}>{localKudos}</span>}
        </button>}

        {/* 누른 사람 아바타 스택 — hover/focus/tap 시 누른 사람 이름 툴팁 */}
        {!feed && <LikersAvatarStack likers={hydratedRecent} totalCount={localKudos} />}

        {/* 댓글 — 카드 안 입력칸 토글 */}
        {feed ? <button type="button" className="activity-social-feed-action" onClick={handleToggleComment}
          aria-label={t("card.comment")} aria-expanded={showComment}>
          <MessageCircle size={ICON_SIZE.lg} aria-hidden="true" />
          {localComments > 0 && <span>{localComments}</span>}
        </button> :         <button
          type="button"
          onClick={handleToggleComment}
          className={feed ? "flex items-center justify-center gap-1.5 transition-opacity" : "flex items-center justify-center gap-1.5 ml-auto transition-opacity"}
          style={{ color: showComment ? "var(--lime)" : "var(--ink-3)", background: "none", border: "none", cursor: "pointer", minHeight: 44, minWidth: 44, padding: "0 var(--space-2)", margin: "-6px calc(var(--space-2) * -1)" }}
          aria-label={t("card.comment")}
          aria-expanded={showComment}
        >
          <MessageCircle size={ICON_SIZE.lg} />
          {(!feed || localComments > 0) && <span className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-1)" }}>{localComments}</span>}
        </button>}
      </div>

      {feed && visibleComments.length > 0 && <div className="activity-social-feed-comments">
        {visibleComments.map(comment => <div key={comment.id} className="activity-social-feed-comment">
          <Avatar userId={comment.userId} name={comment.nickname} imageUrl={comment.profileImage} size="sm" className="activity-social-comment-avatar" />
          <div className="activity-social-feed-comment-content">
            <div className="activity-social-feed-comment-meta">
              <strong>{comment.nickname}</strong>
              <time dateTime={new Date(comment.createdAt).toISOString()}>{timeAgo(comment.createdAt, t)}</time>
            </div>
            <p>{comment.text}</p>
          </div>
        </div>)}
      </div>}

      {/* 인라인 댓글 입력칸 — 💬 토글 시 표시 */}
      {showComment && (
        <div className="px-4 pb-3">
          {localComments > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); navigate(`/activity/${activity.id}`); }}
              className="mb-1.5 text-[length:var(--fs-xs)] transition-opacity hover:opacity-80"
              style={{ color: "var(--ink-3)", background: "none", border: "none", cursor: "pointer" }}
            >
              {t("card.viewAllComments", { count: localComments })}
            </button>
          )}
          <div className={feed ? "activity-social-feed-composer" : "flex gap-2"}>
            {feed && user && <Avatar userId={user.uid} name={profile?.nickname} imageUrl={currentProfileImage} size="sm" className="activity-social-comment-avatar" />}
            <CommentInput
              type={feed ? undefined : "text"}
              rows={feed ? 1 : undefined}
              compact={feed || undefined}
              autoFocus
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (!feed || e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); handleSubmitComment(); } }}
              disabled={!user || commentSubmitting}
              placeholder={user ? t("card.commentPlaceholder") : t("card.commentLoginRequired")}
              className={feed ? "activity-social-comment-input" : "flex-1 px-3 py-1.5 rounded-[var(--r-md)] text-[length:var(--fs-sm)] focus:outline-none focus:ring-2 focus:ring-[var(--lime)]"}
              style={feed ? undefined : { background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--ink-1)" }}
            />
            {feed ? <Button variant="primary" size="md" onClick={handleSubmitComment} disabled={!user || commentSubmitting || !commentText.trim()}>
              {t("card.commentSubmit")}
            </Button> : <button
              type="button"
              onClick={handleSubmitComment}
              disabled={!user || commentSubmitting || !commentText.trim()}
              className="px-3 py-1.5 rounded-[var(--r-md)] text-[length:var(--fs-sm)] font-semibold transition-opacity disabled:opacity-40"
              style={{ background: "var(--color-primary-dark)", color: "var(--primary-fg)", border: "none", cursor: "pointer" }}
            >
              {t("card.commentSubmit")}
            </button>}
          </div>
        </div>
      )}
    </div>
  );
}
