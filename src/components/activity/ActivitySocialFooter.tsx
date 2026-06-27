import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Heart, MessageCircle } from "lucide-react";
import { doc, setDoc, deleteDoc, addDoc, collection } from "firebase/firestore";
import { firestore } from "../../services/firebase";
import type { Activity } from "@shared/types";
import Avatar from "../Avatar";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { track, trackActivationStep } from "../../services/analytics";
import { logClientError } from "../../services/errorLogger";
import { getDiscipline } from "../../utils/disciplineFilter";

/**
 * 스트라바형 활동 카드 소셜 푸터 — 좋아요(토글 + 누른 사람 아바타 스택) + 댓글 수.
 *
 * 데스크톱 ActivityCard 와 모바일 CompactActivityCard 가 공유. 좋아요 아바타는 활동 doc 에
 * 비정규화된 `recentKudos` 를 그대로 쓰므로 카드당 추가 Firestore read 가 없다(read 0).
 * "내가 눌렀는지" 상태는 recentKudos 에 내 uid 가 있는지로 무비용 추정 — 상위 N 밖이면
 * 하트가 빈 채로 보일 수 있으나 토글은 정상 동작(낙관적 업데이트). 정확한 상태는 상세에서.
 */
export default function ActivitySocialFooter({ activity }: { activity: Activity }) {
  const { t } = useTranslation("activity");
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { showToast } = useToast();

  const initialRecent = activity.recentKudos ?? [];
  const [liked, setLiked] = useState(() => !!user && initialRecent.some((k) => k.userId === user.uid));
  const [localKudos, setLocalKudos] = useState(activity.kudosCount ?? 0);
  const [recent, setRecent] = useState(initialRecent);
  // 댓글 인라인 작성 — 💬 클릭 시 카드 안에서 바로 입력(상세 이동 없이). 기존 댓글 "목록"은
  // 불러오지 않아 카드당 추가 read 0; 전체 보기는 카드/제목 클릭으로 상세 진입.
  const [showComment, setShowComment] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [localComments, setLocalComments] = useState(activity.commentCount ?? 0);

  // 좋아요 토글 — activities/{id}/kudos/{uid} write (recentKudos·kudosCount 는 서버 트리거가 갱신).
  // 카드에선 낙관적으로 카운트/아바타만 즉시 반영. 비로그인은 무동작.
  // write 실패 시 낙관적 변경을 롤백해 UI 가 실제 Firestore 상태와 어긋나지 않게 하고(좋아요
  // 안 됐는데 하트 채워짐 방지), 표준 로거로 운영 가시성 확보.
  const handleToggleKudos = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user || !profile) return;
    const kudosDocRef = doc(firestore, "activities", activity.id, "kudos", user.uid);
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
        { userId: user.uid, nickname: profile.nickname ?? user.displayName ?? "User", profileImage: user.photoURL ?? null },
        ...r.filter((k) => k.userId !== user.uid),
      ].slice(0, 5));
    }
    try {
      if (wasLiked) {
        await deleteDoc(kudosDocRef);
      } else {
        await setDoc(kudosDocRef, {
          nickname: profile.nickname ?? user.displayName ?? "User",
          profileImage: user.photoURL ?? null,
          createdAt: Date.now(),
        });
        showToast(t("card.kudosToast"));
        trackActivationStep(user.uid, "first_kudos", { activity_id: activity.id });
      }
    } catch (err) {
      // 롤백 — 낙관적 변경을 되돌려 실제 상태와 일치시킴.
      setLiked(prev.liked);
      setLocalKudos(prev.localKudos);
      setRecent(prev.recent);
      logClientError("ActivitySocialFooter.kudosToggle", err, {
        activityId: activity.id,
        action: wasLiked ? "off" : "on",
      });
    }
  };

  // 댓글 버튼 — 카드 안 입력칸을 토글(상세 이동 없이 바로 입력). 비로그인도 펼침은 되나
  // 입력칸이 로그인 유도(placeholder/disabled)로 안내.
  const handleToggleComment = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowComment((v) => !v);
  };

  // 댓글 등록 — activities/{id}/comments addDoc (commentCount 는 서버 트리거가 갱신).
  // 낙관적으로 카운트만 +1, 실패 시 롤백 + 표준 로깅. 기존 댓글 목록은 카드에서 안 띄움(read 0).
  const handleSubmitComment = async () => {
    const text = commentText.trim();
    if (!user || !profile || !text || commentSubmitting) return;
    setCommentSubmitting(true);
    setLocalComments((c) => c + 1); // 낙관적
    try {
      await addDoc(collection(firestore, "activities", activity.id, "comments"), {
        userId: user.uid,
        nickname: profile.nickname ?? user.displayName ?? "User",
        profileImage: user.photoURL ?? null,
        text,
        createdAt: Date.now(),
        deletedAt: null,
      });
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
      showToast(t("card.commentFailed"), "error");
    } finally {
      setCommentSubmitting(false);
    }
  };

  const overflow = Math.max(0, localKudos - recent.length);

  return (
    <div className="border-t" style={{ borderColor: "var(--line-soft)" }} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-4 px-4 py-2.5">
        {/* 좋아요 토글 + 카운트 */}
        <button
          type="button"
          onClick={handleToggleKudos}
          disabled={!user}
          className="flex items-center gap-1.5 transition-opacity disabled:opacity-50"
          style={{ color: liked ? "var(--lime)" : "var(--ink-3)", background: "none", border: "none", cursor: user ? "pointer" : "default", minHeight: 32 }}
          aria-label={t("card.kudosShort")}
        >
          <Heart size={18} fill={liked ? "currentColor" : "none"} />
          <span className="text-[length:var(--fs-sm)] font-semibold">{localKudos}</span>
        </button>

        {/* 누른 사람 아바타 스택 */}
        {recent.length > 0 && (
          <div className="flex items-center">
            <div className="flex items-center">
              {recent.map((k, i) => (
                <span
                  key={k.userId}
                  className="rounded-full"
                  style={{ marginLeft: i === 0 ? 0 : -8, boxShadow: "0 0 0 2px var(--bg-1)", borderRadius: "9999px" }}
                >
                  <Avatar userId={k.userId} name={k.nickname} imageUrl={k.profileImage} size="sm" />
                </span>
              ))}
            </div>
            {overflow > 0 && (
              <span className="ml-2 text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>
                {t("card.kudosAndOthers", { count: overflow })}
              </span>
            )}
          </div>
        )}

        {/* 댓글 — 카드 안 입력칸 토글 */}
        <button
          type="button"
          onClick={handleToggleComment}
          className="flex items-center gap-1.5 ml-auto transition-opacity"
          style={{ color: showComment ? "var(--lime)" : "var(--ink-3)", background: "none", border: "none", cursor: "pointer", minHeight: 32 }}
          aria-label={t("card.comment")}
          aria-expanded={showComment}
        >
          <MessageCircle size={18} />
          <span className="text-[length:var(--fs-sm)] font-semibold">{localComments}</span>
        </button>
      </div>

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
          <div className="flex gap-2">
            <input
              type="text"
              autoFocus
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); handleSubmitComment(); } }}
              disabled={!user || commentSubmitting}
              placeholder={user ? t("card.commentPlaceholder") : t("card.commentLoginRequired")}
              className="flex-1 px-3 py-1.5 rounded-[var(--r-md)] text-[length:var(--fs-sm)] focus:outline-none focus:ring-2 focus:ring-[var(--lime)]"
              style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--ink-1)" }}
            />
            <button
              type="button"
              onClick={handleSubmitComment}
              disabled={!user || commentSubmitting || !commentText.trim()}
              className="px-3 py-1.5 rounded-[var(--r-md)] text-[length:var(--fs-sm)] font-semibold transition-opacity disabled:opacity-40"
              style={{ background: "var(--lime)", color: "var(--bg-0)", border: "none", cursor: "pointer" }}
            >
              {t("card.commentSubmit")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
