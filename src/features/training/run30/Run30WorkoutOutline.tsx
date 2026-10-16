import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Run30Segment, Run30Session } from "./run30Api";
import { compactRun30Segments, run30Duration } from "./run30Display";
import "./run30.css";

/** Display only: every source step remains available in its original order. */
export default function Run30WorkoutOutline({ session, showDuration = true }: { session: Run30Session; showDuration?: boolean }) {
  const { t } = useTranslation("training");
  const first = session.segments[0], last = session.segments[session.segments.length - 1];
  const phases = session.segments.length > 2 && /준비|몸풀기|warm[ -]?up/iu.test(first?.label ?? "") && /정리|cool[ -]?down/iu.test(last?.label ?? "");
  const blocks = compactRun30Segments(phases ? session.segments.slice(1, -1) : session.segments);
  const tail = phases && blocks.length > 1 && blocks[blocks.length - 1]!.repeats === 1 && blocks.slice(0, -1).some(block => block.repeats > 1) ? blocks[blocks.length - 1]! : null;
  const repeatingBlocks = tail ? blocks.slice(0, -1) : blocks;
  const segmentRow = (segment: Run30Segment) => <span className="run30-outline-step"><span>{segment.label}</span><strong>{segment.durationSec == null ? "—" : run30Duration(segment.durationSec, t)}</strong></span>;
  const body = <div className="run30-outline-blocks">{repeatingBlocks.map(block => <div key={block.segments[0]!.stepId} className="run30-outline-block">
    {block.repeats > 1 && <span className="run30-outline-repeat">{t("run30.outline.repeatCount", { count: block.repeats })}</span>}
    {block.segments.map(segment => <div key={segment.stepId}>{segmentRow(segment)}</div>)}
  </div>)}</div>;
  return <div className="run30-workout-outline">
    {showDuration && <div className="run30-outline-total"><span>{t("run30.outline.total")}</span><strong>{run30Duration(session.durationSec, t)}</strong></div>}
    {session.segments.length > 0 && <>
      {phases ? <div className="run30-outline-phases">
        <section><h4>{t("run30.outline.prepare")}</h4>{segmentRow(first!)}</section>
        <section><h4>{t("run30.outline.work")}</h4>{body}</section>
        {tail && <section className="run30-outline-tail"><h4>{t("run30.outline.afterRepeat")}</h4>{tail.segments.map(segment => <div key={segment.stepId}>{segmentRow(segment)}</div>)}</section>}
        <section><h4>{t("run30.outline.finish")}</h4>{segmentRow(last!)}</section>
      </div> : body}
      <details className="run30-outline-details"><summary><span>{t("run30.outline.allSteps", { count: session.segments.length })}</span><ChevronDown size={16} aria-hidden="true" /></summary>
        <ol className="run30-segments">{session.segments.map(segment => <li key={segment.stepId}>{segmentRow(segment)}</li>)}</ol>
      </details>
    </>}
  </div>;
}
