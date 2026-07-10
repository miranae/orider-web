import { useState, useEffect } from "react";

const MOBILE_BREAKPOINT = 768;

function matchesMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px), (pointer: coarse)`).matches;
}

export function useMobile(): boolean {
  const [isMobile, setIsMobile] = useState(matchesMobile);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px), (pointer: coarse)`);
    const handler = () => setIsMobile(matchesMobile());
    mq.addEventListener("change", handler);
    setIsMobile(matchesMobile());
    return () => mq.removeEventListener("change", handler);
  }, []);

  return isMobile;
}
