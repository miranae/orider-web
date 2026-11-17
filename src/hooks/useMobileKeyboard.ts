import { useEffect } from "react";
import { observeViewport, visibleViewport } from "../services/visibleViewport";
import { KEYBOARD_INPUT_SELECTOR } from "../utils/preserveActionPosition";

/** Compare to the resting height, including WebViews that resize innerHeight with the IME. */
export function useMobileKeyboard() {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-mobile-keyboard-open");
    let resting = visibleViewport();
    let layoutWidth = window.innerWidth;
    let open = false;
    let disposed = false;
    const update = () => {
      if (disposed) return;
      const bounds = visibleViewport();
      const editing = document.activeElement?.matches(KEYBOARD_INPUT_SELECTOR) ?? false;
      if (Math.abs(window.innerWidth - layoutWidth) > 80 || !editing && !open) resting = bounds;
      layoutWidth = window.innerWidth;
      open = (editing || open) && resting.height - bounds.height > 120;
      if (!open && !editing) resting = bounds;
      root.toggleAttribute("data-mobile-keyboard-open", open);
    };
    const focusChanged = () => queueMicrotask(update);
    update();
    const stop = observeViewport(update);
    document.addEventListener("focusin", focusChanged);
    document.addEventListener("focusout", focusChanged);
    return () => {
      disposed = true;
      stop();
      document.removeEventListener("focusin", focusChanged);
      document.removeEventListener("focusout", focusChanged);
      if (previous === null) root.removeAttribute("data-mobile-keyboard-open"); else root.setAttribute("data-mobile-keyboard-open", previous);
    };
  }, []);
}
