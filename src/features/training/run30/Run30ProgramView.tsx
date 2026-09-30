import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import Modal from "../../../components/Modal";
import { Alert, Button, Field, Progress, Select, Text, cn } from "../../../theme/components";
import type { Run30Api, Run30Program, Run30Session } from "./run30Api";
import {
  availableRun30Actions,
  buildRun30ViewModel,
  localToday,
  run30DateLabel,
  run30Duration,
  run30StatusLabel,
  type Run30ViewModel,
} from "./run30Display";
import Run30StageList from "./Run30StageList";
import { useRun30Start, type Run30StartMode } from "./run30Start";
import { useRun30Change, type Run30ChangeState } from "./useRun30Change";
import "./run30.css";

export interface Run30ProgramViewProps {
  api: Run30Api;
  program: Run30Program;
  onRefresh: () => Promise<void>;
  startMode: Run30StartMode;
  /** 테스트·서버 시간대 주입용. 기본값은 브라우저 오늘 날짜. */
  today?: string;
}

function StartControl({ mode, session }: { mode: Run30StartMode; session: Run30Session }) {
  const { t } = useTranslation("training");
  const { state, start } = useRun30Start(mode);
  if (mode.kind === "web") {
    return <Text as="p" variant="bodySmall" tone="tertiary" className="run30-hint">{t("run30.start.webOnly")}</Text>;
  }
  if (mode.kind === "host-unsupported") {
    return <Text as="p" variant="bodySmall" tone="tertiary" className="run30-hint">{t("run30.start.hostUnsupported")}</Text>;
  }
  return (
    <div className="run30-start">
      <Button
        type="button"
        variant="primary"
        size="lg"
        block
        loading={state.status === "pending"}
        disabled={state.status === "pending" || state.status === "accepted"}
        onClick={() => { void start(session.scheduledSessionId); }}
      >
        {t("run30.start.button", { stage: session.stage })}
      </Button>
      {state.status === "pending" && <p role="status" className="run30-muted">{t("run30.start.pending")}</p>}
      {state.status === "accepted" && <p role="status" className="run30-muted">{t("run30.start.accepted")}</p>}
      {state.status === "error" && (
        <Alert variant="danger">{t(`run30.start.errors.${state.reason}`)}</Alert>
      )}
    </div>
  );
}

function ScheduleActions({
  program,
  session,
  change,
  today,
  includeDecision,
}: {
  program: Run30Program;
  session: Run30Session;
  change: Run30ChangeState;
  today: string;
  includeDecision: boolean;
}) {
  const { t, i18n } = useTranslation("training");
  const language = i18n.resolvedLanguage ?? i18n.language;
  const available = availableRun30Actions(program, session, today);
  const [retryDate, setRetryDate] = useState(program.retryDates[0] ?? "");
  const [postponeDate, setPostponeDate] = useState(available.postponeDates[0] ?? "");
  const retryId = useId();
  const postponeId = useId();
  const busy = change.phase !== "idle";
  const selectedRetry = program.retryDates.includes(retryDate) ? retryDate : program.retryDates[0] ?? "";
  const selectedPostpone = available.postponeDates.includes(postponeDate) ? postponeDate : available.postponeDates[0] ?? "";
  const needsDecision = ["missed", "partial", "abandoned"].includes(session.status);
  const showDecision = includeDecision && (available.retry || available.continue || needsDecision);
  const showSchedule = available.skip || available.postpone;
  if (!showDecision && !showSchedule) return null;

  return (
    <div className="run30-actions">
      {showDecision && (
        <div className="run30-actions__group">
          {available.retry ? (
            <>
              <Text as="p" variant="bodySmall" tone="tertiary">{t("run30.actions.retryIntro")}</Text>
              <Field label={t("run30.actions.retryDate")} htmlFor={retryId}>
                <Select id={retryId} value={selectedRetry} disabled={busy} onChange={(event) => setRetryDate(event.target.value)}>
                  {program.retryDates.map((date) => (
                    <option key={date} value={date}>{run30DateLabel(date, language)}</option>
                  ))}
                </Select>
              </Field>
              <Button type="button" variant="primary" disabled={busy || !selectedRetry}
                onClick={() => { void change.requestPreview("retry", session.stage, selectedRetry); }}>
                {t("run30.actions.retry")}
              </Button>
            </>
          ) : needsDecision && (
            <Text as="p" variant="bodySmall" tone="tertiary">{t("run30.actions.retryNone")}</Text>
          )}
          {available.continue && (
            <Button type="button" variant="secondary" disabled={busy}
              onClick={() => { void change.requestPreview("continue", session.stage); }}>
              {t("run30.actions.continue")}
            </Button>
          )}
        </div>
      )}
      {showSchedule && (
        <div className="run30-actions__group">
          <h4 className="run30-subtitle">{t("run30.actions.scheduleTitle")}</h4>
          {available.skip && (
            <Button type="button" variant="secondary" disabled={busy}
              onClick={() => { void change.requestPreview("skip", session.stage); }}>
              {t("run30.actions.skip")}
            </Button>
          )}
          {available.postpone && (
            <>
              <Text as="p" variant="bodySmall" tone="tertiary">{t("run30.actions.postponeHint")}</Text>
              <Field label={t("run30.actions.postponeDate")} htmlFor={postponeId}>
                <Select id={postponeId} value={selectedPostpone} disabled={busy} onChange={(event) => setPostponeDate(event.target.value)}>
                  {available.postponeDates.map((date) => (
                    <option key={date} value={date}>{run30DateLabel(date, language)}</option>
                  ))}
                </Select>
              </Field>
              <Button type="button" variant="secondary" disabled={busy || !selectedPostpone}
                onClick={() => { void change.requestPreview("postpone", session.stage, selectedPostpone); }}>
                {t("run30.actions.postpone")}
              </Button>
            </>
          )}
        </div>
      )}
      {change.phase === "previewing" && <p role="status" className="run30-muted">{t("run30.actions.previewing")}</p>}
      {change.previewError && <Alert variant="danger">{change.previewError}</Alert>}
    </div>
  );
}

function TodayCard({
  program,
  viewModel,
  change,
  startMode,
  today,
}: {
  program: Run30Program;
  viewModel: Run30ViewModel;
  change: Run30ChangeState;
  startMode: Run30StartMode;
  today: string;
}) {
  const { t, i18n } = useTranslation("training");
  const language = i18n.resolvedLanguage ?? i18n.language;
  const { next, todayKind } = viewModel;
  const decision = program.nextWorkoutDecision;

  return (
    <section className="run30-card run30-today" aria-labelledby="run30-today-title" data-today-action={todayKind}>
      <Text as="div" variant="eyebrow" id="run30-today-title">{t("run30.today.eyebrow")}</Text>
      {todayKind === "finished" || !next ? (
        <p className="run30-lead">{t("run30.today.finished")}</p>
      ) : todayKind === "start" ? (
        <>
          <p className="run30-lead">
            {t("run30.today.stageWorkout", { stage: next.stage, workout: next.workoutName || t("run30.today.workoutFallback") })}
          </p>
          <p className="run30-muted">{t("run30.today.total", { duration: run30Duration(next.durationSec, t) })}</p>
          <Text as="p" variant="bodySmall" tone="tertiary">{t("run30.today.breathing")}</Text>
          <StartControl mode={startMode} session={next} />
          <ScheduleActions program={program} session={next} change={change} today={today} includeDecision={false} />
        </>
      ) : todayKind === "rest" ? (
        <>
          <p className="run30-lead">{t("run30.today.rest", { date: run30DateLabel(next.localDate, language), stage: next.stage })}</p>
          <Text as="p" variant="bodySmall" tone="tertiary">{t("run30.today.restHint")}</Text>
          <ScheduleActions program={program} session={next} change={change} today={today} includeDecision={false} />
        </>
      ) : todayKind === "hold" ? (
        <>
          <p className="run30-lead">{t("run30.today.holdTitle")}</p>
          <p className="run30-warning">{decision?.reason || t("run30.today.holdFallback")}</p>
          <ScheduleActions program={program} session={next} change={change} today={today} includeDecision={false} />
        </>
      ) : (
        <>
          <p className="run30-lead">
            {t("run30.today.decideTitle", {
              stage: next.stage,
              date: run30DateLabel(next.localDate, language),
              status: run30StatusLabel(next.status, t),
            })}
          </p>
          <Text as="p" variant="bodySmall" tone="tertiary">
            {next.status === "missed"
              ? t("run30.today.decideMissed")
              : next.status === "partial" || next.status === "abandoned"
                ? t("run30.today.decidePartial")
                : t("run30.today.decideHold")}
          </Text>
          {viewModel.retryCountForNext > 0 && (
            <p className="run30-muted">{t("run30.actions.retryCount", { count: viewModel.retryCountForNext })}</p>
          )}
          <ScheduleActions program={program} session={next} change={change} today={today} includeDecision />
        </>
      )}
    </section>
  );
}

function ChangeDialog({ change }: { change: Run30ChangeState }) {
  const { t, i18n } = useTranslation("training");
  const language = i18n.resolvedLanguage ?? i18n.language;
  const preview = change.preview;
  if (!preview || (change.phase !== "ready" && change.phase !== "confirming")) return null;
  const confirming = change.phase === "confirming";
  const title = t("run30.change.title", { stage: preview.stage });
  const close = () => { if (!confirming) change.cancel(); };
  return (
    <Modal open onClose={close} title={title}>
      <div role="dialog" aria-modal="true" aria-label={title} className="run30-dialog">
        <p className="run30-lead">
          {preview.toLocalDate
            ? t("run30.change.rangeMove", {
              stage: preview.stage,
              from: run30DateLabel(preview.fromLocalDate, language),
              to: run30DateLabel(preview.toLocalDate, language),
            })
            : t("run30.change.range", { stage: preview.stage, from: run30DateLabel(preview.fromLocalDate, language) })}
        </p>
        <p>{preview.message}</p>
        <p className="run30-safety-text">{preview.safetyGuidance}</p>
        <Text as="p" variant="caption" tone="tertiary">{t("run30.change.notApplied")}</Text>
        {confirming && <p role="status" className="run30-muted">{t("run30.change.applying")}</p>}
        {change.confirmError && <Alert variant="danger">{change.confirmError}</Alert>}
        <div className="run30-dialog__actions">
          <Button type="button" variant="ghost" disabled={confirming} onClick={close}>{t("run30.change.cancel")}</Button>
          <Button type="button" variant="primary" loading={confirming} disabled={confirming}
            onClick={() => { void change.confirm(); }}>
            {t(`run30.change.confirm.${preview.action}`)}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** 계획 탭의 Run30 프로그램 관리 화면(임베드·웹 공용). */
export default function Run30ProgramView({ api, program, onRefresh, startMode, today: todayOverride }: Run30ProgramViewProps) {
  const { t } = useTranslation("training");
  const viewModel = useMemo(() => buildRun30ViewModel(program), [program]);
  const change = useRun30Change(api, program, onRefresh);
  const today = todayOverride ?? localToday();
  const decision = program.nextWorkoutDecision;
  const hold = decision?.status === "hold";
  const [refreshing, setRefreshing] = useState(false);

  return (
    <div className="run30" data-testid="run30-program">
      <section className="run30-card run30-header" aria-labelledby="run30-title">
        <div className="run30-section-head">
          <h2 id="run30-title" className="run30-title">{t("run30.title")}</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            loading={refreshing}
            disabled={refreshing || change.phase !== "idle"}
            onClick={() => {
              setRefreshing(true);
              void onRefresh().finally(() => setRefreshing(false));
            }}
          >
            {t("run30.refresh")}
          </Button>
        </div>
        <p className="run30-progress-text">
          {t("run30.progress", { completed: viewModel.completedStages, total: viewModel.totalStages })}
          {" · "}
          {t("run30.remaining", { count: program.remainingStages })}
        </p>
        <Progress value={viewModel.progress} size="sm" aria-label={t("run30.progressLabel")} />
        {decision && (
          <>
            <p className={cn("run30-decision", hold && "run30-warning")} data-decision={decision.status}>
              {t(hold ? "run30.decision.hold" : "run30.decision.maintain", { reason: decision.reason })}
            </p>
            <Text as="p" variant="caption" tone="tertiary">
              {t(decision.provenance === "owner_feedback_v1" ? "run30.decision.basisFeedback" : "run30.decision.basisRecord")}
            </Text>
          </>
        )}
      </section>

      <TodayCard program={program} viewModel={viewModel} change={change} startMode={startMode} today={today} />

      <Run30StageList viewModel={viewModel} />

      <section className="run30-card run30-safety" aria-labelledby="run30-safety-title">
        <h3 id="run30-safety-title" className="run30-section-title">{t("run30.safety.title")}</h3>
        <p className="run30-safety-text">{program.safetyGuidance}</p>
      </section>

      <ChangeDialog change={change} />
    </div>
  );
}
