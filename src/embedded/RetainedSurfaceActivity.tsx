import { Activity, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * 숨긴 표면의 React 상태는 보존하고 구독·타이머 효과는 정리한다. 인증 브리지는 이 경계 밖에 둔다.
 *
 * [contentVisible] 은 호스트가 표면 선택을 비운 동안(코치 탭을 떠남) false 다. 숨김은 `display: none` 이라
 * 문서 높이가 0 이 되며 스크롤이 맨 위로 잘린다 — 숨기기 직전 위치를 기억했다가 다시 보일 때 되돌린다.
 */
export function RetainedSurfaceActivity({ foreground, contentVisible = true, children }: {
  foreground: boolean;
  contentVisible?: boolean;
  children: ReactNode;
}) {
  const [documentVisible, setDocumentVisible] = useState(() => document.visibilityState !== "hidden");
  useEffect(() => {
    const refresh = () => setDocumentVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);
  const active = foreground && documentVisible;
  useDocumentScrollRetention(active && contentVisible);
  return <Activity mode={active ? "visible" : "hidden"}>{children}</Activity>;
}

/**
 * 보이는 동안의 문서 스크롤 위치를 기억하고, 숨겼다 다시 보일 때 그 위치로 되돌린다.
 * 숨긴 뒤 문서가 줄며 생기는 스크롤 이벤트(위치 0)는 보이지 않는 동안이라 기록하지 않는다.
 */
export function useDocumentScrollRetention(visible: boolean) {
  const savedY = useRef<number | null>(null);
  const visibleRef = useRef(visible);
  useEffect(() => {
    const record = () => { if (visibleRef.current) savedY.current = window.scrollY; };
    window.addEventListener("scroll", record, { passive: true });
    return () => window.removeEventListener("scroll", record);
  }, []);
  useLayoutEffect(() => {
    const wasVisible = visibleRef.current;
    visibleRef.current = visible;
    const y = savedY.current;
    if (!visible || wasVisible || y === null || y <= 0) return;
    window.scrollTo(0, y);
    // 다시 보인 직후 레이아웃이 한 프레임 늦게 커지면 첫 이동이 잘린다 — 한 번 더 맞춘다.
    const frame = window.requestAnimationFrame(() => {
      if (visibleRef.current && window.scrollY !== y) window.scrollTo(0, y);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [visible]);
}
