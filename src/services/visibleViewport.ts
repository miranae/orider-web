/** Bounds in layout viewport coordinates, also when the OS pans an overlay keyboard. */
export function visibleViewport() {
  const viewport = window.visualViewport;
  const top = viewport?.offsetTop ?? 0;
  const left = viewport?.offsetLeft ?? 0;
  const height = viewport?.height ?? window.innerHeight;
  const width = viewport?.width ?? window.innerWidth;
  return { top, left, height, width, bottom: top + height, right: left + width };
}

export function observeViewport(update: () => void) {
  const viewport = window.visualViewport;
  window.addEventListener("resize", update);
  window.addEventListener("scroll", update, true);
  viewport?.addEventListener("resize", update);
  viewport?.addEventListener("scroll", update);
  return () => {
    window.removeEventListener("resize", update);
    window.removeEventListener("scroll", update, true);
    viewport?.removeEventListener("resize", update);
    viewport?.removeEventListener("scroll", update);
  };
}
