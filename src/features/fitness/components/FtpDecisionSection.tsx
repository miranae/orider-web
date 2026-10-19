import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import DetailsSection from "../../../components/redesign/DetailsSection";
import { Section } from "../../../theme/components";

/** 컨디션은 열린 결정 영역과 딥링크를 제공하며 기존 임베드 접힘은 유지한다. */
export default function FtpDecisionSection({ title, anchorEnabled, preserveExpanded = false, children }: { title: string; anchorEnabled: boolean; preserveExpanded?: boolean; children: ReactNode }) {
  const location = useLocation();
  const details = useRef<HTMLDivElement>(null);
  const requested = location.hash === "#ftp-decision" || new URLSearchParams(location.search).has("decisionId");
  useEffect(() => {
    if (!anchorEnabled || !requested || !details.current) return;
    details.current.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [anchorEnabled, requested, location.key]);
  if (!anchorEnabled && preserveExpanded) return <>{children}</>;
  if (!anchorEnabled) return <DetailsSection title={title}>{children}</DetailsSection>;
  return <div ref={details}><Section data-testid="K1-6" id="ftp-decision" title={title} headingId="condition-ftp" className="condition-ftp-section condition-section-target">
    {children}
  </Section></div>;
}
