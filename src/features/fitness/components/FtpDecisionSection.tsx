import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import AnchoredDetailsSection from "../../../components/redesign/AnchoredDetailsSection";
import DetailsSection from "../../../components/redesign/DetailsSection";
import { Section } from "../../../theme/components";

/** 데스크톱 결정 영역과 임베드를 보존하고 모바일 분석은 딥링크로 펼친다. */
export default function FtpDecisionSection({ title, anchorEnabled, preserveExpanded = false, compact = false, children }: { title: string; anchorEnabled: boolean; preserveExpanded?: boolean; compact?: boolean; children: ReactNode }) {
  const location = useLocation();
  const details = useRef<HTMLDivElement>(null);
  const requested = location.hash === "#ftp-decision" || new URLSearchParams(location.search).has("decisionId");
  useEffect(() => {
    if (!anchorEnabled || !requested || !details.current) return;
    details.current.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [anchorEnabled, requested, location.key]);
  if (anchorEnabled && compact) return <AnchoredDetailsSection id="ftp-decision" headingId="condition-ftp" title={title} requested={requested}>{children}</AnchoredDetailsSection>;
  if (!anchorEnabled && preserveExpanded) return <>{children}</>;
  if (!anchorEnabled) return <DetailsSection title={title}>{children}</DetailsSection>;
  return <div ref={details}><Section data-testid="K1-6" id="ftp-decision" title={title} headingId="condition-ftp" className="condition-ftp-section condition-section-target">
    {children}
  </Section></div>;
}
