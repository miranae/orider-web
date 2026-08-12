import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Avatar from "../Avatar";

export interface LikerAvatarItem {
  userId: string;
  nickname: string;
  profileImage?: string | null;
}

interface LikersAvatarStackProps {
  /** 좋아요 누른 사람 (표시 순서 그대로 — 보통 최신순) */
  likers: readonly LikerAvatarItem[];
  /**
   * 전체 좋아요 수. `likers` 는 서버가 상위 N 명만 비정규화해 준 목록일 수 있어
   * 실제 카운트와 다를 수 있다(피드 카드의 `recentKudos`). 생략 시 `likers.length`.
   */
  totalCount?: number;
  /**
   * 문구 변형 — 활동은 "쿠도스"(en: kudos), 게시판은 "좋아요"(en: likes).
   * 한국어는 양쪽 다 "좋아요" 라 차이가 없고 영어만 갈린다.
   */
  variant?: "kudos" | "like";
  /** 겹쳐 보여줄 최대 아바타 수 (초과분은 +N 원형으로 축약) */
  max?: number;
  /** 아바타 각각을 프로필로 링크할지 — 카드 전체가 링크인 피드에선 false 로 끈다 */
  linkToProfile?: boolean;
  /** 아바타 링에 쓸 배경색 토큰 (카드 배경과 맞춰야 겹침이 깔끔하다) */
  ringColor?: string;
}

const OVERLAP_PX = -8;
const TIP_MAX_WIDTH = 220;
const VIEWPORT_MARGIN = 8;
/** 툴팁에 나열할 이름 최대 개수 — 초과분은 "외 N명" 한 줄로 접는다. */
const TIP_MAX_NAMES = 15;

/**
 * 좋아요 누른 사람 아바타 스택 — 겹쳐 쌓고, hover/focus/tap 시 누른 사람 닉네임
 * 목록을 툴팁으로 보여준다. 활동 쿠도스(피드 `ActivitySocialFooter` / 상세
 * `KudosCommentsCard`)와 게시판 좋아요(`PostDetailPage`)가 공유하며, 앱(Android
 * `KudosAvatarStack.kt` / iOS `KudosAvatarStack.swift`)과 같은 규칙:
 * 최대 `max` 명 겹침 + 초과분 `+N` + 이름 목록.
 *
 * 툴팁은 시각 보조일 뿐이고, 스크린리더에는 래퍼의 aria-label 로 같은 내용을 한 번에
 * 읽어 준다(아바타를 하나씩 훑지 않아도 누가 눌렀는지 알 수 있게).
 */
export default function LikersAvatarStack({
  likers,
  totalCount,
  variant = "kudos",
  max = 5,
  linkToProfile = true,
  ringColor = "var(--bg-1)",
}: LikersAvatarStackProps) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const tipId = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  // 직전 입력 종류 — click 핸들러에서 마우스/터치를 갈라 쓰기 위해 기억한다.
  const pointerTypeRef = useRef<string>("mouse");
  // 카드 좌우 끝에서 가운데 정렬 툴팁이 뷰포트를 벗어나지 않도록 하는 수평 보정치(px).
  const [shiftX, setShiftX] = useState(0);

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const center = r.left + r.width / 2;
    const idealLeft = center - TIP_MAX_WIDTH / 2;
    const maxLeft = window.innerWidth - VIEWPORT_MARGIN - TIP_MAX_WIDTH;
    const clampedLeft = Math.max(VIEWPORT_MARGIN, Math.min(idealLeft, maxLeft));
    setShiftX(clampedLeft - idealLeft);
  }, [open]);

  // 터치로 연 툴팁은 hover 이탈이 없어 스스로 닫히지 않는다 — 바깥을 탭하면 닫는다.
  useEffect(() => {
    if (!open) return;
    const onOutside = (e: Event) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onOutside);
    return () => document.removeEventListener("pointerdown", onOutside);
  }, [open]);

  if (likers.length === 0) return null;

  const total = Math.max(totalCount ?? likers.length, likers.length);
  const shown = likers.slice(0, max);
  // 아바타는 max 까지만 겹치고 나머지는 +N 원형으로 축약.
  const avatarOverflow = Math.max(0, total - shown.length);
  // 툴팁은 아바타 상한과 무관하게 아는 이름을 모두 나열(너무 길어지지 않게 상한만 둠).
  // 이름을 모르는 나머지(서버가 상위 N 명만 내려준 경우)는 "외 N명" 으로만 표기.
  const named = likers.slice(0, TIP_MAX_NAMES);
  const namedOverflow = Math.max(0, total - named.length);
  const ariaLabel = t(`likers.${variant}.aria`, {
    count: total,
    names: named.map((k) => k.nickname).join(", "),
  });

  return (
    <span
      ref={wrapRef}
      role="group"
      aria-label={ariaLabel}
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      // hover 는 마우스에서만. 터치는 pointerenter/leave 가 탭 한 번에 연달아 발생해
      // 열자마자 닫히므로(그리고 click 토글과 겹쳐 상쇄되므로) 아래 onClick 으로만 연다.
      onPointerEnter={(e) => {
        pointerTypeRef.current = e.pointerType;
        if (e.pointerType === "mouse") setOpen(true);
      }}
      onPointerDown={(e) => {
        pointerTypeRef.current = e.pointerType;
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") setOpen(false);
      }}
      // 아바타 링크로 탭 이동해도 목록이 보이도록 (focus 는 React 에서 버블링)
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      // 터치 기기엔 hover 가 없어 탭으로 토글. 카드 클릭(상세 이동)과 겹치지 않게 전파 차단.
      onClick={(e) => {
        e.stopPropagation();
        // 마우스는 hover 로 이미 열려 있으므로 토글하지 않는다(클릭 시 바로 닫힘 방지).
        // click 이벤트 자체엔 pointerType 이 없는 환경이 있어 직전 포인터 종류를 기억해 쓴다.
        if (pointerTypeRef.current === "mouse") return;
        setOpen((v) => !v);
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
        {shown.map((k, i) => (
          <span
            key={k.userId}
            style={{
              marginLeft: i === 0 ? 0 : OVERLAP_PX,
              borderRadius: "9999px",
              boxShadow: `0 0 0 2px ${ringColor}`,
              // 앞선 아바타가 뒤 아바타에 가리도록(최신이 위) 쌓임 순서 역전
              zIndex: shown.length - i,
            }}
          >
            <Avatar
              name={k.nickname}
              imageUrl={k.profileImage}
              size="sm"
              userId={linkToProfile ? k.userId : undefined}
              // 겹쳐 쌓이므로 44px 타깃 확장은 끔 (이웃 아바타를 덮어 오탭 유발)
              tapTarget={false}
            />
          </span>
        ))}
        {avatarOverflow > 0 && (
          <span
            aria-hidden
            className="flex items-center justify-center rounded-full font-semibold"
            style={{
              width: 28,
              height: 28,
              marginLeft: OVERLAP_PX,
              background: "var(--bg-2)",
              color: "var(--ink-2)",
              fontSize: "var(--fs-xs)",
              boxShadow: `0 0 0 2px ${ringColor}`,
            }}
          >
            {t("likers.more", { count: avatarOverflow })}
          </span>
        )}
      </span>

      {open && (
        <span
          id={tipId}
          role="tooltip"
          aria-hidden
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: "50%",
            transform: `translateX(calc(-50% + ${shiftX}px))`,
            zIndex: 50,
            maxWidth: TIP_MAX_WIDTH,
            padding: "8px 10px",
            borderRadius: "var(--r-md)",
            background: "var(--bg-0)",
            border: "1px solid var(--line-soft)",
            color: "var(--ink-1)",
            fontSize: "var(--fs-xs)",
            lineHeight: 1.5,
            fontWeight: 400,
            boxShadow: "0 4px 16px color-mix(in oklch, var(--ink-0) 18%, transparent)",
            textAlign: "left",
            wordBreak: "keep-all",
            overflowWrap: "anywhere",
            pointerEvents: "none",
          }}
        >
          <span style={{ display: "block", color: "var(--ink-3)", marginBottom: 2 }}>
            {t(`likers.${variant}.title`, { count: total })}
          </span>
          {named.map((k) => (
            <span key={k.userId} style={{ display: "block" }}>
              {k.nickname}
            </span>
          ))}
          {namedOverflow > 0 && (
            <span style={{ display: "block", color: "var(--ink-3)" }}>
              {t("likers.andOthers", { count: namedOverflow })}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
