import type { PointerEvent } from "react";

export const KEYBOARD_INPUT_SELECTOR = "input:not([type='checkbox'], [type='radio'], [type='range'], [type='file'], [type='color'], [type='button'], [type='submit'], [type='reset']), textarea, select, [contenteditable='true'], [contenteditable='']";

/** Latch the editing layout through a pointer gesture without cancelling native touch clicks. */
export function preserveActionPosition(event: PointerEvent<HTMLElement>) {
  if (event.button !== 0 || !window.matchMedia("(max-width: 63.999rem), (pointer: coarse)").matches) return;
  const input = document.activeElement;
  if (!(input instanceof HTMLElement) || !input.matches(KEYBOARD_INPUT_SELECTOR)) return;
  if (!(event.target instanceof Element) || !event.target.closest("button, a[href]")) return;
  if (!document.documentElement.hasAttribute("data-mobile-keyboard-open")) return;
  const bar = event.currentTarget;
  bar.dataset.editingAction = "true";
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const release = () => {
    clearTimeout(timeout);
    document.removeEventListener("click", clicked, true);
    document.removeEventListener("pointerup", lifted, true);
    document.removeEventListener("pointercancel", release, true);
    delete bar.dataset.editingAction;
  };
  const clicked = () => { requestAnimationFrame(release); };
  const lifted = () => { timeout = setTimeout(release, 500); };
  document.addEventListener("click", clicked, true);
  document.addEventListener("pointerup", lifted, { capture: true, once: true });
  document.addEventListener("pointercancel", release, { capture: true, once: true });
}
