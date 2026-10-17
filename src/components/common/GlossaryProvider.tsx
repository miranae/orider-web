import { createContext, useContext, useMemo, type ReactNode } from "react";

export type GlossaryTriggerTone = "accent" | "inherit";
const GlossaryContext = createContext<{ scopeKey?: string; triggerTone?: GlossaryTriggerTone } | null>(null);

/**
 * Opt a page into term explanations without remounting its form or page state.
 * `triggerTone="inherit"` draws terms in the surrounding ink with a dotted underline instead of the accent colour
 * (for dense data surfaces where accent text would fall below 4.5:1 or read as emphasis).
 */
export function GlossaryProvider({ children, scopeKey, triggerTone }: { children: ReactNode; scopeKey?: string; triggerTone?: GlossaryTriggerTone }) {
  const value = useMemo(() => ({ scopeKey, triggerTone }), [scopeKey, triggerTone]);
  return <GlossaryContext.Provider value={value}>{children}</GlossaryContext.Provider>;
}

export function useGlossaryEnabled() {
  return useContext(GlossaryContext) !== null;
}

export function useGlossaryTriggerTone(): GlossaryTriggerTone {
  return useContext(GlossaryContext)?.triggerTone ?? "accent";
}

export function useGlossaryScope() {
  return useContext(GlossaryContext)?.scopeKey;
}

export default GlossaryProvider;
