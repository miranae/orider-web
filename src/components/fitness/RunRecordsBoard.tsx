/**
 * 거리별 러닝 기록 보드 (설계 문서 §3.4a, 시안 6).
 *
 * 1/5/10km 현행 최고 기록. 미달성 거리도 자리를 남겨 "다음 목표"를 자연스럽게 제시한다.
 * 값은 전부 서버 확정(`users/{uid}/records/power`.run) — 클라이언트 근사 기록은 없다.
 *
 * 이중 레이어: 표(쉬운 레이어) 아래에 임계 페이스 곡선(디테일 레이어)을 접이식으로 둔다.
 * 곡선 컴포넌트는 호출부가 스트림과 함께 children 으로 주입한다(이 컴포넌트는 records 만 안다).
 */
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, Text } from "../../theme/components";
import { formatPaceSec } from "../../utils/workoutPace";
import { distanceRecords } from "../../utils/runRecords";
import { RUN_DISTANCE_M } from "@shared/types/personal-records";
import type { RunPrTable } from "@shared/types/personal-records";

export interface RunRecordsBoardProps {
  run: RunPrTable | undefined;
  /** 접이식 디테일 레이어 — 보통 CriticalPaceCurve. 없으면 접이 UI 를 숨긴다. */
  detailLayer?: ReactNode;
}

/** 총 시간(초) → `26'40"` 또는 `2:08'55"`. */
function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}'${ss}"` : `${m}'${ss}"`;
}

/** YYYY-MM-DD → 표시용 날짜. */
function formatDate(date: string): string {
  const [, m, d] = date.split("-");
  return m && d ? `${Number(m)}/${Number(d)}` : date;
}

export default function RunRecordsBoard({ run, detailLayer }: RunRecordsBoardProps) {
  const { t } = useTranslation("fitness");
  const [expanded, setExpanded] = useState(false);
  const rows = distanceRecords(run);

  return (
    <Card>
      <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-3)" }}>
        {t("runRecords.title")}
      </Text>

      <div>
        {rows.map((row) => {
          const km = RUN_DISTANCE_M[row.distance] / 1000;
          const paceSec = row.best ? row.best.value / km : null;
          return (
            <div
              key={row.distance}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "var(--space-3)",
                padding: "var(--space-2) 0",
                borderBottom: "1px solid var(--line-soft)",
              }}
            >
              <Text as="span" variant="bodySmall" tone="primary" weight={600} style={{ width: 56, flexShrink: 0 }}>
                {t(`runRecords.dist.${row.distance}`)}
              </Text>
              {row.best ? (
                <>
                  <Text as="span" variant="dataSmall" mono tone="primary">
                    {formatDuration(row.best.value)}
                  </Text>
                  {paceSec != null && (
                    <Text as="span" variant="caption" tone="tertiary" mono>
                      {formatPaceSec(paceSec)}/km
                    </Text>
                  )}
                  <Text as="span" variant="caption" tone="tertiary" style={{ marginLeft: "auto" }}>
                    {formatDate(row.best.date)}
                  </Text>
                </>
              ) : (
                <>
                  <Text as="span" variant="dataSmall" mono tone="tertiary">
                    —
                  </Text>
                  <Text as="span" variant="caption" tone="tertiary" style={{ marginLeft: "auto" }}>
                    {t("runRecords.none")}
                  </Text>
                </>
              )}
            </div>
          );
        })}
      </div>

      {detailLayer && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-1)",
              marginTop: "var(--space-3)",
              background: "transparent",
              border: 0,
              padding: "var(--space-1) 0",
              color: "var(--accent)",
              fontSize: "var(--fs-xs)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t("runRecords.curveToggle")}
            {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
          </button>
          {expanded && <div style={{ marginTop: "var(--space-2)" }}>{detailLayer}</div>}
        </>
      )}
    </Card>
  );
}
