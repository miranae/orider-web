/**
 * 거리별 러닝 기록 보드 (설계 문서 §3.4a, 시안 6).
 *
 * 1/5/10km·하프·풀의 현재 저장된 상위 기록. 미달성 거리도 자리를 남겨 "다음 목표"를 자연스럽게 제시한다.
 * 서버 저장값이며, 이 구형 PR 문서만으로 원본 적격성·시간 단위를 검증할 수 없다.
 *
 * 이중 레이어: 표(쉬운 레이어) 아래에 임계 페이스 곡선(디테일 레이어)을 접이식으로 둔다.
 * 곡선 컴포넌트는 호출부가 스트림과 함께 children 으로 주입한다(이 컴포넌트는 records 만 안다).
 */
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button, buttonClass, Card, Text } from "../../theme/components";
import { distanceRecords } from "../../utils/runRecords";
import type { RunPrTable } from "@shared/types/personal-records";

export interface RunRecordsBoardProps {
  run: RunPrTable | undefined;
  /** 접이식 디테일 레이어 — 보통 CriticalPaceCurve. 없으면 접이 UI 를 숨긴다. */
  detailLayer?: ReactNode;
}

/** 날짜 필드는 시간대로 옮기지 않고 저장된 달력 날짜 그대로 표시한다. */
function formatDate(date: string, locale: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) return "—";
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return "—";
  return new Intl.DateTimeFormat(locale.startsWith("ko") ? "ko-KR" : "en-US", {
    year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC",
  }).format(parsed);
}

export default function RunRecordsBoard({ run, detailLayer }: RunRecordsBoardProps) {
  const { t, i18n } = useTranslation("fitness");
  const [expanded, setExpanded] = useState(false);
  const rows = distanceRecords(run);

  return (
    <Card>
      <Text as="h2" variant="subtitle" style={{ marginBottom: "var(--space-3)" }}>
        {t("runRecords.title")}
      </Text>

      <Text as="p" variant="body" tone="secondary" style={{ marginBottom: "var(--space-3)" }}>
        {t("runRecords.scope")}
      </Text>
      {rows.some(row => row.top.length > 0) && <Text as="p" variant="body" tone="secondary" style={{ marginBottom: "var(--space-3)" }}>
        {t("runRecords.unverified")}
      </Text>}
      <div>
        {rows.map(row => (
          <section key={row.distance} style={{ padding: "var(--space-3) 0", borderBottom: "1px solid var(--line-soft)", minWidth: 0 }}>
            <Text as="h3" variant="body" tone="primary" weight={600}>
              {t(`runRecords.dist.${row.distance}`)}
            </Text>
            {row.top.length ? row.top.map((entry, index) => {
              const sourceId = typeof entry.activityId === "string" && entry.activityId.trim() ? entry.activityId : null;
              return (
                <div key={sourceId ?? index} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2)", paddingTop: "var(--space-2)" }}>
                  <Text as="span" variant="body" tone="secondary">{t("runRecords.unverifiedLabel")}</Text>
                  {sourceId ? (
                    <a href={`/${i18n.language.startsWith("ko") ? "ko" : "en"}/activity/${encodeURIComponent(sourceId)}`}
                      className={buttonClass({ variant: "ghost" })}
                      aria-label={t("runRecords.source", { distance: t(`runRecords.dist.${row.distance}`), rank: index + 1, date: formatDate(entry.date, i18n.language) })}>
                      {formatDate(entry.date, i18n.language)} · {t("runRecords.viewActivity")}
                    </a>
                  ) : <Text as="span" variant="body" tone="secondary">{formatDate(entry.date, i18n.language)}</Text>}
                </div>
              );
            }) : <Text as="p" variant="body" tone="tertiary"><span aria-hidden="true">— · </span><span>{t("runRecords.none")}</span></Text>}
          </section>
        ))}
      </div>

      {detailLayer && (
        <>
          <Button variant="ghost" onClick={() => setExpanded(v => !v)} aria-expanded={expanded}
            style={{ marginTop: "var(--space-3)" }}
            trailingIcon={expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}>
            {t("runRecords.curveToggle")}
          </Button>
          {expanded && <div style={{ marginTop: "var(--space-2)" }}>{detailLayer}</div>}
        </>
      )}
    </Card>
  );
}
