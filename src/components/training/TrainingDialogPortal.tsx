import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { useRetainedPageVisible } from "../../contexts/RetainedPageContext";

export function TrainingDialogPortal({ children }: { children: ReactNode }) {
  return useRetainedPageVisible() ? createPortal(children, document.body) : null;
}
