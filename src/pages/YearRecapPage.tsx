import { useMemo, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { saveAs } from "file-saver";
import { Download, Share2, Mountain, Clock, Route } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useYearActivities } from "../hooks/useYearActivities";
import {
  computeYearRecap,
  availableRecapYears,
  type Discipline,
} from "../utils/yearRecap";
import {
  getDisciplineColor,
  getDisciplineIcon,
  getDisciplineLabelKey,
} from "../utils/disciplineFilter";
import {
  drawRecapShareCard,
  canvasToPngBlob,
  type RecapShareRatio,
} from "../components/recap/recapShareCanvas";
import { logClientError } from "../services/errorLogger";
import { Card, Stat, Text, Button, Stack } from "../theme/components";

/** km, 콤마·정수 */
function km(meters: number): string {
  return Math.round(meters / 1000).toLocaleString("ko-KR");
}
/** 시간(시), 정수 */
function hours(ms: number): string {
  return Math.round(ms / 3600000).toLocaleString("ko-KR");
}
function int(v: number): string {
  return Math.round(v).toLocaleString("ko-KR");
}

export default function YearRecapPage() {
  const { user, profile } = useAuth();
  const { t } = useTranslation("recap");
  const { activities, loading } = useYearActivities(user?.uid);
  const [shareBusy, setShareBusy] = useState(false);
  const lastRatio = useRef<RecapShareRatio>("square");

  const years = useMemo(() => availableRecapYears(activities), [activities]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const year = selectedYear ?? years[0] ?? new Date().getFullYear();

  const recap = useMemo(() => computeYearRecap(activities, year), [activities, year]);

  const nickname = profile?.nickname || user?.displayName || t("rider");

  if (!user) {
    return (
      <div style={{ padding: "var(--space-8) var(--space-6)", textAlign: "center", color: "var(--ink-4)" }}>
        <Text tone="tertiary">{t("loginRequired")}</Text>
      </div>
    );
  }

  const buildShareLabels = () => ({
    title: t("shareTitle", { year }),
    nickname,
    distance: t("stat.distance"),
    time: t("stat.time"),
    elevation: t("stat.elevation"),
    activities: t("stat.activities"),
    hourUnit: t("unit.hour"),
    footer: t("shareFooter"),
  });

  const handleShare = async (ratio: RecapShareRatio) => {
    if (shareBusy) return;
    lastRatio.current = ratio;
    setShareBusy(true);
    try {
      const canvas = drawRecapShareCard(recap, buildShareLabels(), ratio);
      const blob = await canvasToPngBlob(canvas);
      if (!blob) return;
      const fileName = `orider-recap-${year}-${ratio}.png`;

      // Web Share API (파일 공유 지원 시) — 모바일 SNS 직접 공유
      const file = new File([blob], fileName, { type: "image/png" });
      const nav = navigator as Navigator & {
        canShare?: (data: { files: File[] }) => boolean;
      };
      if (nav.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: t("shareTitle", { year }) });
        return;
      }
      // 폴백: 다운로드
      saveAs(blob, fileName);
    } catch (err) {
      // 사용자가 공유 시트를 닫으면 AbortError — 정상 동작이라 무시.
      if (err instanceof DOMException && err.name === "AbortError") return;
      logClientError("YearRecapPage.share", err, { year, ratio: lastRatio.current });
    } finally {
      setShareBusy(false);
    }
  };

  const isEmpty = !loading && recap.totalCount === 0;

  return (
    <div className="max-w-2xl mx-auto pb-20" style={{ padding: "var(--space-5) var(--space-4)" }}>
      {/* 헤더 + 연도 선택 */}
      <div className="flex items-center justify-between" style={{ marginBottom: "var(--space-5)" }}>
        <div>
          <Text as="h1" variant="title" weight={700}>
            {t("title")}
          </Text>
          <Text tone="tertiary" variant="bodySmall">
            {t("subtitle", { year })}
          </Text>
        </div>
        {years.length > 1 && (
          <select
            value={year}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            aria-label={t("selectYear")}
            style={{
              padding: "8px 12px",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--line)",
              background: "var(--bg-1)",
              color: "var(--ink-0)",
              fontSize: "var(--fs-sm)",
            }}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <Card>
          <Text tone="tertiary">{t("loading")}</Text>
        </Card>
      ) : isEmpty ? (
        <Card>
          <Stack gap="var(--space-3)" align="center">
            <Text variant="dataMedium" tone="tertiary">
              🗓️
            </Text>
            <Text weight={600}>{t("empty.title", { year })}</Text>
            <Text tone="tertiary" variant="bodySmall">
              {t("empty.desc")}
            </Text>
          </Stack>
        </Card>
      ) : (
        <Stack gap="var(--space-4)">
          {/* 총합 KPI */}
          <Card title={t("section.totals")}>
            <div className="grid grid-cols-2" style={{ gap: "var(--space-4)" }}>
              <Stat label={t("stat.distance")} value={km(recap.totalDistanceMeters)} unit="km" />
              <Stat label={t("stat.time")} value={hours(recap.totalDurationMillis)} unit={t("unit.hour")} />
              <Stat label={t("stat.elevation")} value={int(recap.totalElevationMeters)} unit="m" />
              <Stat label={t("stat.activities")} value={int(recap.totalCount)} unit={t("unit.count")} />
            </div>
            <div style={{ marginTop: "var(--space-3)" }}>
              <Text tone="tertiary" variant="bodySmall">
                {t("activeDays", { count: recap.activeDays })}
                {recap.totalCalories > 0 && ` · ${t("totalCalories", { kcal: int(recap.totalCalories) })}`}
              </Text>
            </div>
          </Card>

          {/* 90일 일관성 루프 */}
          <Card title={t("section.consistency")}>
            <div className="grid grid-cols-2" style={{ gap: "var(--space-4)" }}>
              <Stat label={t("consistency.score")} value={int(recap.consistency90d.score)} unit="/100" />
              <Stat label={t("consistency.activeDays")} value={int(recap.consistency90d.activeDays)} unit={t("unit.day")} />
              <Stat label={t("consistency.activeWeeks")} value={int(recap.consistency90d.activeWeeks)} unit={t("unit.week")} />
              <Stat label={t("consistency.streak")} value={int(recap.consistency90d.longestStreakDays)} unit={t("unit.day")} />
            </div>
            <Text tone="tertiary" variant="bodySmall" style={{ display: "block", marginTop: "var(--space-3)" }}>
              {t("consistency.note", {
                window: recap.consistency90d.windowDays,
                current: recap.consistency90d.currentStreakDays,
              })}
            </Text>
          </Card>

          {/* 종목별 분해 */}
          <Card title={t("section.byDiscipline")}>
            <Stack gap="var(--space-3)">
              {recap.byDiscipline.map((b) => (
                <DisciplineRow key={b.discipline} discipline={b.discipline} count={b.count} distanceMeters={b.distanceMeters} />
              ))}
            </Stack>
          </Card>

          {/* 최고 노력 */}
          <Card title={t("section.highlights")}>
            <Stack gap="var(--space-3)">
              {recap.longestDistance && (
                <HighlightRow
                  icon={<Route size={18} />}
                  label={t("highlight.longestDistance")}
                  value={`${(recap.longestDistance.value / 1000).toFixed(1)} km`}
                />
              )}
              {recap.longestDuration && (
                <HighlightRow
                  icon={<Clock size={18} />}
                  label={t("highlight.longestDuration")}
                  value={`${(recap.longestDuration.value / 3600000).toFixed(1)} ${t("unit.hour")}`}
                />
              )}
              {recap.biggestClimb && (
                <HighlightRow
                  icon={<Mountain size={18} />}
                  label={t("highlight.biggestClimb")}
                  value={`${Math.round(recap.biggestClimb.value)} m`}
                />
              )}
            </Stack>
          </Card>

          {/* 월별 추이 */}
          <Card title={t("section.monthly")}>
            <MonthlyBars recap={recap} t={t} />
          </Card>

          {/* 공유 */}
          <Card title={t("section.share")}>
            <Text tone="tertiary" variant="bodySmall">
              {t("share.desc")}
            </Text>
            <div className="flex" style={{ gap: "var(--space-2)", marginTop: "var(--space-3)", flexWrap: "wrap" }}>
              <Button
                variant="primary"
                leadingIcon={<Share2 size={16} />}
                loading={shareBusy}
                onClick={() => handleShare("square")}
              >
                {t("share.square")}
              </Button>
              <Button
                variant="secondary"
                leadingIcon={<Download size={16} />}
                loading={shareBusy}
                onClick={() => handleShare("story")}
              >
                {t("share.story")}
              </Button>
            </div>
          </Card>
        </Stack>
      )}
    </div>
  );
}

function DisciplineRow({
  discipline,
  count,
  distanceMeters,
}: {
  discipline: Discipline;
  count: number;
  distanceMeters: number;
}) {
  const { t } = useTranslation();
  const color = getDisciplineColor(discipline);
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
        <span style={{ fontSize: "var(--fs-lg)" }}>{getDisciplineIcon(discipline)}</span>
        <Text weight={600} style={{ color }}>
          {t(getDisciplineLabelKey(discipline))}
        </Text>
      </div>
      <Text tone="secondary" variant="bodySmall">
        {count}회 · {(distanceMeters / 1000).toFixed(0)} km
      </Text>
    </div>
  );
}

function HighlightRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center" style={{ gap: "var(--space-2)", color: "var(--ink-2)" }}>
        {icon}
        <Text variant="bodySmall">{label}</Text>
      </div>
      <Text weight={700} mono>
        {value}
      </Text>
    </div>
  );
}

function MonthlyBars({
  recap,
  t,
}: {
  recap: ReturnType<typeof computeYearRecap>;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const maxDist = Math.max(1, ...recap.monthly.map((m) => m.distanceMeters));
  return (
    <div className="flex items-end justify-between" style={{ gap: "var(--space-1)", height: 120 }}>
      {recap.monthly.map((m) => {
        const ratio = m.distanceMeters / maxDist;
        const heightPct = m.distanceMeters > 0 ? Math.max(4, ratio * 100) : 2;
        return (
          <div key={m.month} className="flex flex-col items-center" style={{ flex: 1, gap: "var(--space-1)" }}>
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
              <div
                title={`${(m.distanceMeters / 1000).toFixed(0)} km`}
                style={{
                  width: "100%",
                  height: `${heightPct}%`,
                  background: m.distanceMeters > 0 ? "var(--lime)" : "var(--line-soft)",
                  borderRadius: "var(--r-sm)",
                }}
              />
            </div>
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{t("recap:monthShort", { month: m.month + 1 })}</span>
          </div>
        );
      })}
    </div>
  );
}
