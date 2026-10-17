import type { ReactNode } from "react";
import { Text } from "../theme/components";
import "./fuel-split-bar.css";

export interface FuelSplitSide {
  label: ReactNode;
  /** 서버가 보낸 비율(%). 화면은 반올림만 한다. */
  pct: number;
  kcal?: number | null;
}

interface FuelSplitBarProps {
  fat: FuelSplitSide;
  carb: FuelSplitSide;
  /** `large` 는 분석 탭 대사 카드, `compact` 는 개요의 요약 막대. */
  size?: "large" | "compact";
  footer?: ReactNode;
}

const pctText = (value: number) => `${Math.round(value * 10) / 10}%`;

/**
 * 지방·탄수 2색 비율 막대 — 분석 탭(MetabolismCard)과 개요가 같은 모양을 쓴다.
 *
 * 값은 서버 `substrate`/개요 `energy` 에서 온다. 여기서는 막대 폭과 문구만 만든다.
 * 색만으로 구분하지 않도록 양 끝에 이름과 값을 항상 글자로 적는다.
 */
export default function FuelSplitBar({ fat, carb, size = "large", footer }: FuelSplitBarProps) {
  const compact = size === "compact";
  const side = (item: FuelSplitSide, color: string, align: "start" | "end") => <div className={align === "end" ? "text-right" : undefined}>
    <span className={`inline-flex items-center gap-1.5 ${align === "end" ? "flex-row-reverse" : ""}`}>
      <span aria-hidden="true" className="fuel-split-bar__swatch" style={{ background: color }} />
      <Text variant="eyebrow" size="xs">{item.label}</Text>
    </span>
    <div className={`flex items-baseline gap-1 leading-none ${align === "end" ? "justify-end" : ""}`}>
      <Text variant={compact ? "dataMedium" : "dataLarge"} style={compact ? undefined : { color }} tone={compact ? "primary" : undefined}>
        {compact ? pctText(item.pct) : item.kcal ?? pctText(item.pct)}
      </Text>
      <Text variant="unit">{compact ? item.kcal != null ? `${item.kcal} kcal` : "" : item.kcal != null ? `kcal · ${pctText(item.pct)}` : ""}</Text>
    </div>
  </div>;
  return <div className="fuel-split-bar">
    <div className="flex items-end justify-between gap-3 mb-2">
      {side(fat, "var(--lime)", "start")}
      {side(carb, "var(--amber)", "end")}
    </div>
    <div className={`fuel-split-bar__track ${compact ? "fuel-split-bar__track--compact" : ""}`} role="img"
      aria-label={`${typeof fat.label === "string" ? fat.label : ""} ${pctText(fat.pct)} · ${typeof carb.label === "string" ? carb.label : ""} ${pctText(carb.pct)}`}>
      <span style={{ flexGrow: Math.max(0, fat.pct), background: "var(--lime)" }} />
      <span style={{ flexGrow: Math.max(0, carb.pct), background: "var(--amber)" }} />
    </div>
    {footer}
  </div>;
}
