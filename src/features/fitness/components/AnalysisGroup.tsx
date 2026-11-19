import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Text } from "../../../theme/components";
import "./analysis-group.css";

/**
 * 코치 분석의 큰 묶음(수행 능력 변화 · 기간별 훈련 구성 · 해석과 근거). 펼친 채로 두고,
 * `?detail=<id>`·`#<id>` 로 들어오면 이 묶음으로 이동한다.
 */
export function AnalysisGroup({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const location = useLocation();
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    const detail = new URLSearchParams(location.search).get("detail");
    if (detail === id || detail == null && location.hash === `#${id}`) section.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [id, location.key, location.hash, location.search]);
  return <section ref={section} id={id} className="analysis-group condition-section-target" tabIndex={-1} aria-labelledby={`${id}-title`}>
    <header className="analysis-group__header">
      <Text as="h2" variant="title" id={`${id}-title`}>{title}</Text>
    </header>
    <div className="analysis-group__body">{children}</div>
  </section>;
}
