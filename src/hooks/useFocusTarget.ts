import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { debugLog } from "../services/errorLogger";
import { FOCUS_PARAM, FOCUS_TARGET_ATTR, revealFocusTarget } from "../services/focusTarget";

/** 대상 칸이 늦게 그려지거나(지연 로딩) 불러오는 동안 잠겨 있어도 이 시간까지는 기다린다. */
export const FOCUS_TARGET_TIMEOUT_MS = 8000;

/**
 * `?focus=<키>` 로 들어온 화면에서 `data-focus-target="<키>"` 칸을 꺼내 초점을 둔다(services/focusTarget).
 * 칸이 아직 없거나 잠겨 있으면 DOM 변화를 지켜보다 풀리는 즉시 다시 시도하고, 시한을 넘기면 포기한다.
 * 사용자가 먼저 다른 곳을 누르거나 키를 치면 끌어오지 않는다.
 */
export function useFocusTarget(root: Document | HTMLElement | null = typeof document === "undefined" ? null : document) {
  const location = useLocation();
  const key = new URLSearchParams(location.search).get(FOCUS_PARAM);
  useEffect(() => {
    // 키는 FOCUS_TARGETS 의 소문자·하이픈 문자열뿐이다 — 그 밖의 값은 선택자에 넣지 않는다.
    if (!key || !/^[a-z0-9-]+$/.test(key) || !root) return;
    const scope = root instanceof Document ? root.body : root;
    let done = false;
    const startedAt = Date.now();
    const finish = (outcome: "focused" | "timeout" | "user" | "left") => {
      if (done) return;
      done = true;
      observer.disconnect();
      clearTimeout(deadline);
      for (const event of ["pointerdown", "keydown"]) scope.removeEventListener(event, onUser, true);
      debugLog("focus-target", { key, outcome, path: location.pathname, waitedMs: Date.now() - startedAt });
    };
    const attempt = () => {
      if (done) return;
      const target = scope.querySelector<HTMLElement>(`[${FOCUS_TARGET_ATTR}="${key}"]`);
      if (target && revealFocusTarget(target)) finish("focused");
    };
    const onUser = () => finish("user");
    const observer = new MutationObserver(attempt);
    const deadline = setTimeout(() => finish("timeout"), FOCUS_TARGET_TIMEOUT_MS);
    for (const event of ["pointerdown", "keydown"]) scope.addEventListener(event, onUser, true);
    observer.observe(scope, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "open", FOCUS_TARGET_ATTR] });
    attempt();
    return () => finish("left");
  }, [key, root, location.key, location.pathname]);
}
