import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import DetailsSection from "../../../components/redesign/DetailsSection";
import { Text } from "../../../theme/components";

/** 코치 컨디션의 결정 딥링크만 펼친다. 기존 임베드의 접힘 동작은 유지한다. */
export default function FtpDecisionSection({ title, anchorEnabled, preserveExpanded = false, children }: { title: string; anchorEnabled: boolean; preserveExpanded?: boolean; children: ReactNode }) {
  const location = useLocation();
  const details = useRef<HTMLDetailsElement>(null);
  const requested = location.hash === "#ftp-decision" || new URLSearchParams(location.search).has("decisionId");
  useEffect(() => {
    if (!anchorEnabled || !requested || !details.current) return;
    details.current.open = true;
    details.current.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [anchorEnabled, requested, location.key]);
  if (!anchorEnabled && preserveExpanded) return <>{children}</>;
  if (!anchorEnabled) return <DetailsSection title={title}>{children}</DetailsSection>;
  return <details data-testid="K1-6" id="ftp-decision" ref={details} open={requested} className="rounded-[var(--r-lg)] border border-[var(--line-soft)] p-3">
    <summary className="cursor-pointer py-3"><Text variant="label">{title}</Text></summary>
    {children}
  </details>;
}
