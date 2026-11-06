import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import CoachDetailSection from "./CoachDetailSection";
import AnchoredDetailsSection from "../../../components/redesign/AnchoredDetailsSection";
import DetailsSection from "../../../components/redesign/DetailsSection";
import { Section } from "../../../theme/components";

/** 데스크톱 결정 영역과 임베드를 보존하고 모바일 분석은 딥링크로 펼친다. */
/** [requestedOnly] 는 기본 화면에서 숨기고 `#ftp-decision`·`?detail=ftp-decision`·`decisionId` 로 들어올 때만 연다(코치 분석). */
export default function FtpDecisionSection({ title, anchorEnabled, preserveExpanded = false, compact = false, collapsible = false, requestedOnly = false, children }: { title: string; anchorEnabled: boolean; requestedOnly?: boolean; preserveExpanded?: boolean; compact?: boolean; collapsible?: boolean; children: ReactNode }) {
  const location = useLocation();
  const details = useRef<HTMLDivElement>(null);
  const params = new URLSearchParams(location.search);
  const detail = params.get("detail");
  const requested = detail === "ftp-decision" || detail == null && (location.hash === "#ftp-decision" || params.has("decisionId"));
  useEffect(() => {
    if (!anchorEnabled || !requested || !details.current) return;
    details.current.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [anchorEnabled, requested, location.key]);
  if (requestedOnly && !requested) return null;
  if (anchorEnabled && compact) return <CoachDetailSection id="ftp-decision" title={title} requested={requested}>{children}</CoachDetailSection>;
  if (anchorEnabled && collapsible && detail != null && !requested) return <DetailsSection id="ftp-decision" title={title}>{children}</DetailsSection>;
  if (anchorEnabled && collapsible) return <AnchoredDetailsSection id="ftp-decision" title={title} requested={requested}>{children}</AnchoredDetailsSection>;
  if (!anchorEnabled && preserveExpanded) return <>{children}</>;
  if (!anchorEnabled) return <DetailsSection title={title}>{children}</DetailsSection>;
  return <div ref={details}><Section data-testid="K1-6" id="ftp-decision" title={title} headingId="condition-ftp" className="condition-ftp-section condition-section-target">
    {children}
  </Section></div>;
}
