import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import DetailsSection from "./DetailsSection";

/** 접힌 상세의 기존 딥링크는 먼저 펼친 뒤 목적지로 이동한다. 내용은 계속 마운트한다. */
export default function AnchoredDetailsSection({ id, headingId, title, requested = false, defaultOpen = false, queryDetail = false, children }: {
  id?: string; headingId?: string; title: string; requested?: boolean; defaultOpen?: boolean; queryDetail?: boolean; children: ReactNode;
}) {
  const location = useLocation();
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const reveal = () => {
      const element = details.current;
      if (!element) return;
      const detail = queryDetail ? new URLSearchParams(location.search).get("detail") : null;
      if (detail != null) {
        element.open = detail === id;
        if (element.open) element.scrollIntoView?.({ behavior: "smooth", block: "start" });
        return;
      }
      const hash = window.location.hash || location.hash;
      let targetId: string;
      try { targetId = decodeURIComponent(hash.slice(1)); } catch { return; }
      const target = targetId ? [element, ...element.querySelectorAll<HTMLElement>("[id]")].find(node => node.id === targetId) : null;
      if (!requested && !target) return;
      element.open = true;
      (target ?? element).scrollIntoView?.({ behavior: "smooth", block: "start" });
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [id, location.key, location.hash, location.search, queryDetail, requested]);
  return <DetailsSection defaultOpen={defaultOpen} ref={details} id={id} headingId={headingId} title={title}>{children}</DetailsSection>;
}
