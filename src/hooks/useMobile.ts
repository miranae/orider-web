import { useState, useEffect } from "react";

const MOBILE_BREAKPOINT = 768;

function matchesMobile(query: string): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(query).matches;
}

export function useMobile(breakpoint = MOBILE_BREAKPOINT): boolean {
  const query = `(max-width: ${breakpoint - 1}px), (pointer: coarse)`;
  const [isMobile, setIsMobile] = useState(() => matchesMobile(query));

  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = () => setIsMobile(mq.matches);
    mq.addEventListener("change", handler);
    setIsMobile(mq.matches);
    return () => mq.removeEventListener("change", handler);
  }, [query]);

  return isMobile;
}
