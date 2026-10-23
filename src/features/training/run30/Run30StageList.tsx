import Run30WorkoutOutline from "./Run30WorkoutOutline";
import CoachDetailSection from "../../fitness/components/CoachDetailSection";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";

import { Button, Chip, cn } from "../../../theme/components";
import type { Run30Session } from "./run30Api";
import {
  run30DateLabel,
  run30Duration,
  run30StatusLabel,
  run30StatusTone,
  type Run30ViewModel,
} from "./run30Display";

function StageSummary({ session, isNext }: { session: Run30Session; isNext: boolean }) {
  const { t, i18n } = useTranslation("training");
  const language = i18n.resolvedLanguage ?? i18n.language;
  return (
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
  );
}

function StageRow({ session, isNext, stableDetails = false }: { session: Run30Session; isNext: boolean; stableDetails?: boolean }) {
  const { t } = useTranslation("training");
  const [expanded, setExpanded] = useState(isNext);
  const segmentsId = `run30-stage-${session.stage}-segments`;
  return (
    <li className={cn("run30-stage", isNext && "is-next")} data-testid={`run30-stage-${session.stage}`}>
      <StageSummary session={session} isNext={isNext} />
      {session.segments.length > 0 && (stableDetails ? (
        <CoachDetailSection id={`run30-stage-${session.stage}-detail`} title={`${t("run30.stages.stage", { stage: session.stage })} · ${t("run30.stages.showSegments", { count: session.segments.length })}`}>
          <StageSummary session={session} isNext={isNext} />
          <Run30WorkoutOutline session={session} />
        </CoachDetailSection>
      ) : (
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
            <div id={segmentsId}><Run30WorkoutOutline session={session} showDuration={false} /></div>
          )}
        </>
      ))}
    </li>
  );
}

/** A bookmarked stage remains readable after that stage moves into the past. */
function PastStageDetails({ sessions }: { sessions: Run30Session[] }) {
  const { t } = useTranslation("training");
  const location = useLocation();
  const detail = new URLSearchParams(location.search).get("detail");
  const requestedId = detail ?? location.hash.slice(1);
  const linkedStage = sessions.find(session => `run30-stage-${session.stage}-detail` === requestedId);
  const title = linkedStage
    ? `${t("run30.stages.stage", { stage: linkedStage.stage })} · ${t("run30.stages.showSegments", { count: linkedStage.segments.length })}`
    : t("run30.stages.showPast", { count: sessions.length });
  return <CoachDetailSection id={linkedStage ? requestedId : "run30-past-stages"} title={title}>
    <ol className="run30-stage-list">
      {(linkedStage ? [linkedStage] : sessions).map(session => <li key={session.stage} className="run30-stage" data-testid={`run30-past-stage-${session.stage}`}>
        <StageSummary session={session} isNext={false} />
        <Run30WorkoutOutline session={session} />
      </li>)}
    </ol>
  </CoachDetailSection>;
}

/** Web mobile opens stable detail surfaces; desktop and app retain their existing disclosure behavior. */
export default function Run30StageList({ viewModel, stableDetails = false }: { viewModel: Run30ViewModel; stableDetails?: boolean }) {
  const { t } = useTranslation("training");
  const [showPast, setShowPast] = useState(false);
  const { pastSessions, next, upcomingSessions } = viewModel;
  const visible = [
    ...(!stableDetails && (showPast || !next) ? pastSessions : []),
    ...(next ? [next] : []),
    ...upcomingSessions,
  ];
  return (
    <section className="run30-card run30-stages" aria-labelledby="run30-stages-title">
      <div className="run30-section-head">
        <h3 id="run30-stages-title" className="run30-section-title">{t("run30.stages.title")}</h3>
        {!stableDetails && next && pastSessions.length > 0 && (
          <Button type="button" variant="ghost" size="sm" aria-expanded={showPast} onClick={() => setShowPast((value) => !value)}>
            {showPast ? t("run30.stages.hidePast") : t("run30.stages.showPast", { count: pastSessions.length })}
          </Button>
        )}
      </div>
      {stableDetails && pastSessions.length > 0 && <PastStageDetails sessions={pastSessions} />}
      <ol className="run30-stage-list">
        {visible.map((session) => (
          <StageRow key={session.stage} session={session} isNext={session.stage === next?.stage} stableDetails={stableDetails} />
        ))}
      </ol>
    </section>
  );
}
