import { feedSessionKey } from "../services/feedNavigationDepth";
import { isHubReturnState } from "../services/hubReturn";
import { useLayoutEffect, useRef, type RefObject } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Layout의 내부 스크롤을 경로 이동·방문 이력·명시적 앵커에 맞춘다.
 * 뒤로 가기는 방문 이력(location.key)의 위치로, 다른 허브에서 탭으로 돌아온 이동(HUB_RETURN_STATE)은
 * 그 화면 URL(경로+쿼리 — 코치 ?sport 종목별로 따로)에서 마지막으로 보던 위치로 되돌린다.
 */
export function useMainScrollPosition(mainRef: RefObject<HTMLElement | null>, identity?: object | null) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const positions = useRef(new Map<string, { top: number; anchor?: string; offset?: number }>());
  const screenPositions = useRef(new Map<string, { top: number; anchor?: string; offset?: number }>());
  const previousIdentity = useRef(identity);
  const previousPath = useRef<string | null>(null);
  useLayoutEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const changedAccount = previousIdentity.current !== identity;
    previousIdentity.current = identity;
    const changedPage = previousPath.current !== location.pathname;
    previousPath.current = location.pathname;
    const positionKey = `${feedSessionKey(identity)}:${location.key}`;
    const screenKey = `${feedSessionKey(identity)}:${location.pathname}${location.search}`;
    const saved = changedAccount ? undefined
      : navigationType === "POP" ? positions.current.get(positionKey)
        : isHubReturnState(location.state) ? screenPositions.current.get(screenKey) : undefined;
    const desired = changedAccount ? 0 : saved?.top ?? (changedPage ? 0 : main.scrollTop);
    let targetId = "";
    try { targetId = decodeURIComponent(location.hash.slice(1)); } catch { /* 잘못된 앵커는 일반 경로처럼 처리한다. */ }
    let pending = true;
    let anchorResolved = false;
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => restore());
    const mutations = new MutationObserver(() => restore());
    const finish = () => { pending = false; resize?.disconnect(); mutations.disconnect(); };
    function restore() {
      if (!pending) return;
      if (targetId) {
        const target = document.getElementById(targetId);
        if (!target || !main!.contains(target)) return;
        target.scrollIntoView({ block: "start" });
        anchorResolved = true;
      } else if (saved?.anchor) {
        const anchor = Array.from(main!.querySelectorAll<HTMLElement>("[data-scroll-anchor]")).find(element => element.dataset.scrollAnchor === saved.anchor);
        if (anchor) {
          main!.scrollTop += anchor.getBoundingClientRect().top - main!.getBoundingClientRect().top - (saved.offset ?? 0);
          anchorResolved = true;
        } else main!.scrollTop = desired;
      } else {
        main!.scrollTop = desired;
        // 늦게 마운트되는 페이지도 돌아온 위치까지 높이가 생긴 뒤 복원을 끝낸다.
        if (!resize || main!.scrollHeight - main!.clientHeight >= desired) finish();
      }
    }
    if (changedPage) main.focus({ preventScroll: true });
    restore();
    if (pending) {
      if (targetId || saved?.anchor) mutations.observe(main, { childList: true, subtree: true });
      resize?.observe(main.firstElementChild ?? main);
    }
    const save = () => {
      if (pending && !anchorResolved) return;
      const top = main.getBoundingClientRect().top;
      const anchor = Array.from(main.querySelectorAll<HTMLElement>("[data-scroll-anchor]")).find(element => element.getBoundingClientRect().bottom > top);
      const position = { top: main.scrollTop, ...(anchor ? { anchor: anchor.dataset.scrollAnchor, offset: anchor.getBoundingClientRect().top - top } : {}) };
      for (const [store, key] of [[positions.current, positionKey], [screenPositions.current, screenKey]] as const) {
        store.delete(key);
        store.set(key, position);
        if (store.size > 50) store.delete(store.keys().next().value!);
      }
    };
    const restoreDeadline = saved?.anchor ? window.setTimeout(finish, 10000) : undefined;
    // 느린 복원이 사용자의 새 스크롤·키보드 조작과 경쟁하지 않게 한다.
    const takeOver = () => { finish(); save(); };
    main.addEventListener("scroll", save, { passive: true });
    for (const event of ["wheel", "pointerdown", "keydown"]) main.addEventListener(event, takeOver);
    return () => {
      finish();
      clearTimeout(restoreDeadline);
      main.removeEventListener("scroll", save);
      for (const event of ["wheel", "pointerdown", "keydown"]) main.removeEventListener(event, takeOver);
    };
  }, [location.key, location.pathname, location.search, location.hash, location.state, navigationType, mainRef, identity]);
}
