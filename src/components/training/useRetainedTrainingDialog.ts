import { useRetainedPageVisible } from "../../contexts/RetainedPageContext";
import { useTrainingDialog } from "./useTrainingDialog";

/** Opt in only when the dialog's portal is also suspended for its retained owner. */
export function useRetainedTrainingDialog<T extends HTMLElement = HTMLDivElement>(onClose: () => void, busy: boolean, active = true) {
  const visible = useRetainedPageVisible();
  return useTrainingDialog<T>(onClose, busy, active && visible);
}
