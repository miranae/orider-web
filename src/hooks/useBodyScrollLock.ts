import { useEffect } from "react";

let lockCount = 0;
let scrollY = 0;
let previousBodyStyles: Partial<CSSStyleDeclaration> | null = null;

function lockBody() {
  if (typeof window === "undefined") return;
  if (lockCount === 0) {
    scrollY = window.scrollY || window.pageYOffset || 0;
    previousBodyStyles = {
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      right: document.body.style.right,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
    };
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;
}

function unlockBody() {
  if (typeof window === "undefined" || lockCount === 0) return;
  lockCount -= 1;
  if (lockCount > 0) return;

  const previous = previousBodyStyles;
  previousBodyStyles = null;
  document.body.style.position = previous?.position ?? "";
  document.body.style.top = previous?.top ?? "";
  document.body.style.left = previous?.left ?? "";
  document.body.style.right = previous?.right ?? "";
  document.body.style.width = previous?.width ?? "";
  document.body.style.overflow = previous?.overflow ?? "";
  window.scrollTo(0, scrollY);
  scrollY = 0;
}

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    lockBody();
    return unlockBody;
  }, [active]);
}
