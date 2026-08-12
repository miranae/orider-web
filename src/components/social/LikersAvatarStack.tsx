import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Avatar from "../Avatar";
import { LocalizedLink as Link } from "../LocalizedLink";

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
  // 툴팁 노드 — 툴팁 안 이름 링크 탭은 가로채면 안 된다(터치에서 프로필로 가는 유일한 통로).
  const tipRef = useRef<HTMLSpanElement>(null);
  // 직전 입력 종류 — click 핸들러에서 마우스/터치를 갈라 쓰기 위해 기억한다.
  const pointerTypeRef = useRef<string>("mouse");
  // 포인터로 눌러서 생긴 포커스인지 — 키보드 Tab 포커스와 구분하려고 둔다.
  // 아바타를 탭하면 포커스가 먼저 들어와 툴팁이 열리고, 뒤이은 클릭 토글이 그걸 도로
  // 닫아 버린다(탭해도 아무 일도 안 일어나는 것처럼 보임). 포인터 포커스는 열지 않는다.
  const pointerFocusRef = useRef(false);
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
        pointerFocusRef.current = true;
      }}
      // 스크롤·드래그로 제스처가 취소되면 click 이 오지 않는다 — 표식이 남지 않게 정리.
      // (pointerup 에서는 풀지 않는다 — 포커스가 그 뒤에 오는 경우 표식이 먼저 사라져
      //  포커스가 툴팁을 열고, 이어지는 클릭 토글이 그걸 도로 닫는다.)
      onPointerCancel={() => {
        pointerFocusRef.current = false;
      }}
      onPointerLeave={(e) => {
        // 툴팁은 래퍼의 자식이라 툴팁으로 들어가는 이동은 leave 가 아니다. 다만 6px 시각
        // 간격을 지나갈 때 leave 가 나므로, 아래 툴팁이 간격만큼 hit 영역을 덮어 끊기지 않게 한다.
        if (e.pointerType === "mouse") setOpen(false);
      }}
      // 키보드로 아바타 링크에 닿으면 목록이 보이도록 (focus 는 React 에서 버블링).
      // 포인터로 눌러 생긴 포커스는 제외 — 아래 클릭 처리와 겹쳐 서로 상쇄된다.
      onFocus={() => {
        // 표식은 여기서 소비한다 — 클릭이 오지 않은 제스처(롱프레스 등)로 남아 있어도
        // 다음 포커스 한 번에 풀려 영구히 막히지 않는다.
        if (pointerFocusRef.current) {
          pointerFocusRef.current = false;
          return;
        }
        setOpen(true);
      }}
      // 툴팁 안 이름 링크로 포커스가 넘어가는 건 이탈이 아니다 — 닫으면 키보드로
      // 프로필에 닿을 수 없다.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      // 터치/펜 탭은 "누가 눌렀는지" 를 여는 동작으로 쓴다 — 아바타가 링크라 그냥 두면
      // 탭이 프로필 이동으로 먹혀 목록을 볼 방법이 없다. 캡처 단계에서 가로채야 앵커의
      // 클릭 핸들러(react-router 이동)보다 먼저 실행돼 이동을 막을 수 있다.
      //
      // 기기 종류(pointer: coarse)가 아니라 **그때 실제로 쓴 입력**으로 가른다 —
      // 트랙패드 붙인 태블릿·터치 노트북은 주 포인터가 fine 이지만 손가락 터치도 되므로
      // 기기로 나누면 그런 조합에서 동선이 깨진다. 프로필로 갈 길은 툴팁의 이름 링크.
      onClickCapture={(e) => {
        // 상호작용 종료 — 표식은 어느 분기로 빠지든 반드시 푼다(캡처에서 전파를 끊으면
        // 아래 onClick 이 실행되지 않아, 여기서 안 풀면 이후 키보드 포커스가 막힌다).
        pointerFocusRef.current = false;
        // 판정 직후 기본값으로 되돌린다 — 스크린리더·스위치 제어는 선행 pointerdown 없이
        // click 만 합성하므로, 표식이 남아 있으면 직전 터치로 오인해 링크 이동을 막는다
        // (접근성 사용자에게는 아바타가 유일한 직접 프로필 경로다).
        const pointerType = pointerTypeRef.current;
        pointerTypeRef.current = "mouse";
        if (pointerType === "mouse") return; // 마우스·합성 클릭은 링크 이동 그대로
        // 툴팁 안 이름 링크는 그대로 이동시킨다 — 여기까지 막으면 터치 사용자는
        // 프로필로 갈 방법이 아예 없어진다.
        if (tipRef.current?.contains(e.target as Node)) return;
        e.preventDefault();
        e.stopPropagation();
        setOpen((v) => !v);
      }}
      // 키보드 조작은 포인터 입력이 아니다 — 직전 터치의 흔적이 남아 Enter 활성화까지
      // 가로채지 않도록 초기화한다.
      onKeyDown={() => {
        pointerTypeRef.current = "mouse";
        pointerFocusRef.current = false;
      }}
      // 마우스 클릭이 카드 전체 클릭(상세 이동)까지 번지지 않게만 막는다.
      onClick={(e) => e.stopPropagation()}
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
          ref={tipRef}
          id={tipId}
          role="tooltip"
          // 이름이 링크일 땐 숨기지 않는다 — 터치에서 프로필로 가는 유일한 통로라
          // aria-hidden 이면 스크린리더 사용자만 길이 막힌다. 링크가 없으면 래퍼
          // aria-label 이 같은 내용을 이미 읽어 주므로 중복을 피해 숨긴다.
          aria-hidden={linkToProfile ? undefined : true}
          style={{
            position: "absolute",
            // 아래쪽 6px 은 투명 여백 — 시각 간격은 유지하면서 hit 영역만 래퍼에 붙여,
            // 마우스가 툴팁으로 건너가는 도중 leave 가 터져 닫히는 걸 막는다.
            bottom: "100%",
            paddingBottom: 6,
            left: "50%",
            transform: `translateX(calc(-50% + ${shiftX}px))`,
            zIndex: 50,
            maxWidth: TIP_MAX_WIDTH,
            // 터치에선 이 목록이 프로필로 가는 유일한 통로라 클릭을 받아야 한다.
            pointerEvents: linkToProfile ? "auto" : "none",
          }}
        >
          <span
            style={{
              display: "block",
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
            }}
          >
          <span style={{ display: "block", color: "var(--ink-3)", marginBottom: 2 }}>
            {t(`likers.${variant}.title`, { count: total })}
          </span>
          {named.map((k) => (
            <span key={k.userId} style={{ display: "block" }}>
              {linkToProfile ? (
                <Link to={`/athlete/${k.userId}`} style={{ color: "inherit" }}>
                  {k.nickname}
                </Link>
              ) : (
                k.nickname
              )}
            </span>
          ))}
          {namedOverflow > 0 && (
            <span style={{ display: "block", color: "var(--ink-3)" }}>
              {t("likers.andOthers", { count: namedOverflow })}
            </span>
          )}
          </span>
        </span>
      )}
    </span>
  );
}
