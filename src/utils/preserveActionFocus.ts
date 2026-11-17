import type { PointerEvent } from "react";

/** Keep a mobile action still between pointerdown and click while its input owns focus. */
export function preserveActionFocus(event: PointerEvent<HTMLElement>) {
  if (event.button !== 0 || !window.matchMedia("(max-width: 63.999rem), (pointer: coarse)").matches) return;
  const input = document.activeElement;
  if (!(input instanceof HTMLElement) || !input.matches("input, textarea, select, [contenteditable='true'], [contenteditable='']")) return;
  if (event.target instanceof Element && event.target.closest("button, a[href]")) event.preventDefault();
}
