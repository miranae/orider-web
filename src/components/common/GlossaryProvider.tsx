import { createContext, useContext, useMemo, type ReactNode } from "react";

const GlossaryContext = createContext<{ scopeKey?: string } | null>(null);

/** Opt a page into term explanations without remounting its form or page state. */
export function GlossaryProvider({ children, scopeKey }: { children: ReactNode; scopeKey?: string }) {
  const value = useMemo(() => ({ scopeKey }), [scopeKey]);
  return <GlossaryContext.Provider value={value}>{children}</GlossaryContext.Provider>;
}

export function useGlossaryEnabled() {
  return useContext(GlossaryContext) !== null;
}

export function useGlossaryScope() {
  return useContext(GlossaryContext)?.scopeKey;
}

export default GlossaryProvider;
