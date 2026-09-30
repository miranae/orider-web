import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { LocalizedLink } from "../../../components/LocalizedLink";
import { logClientError } from "../../../services/errorLogger";
import { Alert, Button, Field, Select, Text } from "../../../theme/components";
import { run30ServerMessage, type Run30Api, type Run30EnrollmentPreview } from "./run30Api";
import { enrollmentDateOptions, localToday, run30DateLabel } from "./run30Display";
import "./run30.css";

export interface Run30EnrollCardProps {
  api: Run30Api;
  /** intro: 러닝 목표가 없을 때 주 화면. offer: 다른 러닝 목표가 있을 때 전환 제안. */
  variant: "intro" | "offer";
  onEnrolled: () => Promise<void> | void;
  today?: string;
  /** 일반 웹에서만: 다른 러닝 목표 만들기 링크(임베드에는 목표 설정 화면이 없다). */
  showCustomGoalLink?: boolean;
}

function newEnrollmentKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `run30-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

/**
 * 프로그램 소개 → 시작일 선택 → 서버 미리보기(늦은 시각 보정·기존 목표 교체 동의) → 등록.
 * 같은 시도의 재전송은 같은 enrollmentKey 를 써서 서버가 중복 등록을 만들지 않게 한다.
 */
export default function Run30EnrollCard({ api, variant, onEnrolled, today: todayOverride, showCustomGoalLink = false }: Run30EnrollCardProps) {
  const { t, i18n } = useTranslation("training");
  const language = i18n.resolvedLanguage ?? i18n.language;
  const today = todayOverride ?? localToday();
  const options = enrollmentDateOptions(today);
  const [expanded, setExpanded] = useState(variant === "intro");
  const [startDate, setStartDate] = useState(options[0]!);
  const [preview, setPreview] = useState<Run30EnrollmentPreview | null>(null);
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<"idle" | "previewing" | "enrolling" | "enrolled">("idle");
  const [error, setError] = useState<string | null>(null);
  const enrollmentKey = useRef<{ startDate: string; key: string } | null>(null);
  const dateId = useId();
  const consentId = useId();
  const busy = phase === "previewing" || phase === "enrolling";

  const describe = (cause: unknown) => run30ServerMessage(cause) ?? t("run30.errors.generic");

  const requestPreview = async () => {
    setError(null);
    setPreview(null);
    setConsent(false);
    setPhase("previewing");
    try {
      setPreview(await api.previewEnrollment(startDate));
      setPhase("idle");
    } catch (cause) {
      logClientError("Run30.previewEnrollment", cause);
      setError(describe(cause));
      setPhase("idle");
    }
  };

  const enroll = async () => {
    if (!preview || (preview.replacementRequired && !consent)) return;
    if (enrollmentKey.current?.startDate !== startDate) {
      enrollmentKey.current = { startDate, key: newEnrollmentKey() };
    }
    setError(null);
    setPhase("enrolling");
    try {
      await api.enroll({
        startDate,
        enrollmentKey: enrollmentKey.current.key,
        ...(preview.replacementRequired && preview.activeGoal
          ? {
            replaceGoalId: preview.activeGoal.goalId,
            replaceGoalRevision: preview.activeGoal.revision,
            replacementConfirmed: true,
          }
          : {}),
      });
      setPhase("enrolled");
      enrollmentKey.current = null;
      await onEnrolled();
    } catch (cause) {
      logClientError("Run30.enroll", cause);
      setError(describe(cause));
      setPhase("idle");
    }
  };

  return (
    <section className="run30-card run30-enroll" aria-labelledby="run30-enroll-title" data-testid={`run30-enroll-${variant}`}>
      <h2 id="run30-enroll-title" className="run30-title">
        {variant === "offer" ? t("run30.enroll.offerTitle") : t("run30.title")}
      </h2>
      <p className="run30-lead">{t("run30.subtitle")}</p>
      {variant === "offer" && <Text as="p" variant="bodySmall" tone="tertiary">{t("run30.enroll.offerBody")}</Text>}
      {!expanded ? (
        <Button type="button" variant="secondary" onClick={() => setExpanded(true)}>{t("run30.enroll.offerOpen")}</Button>
      ) : (
        <>
          <Text as="p" variant="bodySmall" tone="tertiary">{t("run30.purpose")}</Text>
          <Text as="p" variant="bodySmall" tone="tertiary">{t("run30.phoneOnly")}</Text>
          <Field label={t("run30.enroll.startDate")} htmlFor={dateId}>
            <Select
              id={dateId}
              value={startDate}
              disabled={busy || phase === "enrolled"}
              onChange={(event) => {
                setStartDate(event.target.value);
                setPreview(null);
                setConsent(false);
              }}
            >
              {options.map((date) => (
                <option key={date} value={date}>
                  {date === today
                    ? t("run30.enroll.todayOption", { date: run30DateLabel(date, language) })
                    : run30DateLabel(date, language)}
                </option>
              ))}
            </Select>
          </Field>
          {!preview && (
            <Button type="button" variant="primary" loading={phase === "previewing"} disabled={busy} onClick={() => { void requestPreview(); }}>
              {phase === "previewing" ? t("run30.enroll.previewing") : t("run30.enroll.preview")}
            </Button>
          )}
          {preview && (
            <div className="run30-enroll__preview" data-testid="run30-enroll-preview">
              <p className="run30-lead">
                {t("run30.enroll.summary", { date: run30DateLabel(preview.startDate, language), total: preview.totalStages })}
              </p>
              {preview.startDateAdvice && (
                <div className="run30-notice" role="status">
                  <p>{t("run30.enroll.lateStart")}</p>
                  <p>{t("run30.enroll.firstStage", { date: run30DateLabel(preview.startDateAdvice.effectiveStartDate, language) })}</p>
                </div>
              )}
              {preview.replacementRequired && preview.activeGoal && (
                <div className="run30-replacement">
                  <p className="run30-warning">{t("run30.enroll.replacement", { title: preview.activeGoal.title })}</p>
                  <label className="run30-consent" htmlFor={consentId}>
                    <input
                      id={consentId}
                      type="checkbox"
                      checked={consent}
                      disabled={busy || phase === "enrolled"}
                      onChange={(event) => setConsent(event.target.checked)}
                    />
                    <span>{t("run30.enroll.consent")}</span>
                  </label>
                </div>
              )}
              <p className="run30-safety-text">{preview.safetyGuidance}</p>
              <Button
                type="button"
                variant="primary"
                block
                loading={phase === "enrolling"}
                disabled={busy || phase === "enrolled" || (preview.replacementRequired && !consent)}
                onClick={() => { void enroll(); }}
              >
                {phase === "enrolling" ? t("run30.enroll.enrolling") : t("run30.enroll.confirm")}
              </Button>
            </div>
          )}
          {phase === "enrolled" && <p role="status" className="run30-muted">{t("run30.enroll.enrolled")}</p>}
          {error && <Alert variant="danger">{error}</Alert>}
        </>
      )}
      {showCustomGoalLink && (
        <LocalizedLink className="run30-link" to={{ pathname: "/goal-setup", search: "?sport=run" }}>
          {t("run30.enroll.customGoal")}
        </LocalizedLink>
      )}
    </section>
  );
}
