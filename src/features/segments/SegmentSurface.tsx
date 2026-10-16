import type { ComponentProps } from "react";
import { useLocation } from "react-router-dom";
import GlossaryProvider from "../../components/common/GlossaryProvider";
import "./segmentSurface.css";

/** Scope typography and term explanations to the segment journey. */
export default function SegmentSurface({ children, className = "", ...props }: ComponentProps<"div">) {
  const location = useLocation();
  return <GlossaryProvider scopeKey={`${location.pathname}${location.search}`}><div {...props} className={`segment-surface ${className}`}>{children}</div></GlossaryProvider>;
}
