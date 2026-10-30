import { createContext, useContext, type ReactNode } from "react";

/** Comparison state stays in its owner; both curve readers share its control slot. */
export const PowerReadingControlsContext = createContext<ReactNode>(null);
export function PowerReadingControls({ children }: { children?: ReactNode }) {
  const comparison = useContext(PowerReadingControlsContext);
  return <div className="activity-power-reading-controls">{comparison}{children}</div>;
}
