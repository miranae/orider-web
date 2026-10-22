import { useLayoutEffect, useRef, type RefObject } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/** Layout의 내부 스크롤을 경로 이동·방문 이력·명시적 앵커에 맞춘다. */
export function useMainScrollPosition(mainRef: RefObject<HTMLElement | null>) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const positions = useRef(new Map<string, number>());
  const previousPath = useRef<string | null>(null);
  useLayoutEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const changedPage = previousPath.current !== location.pathname;
    previousPath.current = location.pathname;
    const desired = navigationType === "POP" ? positions.current.get(location.key) ?? 0 : changedPage ? 0 : main.scrollTop;
    let targetId = "";
    try { targetId = decodeURIComponent(location.hash.slice(1)); } catch { /* 잘못된 앵커는 일반 경로처럼 처리한다. */ }
    let pending = true;
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => restore());
    const mutations = new MutationObserver(() => restore());
    const finish = () => { pending = false; resize?.disconnect(); mutations.disconnect(); };
    function restore() {
      if (!pending) return;
      if (targetId) {
        const target = document.getElementById(targetId);
        if (!target || !main!.contains(target)) return;
        target.scrollIntoView({ block: "start" });
        finish();
      } else {
        main!.scrollTop = desired;
        // 늦게 마운트되는 페이지도 돌아온 위치까지 높이가 생긴 뒤 복원을 끝낸다.
        if (!resize || main!.scrollHeight - main!.clientHeight >= desired) finish();
      }
    }
    if (changedPage) main.focus({ preventScroll: true });
    restore();
    if (pending) {
      if (targetId) mutations.observe(main, { childList: true, subtree: true });
      else resize?.observe(main.firstElementChild ?? main);
    }
    const save = () => {
      if (pending) return;
      positions.current.set(location.key, main.scrollTop);
      if (positions.current.size > 50) positions.current.delete(positions.current.keys().next().value!);
    };
    // 느린 복원이 사용자의 새 스크롤·키보드 조작과 경쟁하지 않게 한다.
    const takeOver = () => { finish(); save(); };
    main.addEventListener("scroll", save, { passive: true });
    for (const event of ["wheel", "pointerdown", "keydown"]) main.addEventListener(event, takeOver, { once: true });
    return () => {
      finish();
      main.removeEventListener("scroll", save);
      for (const event of ["wheel", "pointerdown", "keydown"]) main.removeEventListener(event, takeOver);
    };
  }, [location.key, location.pathname, location.hash, navigationType, mainRef]);
}
