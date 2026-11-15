/**
 * 경고·알림 → 해결 칸 연결 계약.
 *
 * 경고를 누르면 고칠 수 있는 화면으로 데려가고, 그 화면에서 접힌 칸은 펼친 뒤 해당 입력칸에 초점을 둔다.
 * 링크는 `?focus=<키>` 로 대상을 지정하고, 대상 요소는 `data-focus-target="<키>"` 를 단다.
 * 실제 이동·펼침·초점은 Layout 의 `useFocusTarget` 이 맡는다.
 */
export const FOCUS_PARAM = "focus";
export const FOCUS_TARGET_ATTR = "data-focus-target";

/** 앱 전역에서 쓰는 해결 칸 키. 새 키는 여기에만 더한다(링크와 대상이 같은 문자열을 쓰도록). */
export const FOCUS_TARGETS = {
  ftp: "ftp",
  maxHr: "max-hr",
  lthr: "lthr",
  thresholdPace: "threshold-pace",
  css: "css",
  ftpTest: "ftp-test",
  weight: "weight",
  height: "height",
  /** 설정 > 계정의 AI 코치 이용 동의 검토 버튼. */
  aiCoachConsent: "ai-coach-consent",
  clubInviteCode: "club-invite-code",
  /** 설정 > 계정의 로그인 방법 카드(S1-4-1) — 아직 연결하지 않은 첫 로그인 방법의 연결 버튼. */
  socialLinks: "social-links",
  /** 설정 > 기기의 가상 파워 카드(S6-4-1) 켜기 스위치. */
  virtualPower: "virtual-power",
} as const;

export type FocusTargetKey = (typeof FOCUS_TARGETS)[keyof typeof FOCUS_TARGETS];

/** 대상 요소에 펼쳐 넣는 속성. `<Input {...focusTargetProps(FOCUS_TARGETS.ftp)} />` */
export function focusTargetProps(key: FocusTargetKey | string): Record<typeof FOCUS_TARGET_ATTR, string> {
  return { [FOCUS_TARGET_ATTR]: key } as Record<typeof FOCUS_TARGET_ATTR, string>;
}

/** `path`(쿼리·해시 포함 가능)에 `focus` 쿼리를 더한다. 기존 쿼리·해시는 그대로 둔다. */
export function withFocus(path: string, key: FocusTargetKey | string): string {
  const url = new URL(path, "https://focus.invalid");
  url.searchParams.set(FOCUS_PARAM, key);
  return `${url.pathname}${url.search}${url.hash}`;
}

export type ThresholdSport = "bike" | "run" | "swim" | "tri";

/** 기준값(FTP·심박·역치 페이스·CSS) 설정 칸으로 가는 링크. 종목 화면을 맞춰 연다. */
export function thresholdSettingsHref(sport: ThresholdSport, key: FocusTargetKey): string {
  // 해시(#thresholds)는 붙이지 않는다 — Layout 의 해시 복원이 DOM 변화마다 구역 맨 위로 다시 끌어올려
  // 칸을 가운데로 꺼낸 스크롤과 다툰다. 스크롤은 useFocusTarget 이 대상 칸 기준으로 맡는다.
  return withFocus(`/settings/training?sport=${sport}`, key);
}

/** 종목의 부하(TSS) 계산 기준값 칸 — 사이클 FTP, 러닝 역치 페이스, 수영 CSS. 부하 미확인 경고가 쓴다. */
export function loadThresholdHref(sport: "bike" | "run" | "swim"): string {
  const key = sport === "bike" ? FOCUS_TARGETS.ftp : sport === "run" ? FOCUS_TARGETS.thresholdPace : FOCUS_TARGETS.css;
  return thresholdSettingsHref(sport, key);
}

/** 체중·키 입력칸으로 가는 링크. */
export function bodyInfoHref(key: typeof FOCUS_TARGETS.weight | typeof FOCUS_TARGETS.height = FOCUS_TARGETS.weight): string {
  return withFocus("/settings/account", key);
}

/**
 * 내 가입 신청 기록에서 그 클럽 행을 가리키는 키. 클럽 id 는 대소문자가 섞여 키 규칙(소문자·숫자·하이픈)에
 * 맞지 않으므로 바이트를 16진수로 바꿔 쓴다.
 */
export function clubRequestFocusKey(groupId: string): string {
  return `club-request-${Array.from(new TextEncoder().encode(groupId), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

const FOCUSABLE = "input, select, textarea, button, a[href], [tabindex]:not([tabindex='-1'])";

/**
 * 대상 요소를 화면에 꺼낸다 — 조상 `<details>` 를 펼치고, 화면 가운데로 스크롤한 뒤 초점을 둔다.
 * 대상이 초점 가능하지 않으면 안의 첫 초점 가능 요소에 둔다. 초점 성공 여부를 돌려준다.
 */
export function revealFocusTarget(target: HTMLElement): boolean {
  for (let node: HTMLElement | null = target.parentElement; node; node = node.parentElement) {
    if (node instanceof HTMLDetailsElement && !node.open) node.open = true;
  }
  const focusable = target.matches(FOCUSABLE) ? target : target.querySelector<HTMLElement>(FOCUSABLE);
  target.scrollIntoView?.({ block: "center" });
  // 불러오는 동안 잠긴 fieldset 안의 칸은 아직 초점을 받지 못한다 — 호출부가 풀린 뒤 다시 시도한다.
  if (!focusable || focusable.matches(":disabled")) return false;
  focusable.focus({ preventScroll: true });
  return document.activeElement === focusable;
}
