import { Bike, Footprints, Waves } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getDisciplineColor, getDisciplineLabelKey } from "../../utils/disciplineFilter";
import type { Discipline } from "../../utils/disciplineFilter";

interface DisciplineBadgeProps {
  discipline: Discipline;
  /** 실내 활동이면 종목 라벨 뒤에 "· 실내" 를 붙인다 — 판정은 `isIndoorActivity`. */
  indoor?: boolean;
}

export default function DisciplineBadge({ discipline, indoor = false }: DisciplineBadgeProps) {
  const { t } = useTranslation("common");
  const color = getDisciplineColor(discipline);
  const label = indoor
    ? `${t(getDisciplineLabelKey(discipline))} · ${t("sport.indoor")}`
    : t(getDisciplineLabelKey(discipline));
  const Icon = discipline === "bike" ? Bike : discipline === "run" ? Footprints : Waves;

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 'var(--space-1)',
      padding: "2px 8px", borderRadius: "var(--r-lg)", fontSize: "var(--fs-2xs)", fontWeight: 500,
      background: `color-mix(in oklch, ${color} 10%, var(--bg-2))`,
      color, border: `1px solid color-mix(in oklch, ${color} 25%, transparent)`,
    }}>
      <Icon size={11} /> {label}
    </span>
  );
}
