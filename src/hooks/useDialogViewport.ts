import { useEffect } from "react";
import { observeViewport, visibleViewport } from "../services/visibleViewport";

let users = 0;
let release: (() => void) | undefined;

/** Share one observer across nested portalled dialogs. */
export function useDialogViewport(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (users++ === 0) {
      const style = document.documentElement.style;
      const names = ["--dialog-viewport-top", "--dialog-viewport-height", "--dialog-viewport-bottom"];
      const previous = names.map(name => [style.getPropertyValue(name), style.getPropertyPriority(name)]);
      const update = () => {
        const bounds = visibleViewport();
        [bounds.top, bounds.height, Math.max(0, window.innerHeight - bounds.bottom)].forEach((value, i) => style.setProperty(names[i]!, `${value}px`));
      };
      update();
      const unobserve = observeViewport(update);
      release = () => {
        unobserve();
        names.forEach((name, i) => {
          const [value, priority] = previous[i]!;
          if (value) style.setProperty(name, value, priority); else style.removeProperty(name);
        });
      };
    }
    return () => { if (--users === 0) { release?.(); release = undefined; } };
  }, [active]);
}
