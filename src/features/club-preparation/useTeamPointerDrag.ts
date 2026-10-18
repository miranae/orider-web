import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import type { TeamDropTarget } from "./teamAssignment";

function scrollParent(element: HTMLElement): HTMLElement {
  let parent = element.parentElement;
  while (parent) {
    if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) return parent;
    parent = parent.parentElement;
  }
  return (document.scrollingElement ?? document.documentElement) as HTMLElement;
}

/** 핸들만 포인터를 캡처한다. 좌표로 드롭 영역을 찾으며 모바일 명단 스크롤을 보존한다. */
export function useTeamPointerDrag({
  container,
  revision,
  enabled,
  memberIds,
  onDrop,
  onInterrupted,
}: {
  container: RefObject<HTMLElement | null>;
  revision: number;
  enabled: boolean;
  memberIds: string[];
  onDrop: (memberId: string, target: TeamDropTarget) => void;
  onInterrupted: () => void;
}) {
  const latest = useRef({
    revision,
    enabled,
    memberIds,
    onDrop,
    onInterrupted,
  });
  latest.current = { revision, enabled, memberIds, onDrop, onInterrupted };
  const cleanup = useRef<(() => void) | null>(null);
  const sourceRevision = useRef<number | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropPlacement, setDropPlacement] = useState<TeamDropTarget | null>(
    null,
  );
  const [ghost, setGhost] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const ghostElement = useRef<HTMLDivElement | null>(null);
  const position = useRef({ x: 0, y: 0 });
  const attachGhost = useCallback((element: HTMLDivElement | null) => {
    ghostElement.current = element;
    if (element) {
      element.style.setProperty("--team-drag-x", `${position.current.x}px`);
      element.style.setProperty("--team-drag-y", `${position.current.y}px`);
    }
  }, []);
  useEffect(() => {
    if (
      sourceRevision.current !== null &&
      (!enabled || sourceRevision.current !== revision)
    ) {
      cleanup.current?.();
      latest.current.onInterrupted();
    }
  }, [enabled, revision]);
  useEffect(() => () => cleanup.current?.(), []);
  const start = (
    event: ReactPointerEvent<HTMLButtonElement>,
    memberId: string,
  ) => {
    if (
      !latest.current.enabled ||
      !latest.current.memberIds.includes(memberId) ||
      event.button !== 0 ||
      event.isPrimary === false
    )
      return;
    cleanup.current?.();
    const handle = event.currentTarget;
    const row = handle.closest<HTMLElement>("[data-team-member]") ?? handle;
    const bounds = row.getBoundingClientRect();
    // 잡은 지점을 유지한다. 스크롤과 무관한 viewport 좌표를 body portal에 전달한다.
    const offsetX = event.clientX - bounds.left;
    const offsetY = event.clientY - bounds.top;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    let x = startX;
    let y = startY;
    let active = false;
    let target: TeamDropTarget | null = null;
    let frame = 0;
    const initialRevision = latest.current.revision;
    const scroll = scrollParent(handle);
    sourceRevision.current = initialRevision;
    const hit = () => {
      const element = document.elementFromPoint?.(x, y);
      const node = element?.closest<HTMLElement>("[data-team-drop]");
      let nextTarget: TeamDropTarget | null = null;
      if (node && container.current?.contains(node)) {
        const teamId = node.getAttribute("data-team-drop") ?? "";
        const row = element?.closest<HTMLElement>("[data-team-member]");
        if (teamId && row && node.contains(row)) {
          const rect = row.getBoundingClientRect();
          nextTarget = {
            teamId,
            anchorId: row.getAttribute("data-team-member")!,
            side: y < rect.top + rect.height / 2 ? "before" : "after",
          };
        } else {
          nextTarget = { teamId };
          // 제목·행 사이 여백도 가까운 다음 회원 앞에 삽입한다. 맨 아래 빈 영역만 append.
          if (teamId) {
            const nextRow = [
              ...node.querySelectorAll<HTMLElement>("[data-team-member]"),
            ].find((item) => {
              const rect = item.getBoundingClientRect();
              return y < rect.top + rect.height / 2;
            });
            if (nextRow)
              nextTarget = {
                teamId,
                anchorId: nextRow.getAttribute("data-team-member")!,
                side: "before",
              };
          }
        }
      }
      if (
        nextTarget?.teamId !== target?.teamId ||
        nextTarget?.anchorId !== target?.anchorId ||
        nextTarget?.side !== target?.side
      ) {
        target = nextTarget;
        setDropPlacement(target);
      }
    };
    const valid = () =>
      latest.current.enabled &&
      latest.current.revision === initialRevision &&
      latest.current.memberIds.includes(memberId);
    const stop = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", cancel);
      handle.removeEventListener("lostpointercapture", cancel);
      cancelAnimationFrame(frame);
      if (handle.hasPointerCapture?.(pointerId))
        handle.releasePointerCapture(pointerId);
      sourceRevision.current = null;
      cleanup.current = null;
      setDraggedId(null);
      setGhost(null);
      setDropPlacement(null);
    };
    const tick = () => {
      if (!valid()) {
        stop();
        latest.current.onInterrupted();
        return;
      }
      const bounds =
        scroll === document.scrollingElement ||
        scroll === document.documentElement
          ? { top: 0, bottom: window.innerHeight }
          : scroll.getBoundingClientRect();
      const edge = 56;
      const delta =
        y < bounds.top + edge
          ? -Math.ceil(Math.min(18, (bounds.top + edge - y) / 3))
          : y > bounds.bottom - edge
            ? Math.ceil(Math.min(18, (y - bounds.bottom + edge) / 3))
            : 0;
      if (delta) {
        if (typeof scroll.scrollBy === "function")
          scroll.scrollBy({ top: delta, behavior: "auto" });
        else scroll.scrollTop += delta;
      }
      // 휠·트랙패드 스크롤로 카드가 움직여도 정지한 포인터 아래 대상을 갱신한다.
      hit();
      frame = requestAnimationFrame(tick);
    };
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      if (!valid()) {
        stop();
        latest.current.onInterrupted();
        return;
      }
      x = next.clientX;
      y = next.clientY;
      if (!active && Math.hypot(x - startX, y - startY) >= 6) {
        active = true;
        setDraggedId(memberId);
        setGhost({ width: bounds.width, height: bounds.height });
        frame = requestAnimationFrame(tick);
      }
      if (active) {
        // 좌표는 보드 state와 분리한다. 첫 mount도 이 최신 좌표를 사용한다.
        position.current = { x: x - offsetX, y: y - offsetY };
        if (ghostElement.current) {
          ghostElement.current.style.setProperty(
            "--team-drag-x",
            `${position.current.x}px`,
          );
          ghostElement.current.style.setProperty(
            "--team-drag-y",
            `${position.current.y}px`,
          );
        }
        next.preventDefault();
        hit();
      }
    };
    const up = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      x = next.clientX;
      y = next.clientY;
      if (active) hit();
      const destination = target;
      const shouldDrop = active && valid() && destination !== null;
      stop();
      if (shouldDrop) latest.current.onDrop(memberId, destination!);
    };
    const cancel = () => stop();
    const key = (next: KeyboardEvent) => {
      if (next.key === "Escape") {
        next.preventDefault();
        stop();
      }
    };
    cleanup.current = stop;
    window.addEventListener("pointermove", move, {
      capture: true,
      passive: false,
    });
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", cancel);
    handle.addEventListener("lostpointercapture", cancel);
    handle.setPointerCapture?.(pointerId);
  };
  return {
    start,
    draggedId,
    dropTarget: dropPlacement?.teamId ?? null,
    dropPlacement,
    ghost,
    attachGhost,
  };
}
