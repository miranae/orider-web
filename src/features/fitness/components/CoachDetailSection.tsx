import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Text } from "../../../theme/components";
import { useTrainingDialog } from "../../../components/training/useTrainingDialog";
import "./CoachDetailSection.css";

/** URL-backed mobile detail surface. The summary stays in place while details scroll independently. */
export default function CoachDetailSection({ id, title, requested = false, children }: {
  id: string; title: string; requested?: boolean; children: ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation("common");
  const headingId = useId();
  const entry = useRef<HTMLButtonElement>(null);
  const previouslyActive = useRef(false);
  const params = new URLSearchParams(location.search);
  const detail = params.get("detail");
  const active = detail === id || detail == null && (requested || location.hash === `#${id}`);
  const close = () => {
    if (location.state?.coachDetail === id) { navigate(-1); return; }
    const next = new URLSearchParams(location.search);
    next.set("detail", "closed");
    navigate({ search: next.toString(), hash: location.hash }, { replace: true, preventScrollReset: true });
  };
  const surface = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active || !surface.current) return;
    const siblings = Array.from(document.body.children).filter((node): node is HTMLElement => node instanceof HTMLElement && node !== surface.current && !node.classList.contains("coach-detail"));
    const previous = siblings.map(node => node.inert);
    siblings.forEach(node => { node.inert = true; });
    return () => { siblings.forEach((node, index) => { node.inert = previous[index]!; }); };
  }, [active]);
  const panel = useTrainingDialog(close, false, active);
  useEffect(() => {
    const wasActive = previouslyActive.current;
    previouslyActive.current = active;
    if (active || !wasActive) return;
    const frame = requestAnimationFrame(() => { if (entry.current?.isConnected) entry.current.focus(); });
    return () => cancelAnimationFrame(frame);
  }, [active]);
  const open = () => {
    const next = new URLSearchParams(location.search);
    next.set("detail", id);
    navigate({ search: next.toString(), hash: location.hash }, { state: { ...location.state, coachDetail: id }, preventScrollReset: true });
  };
  return <>
    <div id={id} className="coach-detail-entry">
      <Button ref={entry} variant="neutral" block onClick={open} aria-haspopup="dialog">{title} →</Button>
    </div>
    {createPortal(<div ref={surface} className="coach-detail" hidden={!active}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={headingId} tabIndex={-1} className="coach-detail__panel">
        <header className="coach-detail__header">
          <Button variant="ghost" data-dialog-initial-focus onClick={close}>← {t("button.back")}</Button>
          <Text as="h2" variant="subtitle" id={headingId}>{title}</Text>
        </header>
        <div className="coach-detail__body">{children}</div>
      </div>
    </div>, document.body)}
  </>;
}
