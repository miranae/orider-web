import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button, Chip, cn } from "../../../theme/components";
import type { Run30Session } from "./run30Api";
import {
  run30DateLabel,
  run30Duration,
  run30StatusLabel,
  run30StatusTone,
  type Run30ViewModel,
} from "./run30Display";

function StageRow({ session, isNext }: { session: Run30Session; isNext: boolean }) {
  const { t, i18n } = useTranslation("training");
  const [expanded, setExpanded] = useState(isNext);
  const language = i18n.resolvedLanguage ?? i18n.language;
  const segmentsId = `run30-stage-${session.stage}-segments`;
  return (
    <li className={cn("run30-stage", isNext && "is-next")} data-testid={`run30-stage-${session.stage}`}>
      <div className="run30-stage__row">
        <div className="run30-stage__main">
          <span className="run30-stage__date">{run30DateLabel(session.localDate, language)}</span>
          <span className="run30-stage__title">
            {t("run30.stages.stage", { stage: session.stage })}
            {" · "}
            {session.workoutName || t("run30.today.workoutFallback")}
            {" · "}
            {run30Duration(session.durationSec, t)}
          </span>
        </div>
        <div className="run30-stage__meta">
          {isNext && <Chip variant="accent">{t("run30.stages.next")}</Chip>}
          <Chip variant={run30StatusTone(session.status)}>{run30StatusLabel(session.status, t)}</Chip>
        </div>
      </div>
      {session.segments.length > 0 && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={expanded}
            aria-controls={segmentsId}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded
              ? t("run30.stages.hideSegments")
              : t("run30.stages.showSegments", { count: session.segments.length })}
          </Button>
          {expanded && (
            <ol id={segmentsId} className="run30-segments">
              {session.segments.map((segment) => (
                <li key={segment.stepId}>
                  <span>{segment.label}</span>
                  <span className="run30-segments__duration">{run30Duration(segment.durationSec, t)}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </li>
  );
}

/** 24단계 전체 목록. 다음 회차를 강조하고 지난 회차는 기본으로 접는다. */
export default function Run30StageList({ viewModel }: { viewModel: Run30ViewModel }) {
  const { t } = useTranslation("training");
  const [showPast, setShowPast] = useState(false);
  const { pastSessions, next, upcomingSessions } = viewModel;
  const visible = [
    ...(showPast || !next ? pastSessions : []),
    ...(next ? [next] : []),
    ...upcomingSessions,
  ];
  return (
    <section className="run30-card run30-stages" aria-labelledby="run30-stages-title">
      <div className="run30-section-head">
        <h3 id="run30-stages-title" className="run30-section-title">{t("run30.stages.title")}</h3>
        {next && pastSessions.length > 0 && (
          <Button type="button" variant="ghost" size="sm" aria-expanded={showPast} onClick={() => setShowPast((value) => !value)}>
            {showPast ? t("run30.stages.hidePast") : t("run30.stages.showPast", { count: pastSessions.length })}
          </Button>
        )}
      </div>
      <ol className="run30-stage-list">
        {visible.map((session) => (
          <StageRow key={session.stage} session={session} isNext={session.stage === next?.stage} />
        ))}
      </ol>
    </section>
  );
}
