import { isSportUiEnabled } from "../../config/sportFeatures";
import "./DisciplineTabs.css";
import { ToggleControls, ToggleButton } from "../../theme/components";
import { useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getDisciplineColor, getDisciplineLabelKey } from "../../utils/disciplineFilter";
import { track } from "../../services/analytics";
import { Triangle } from "lucide-react";
import SportIcon from "../common/SportIcon";
import type { ReactNode } from "react";

export type Discipline = "tri" | "bike" | "run" | "swim";

interface DisciplineTabsProps {
  value?: Discipline;
  onChange?: (next: Discipline) => void;
  includeTri?: boolean;
  disabledKeys?: readonly Discipline[];
}

/**
 * 종목 전환 탭 (사이클/러닝/수영, 선택적으로 통합 탭 포함).
 *
 * - `value` + `onChange` 전달 시: controlled 모드
 * - 둘 다 미전달 시: URL ?sport= 쿼리스트링으로 자동 관리
 * - `includeTri`: true 시 "통합" 탭을 첫 번째로 추가
 */
export default function DisciplineTabs({ value, onChange, includeTri, disabledKeys = [] }: DisciplineTabsProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation("common");

  const tabs = useMemo<{ key: Discipline; label: string; icon: ReactNode; color: string }[]>(() => {
    const base = [
      { key: "bike" as Discipline, label: t(getDisciplineLabelKey("bike")), icon: <SportIcon sport="bike" size={16} />, color: getDisciplineColor("bike") },
      { key: "run"  as Discipline, label: t(getDisciplineLabelKey("run")),  icon: <SportIcon sport="run" size={16} />, color: getDisciplineColor("run") },
      { key: "swim" as Discipline, label: t(getDisciplineLabelKey("swim")), icon: <SportIcon sport="swim" size={16} />, color: getDisciplineColor("swim") },
    ];
    if (includeTri) {
      base.unshift({ key: "tri" as Discipline, label: t(getDisciplineLabelKey("tri")), icon: <Triangle size={13} />, color: getDisciplineColor("tri") });
    }
    return base.filter(tab => isSportUiEnabled(tab.key));
  }, [includeTri, t]);

  const requested = value ?? (searchParams.get("sport") as Discipline) ?? "bike";
  const active: Discipline = isSportUiEnabled(requested) ? requested : "bike";
  useEffect(() => {
    if (value !== undefined || isSportUiEnabled(searchParams.get("sport") ?? "bike")) return;
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete("sport"); return next; }, { replace: true });
  }, [value, searchParams, setSearchParams]);

  const handleClick = (key: Discipline) => {
    if (disabledKeys.includes(key)) return;
    if (key !== active) {
      track("sport_switch", { from: active, to: key });
      // preferred_sport user_property 의 source — 다음 setUserProperties 호출 시 픽업.
      try {
        localStorage.setItem("orider.sport.preferred", key);
      } catch { /* private mode / quota → skip */ }
    }
    if (onChange) {
      onChange(key);
    } else {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (key === "bike") {
          next.delete("sport");
        } else {
          next.set("sport", key);
        }
        return next;
      });
    }
  };

  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const enabledIndices = tabs.flatMap((tab, index) => disabledKeys.includes(tab.key) ? [] : [index]);
    if (!enabledIndices.length) return;
    const currentIndex = enabledIndices.indexOf(idx);
    const nextIdx = e.key === "Home" ? enabledIndices[0]!
      : e.key === "End" ? enabledIndices[enabledIndices.length - 1]!
      : enabledIndices[(currentIndex + (e.key === "ArrowLeft" ? -1 : 1) + enabledIndices.length) % enabledIndices.length]!;
    const nextKey = tabs[nextIdx]?.key;
    if (nextKey) {
      handleClick(nextKey);
      tabRefs.current[nextIdx]?.focus();
    }
  };

  return (
    <ToggleControls variant="axis"
      role="tablist"
      aria-label={t("discipline.selectAria")}
      className="discipline-tabs"
    >
      {tabs.map(({ key, label, icon, color }, idx) => {
        const disabled = disabledKeys.includes(key);
        const isActive = !disabled && active === key;
        return (
          <ToggleButton selected={isActive}
            key={key}
            ref={(el) => {
              tabRefs.current[idx] = el;
              return () => { tabRefs.current[idx] = null; };
            }}
            onClick={() => handleClick(key)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            role="tab"
            disabled={disabled}
            aria-disabled={disabled || undefined}
            aria-label={disabled ? `${label} · ${t("discipline.comingSoon")}` : label}
            title={disabled ? t("discipline.comingSoon") : undefined}
            tabIndex={isActive || (!tabs.some(tab => tab.key === active && !disabledKeys.includes(tab.key)) && idx === tabs.findIndex(tab => !disabledKeys.includes(tab.key))) ? 0 : -1}
          >
            <span className="discipline-tab-content">
              <span className="discipline-tab-heading">
                <span aria-hidden="true" style={{ display: "inline-flex", color }}>{icon}</span>
                <span data-discipline-label><span data-discipline-full>{label}</span><span data-discipline-compact>{t(`discipline.compact.${key}`)}</span></span>
              </span>
              {disabledKeys.length > 0 && <span data-discipline-availability aria-hidden="true">
                {disabled && <><span data-discipline-full>{t("discipline.comingSoon")}</span><span data-discipline-compact>{t("discipline.compact.soon")}</span></>}
              </span>}
            </span>
          </ToggleButton>
        );
      })}
    </ToggleControls>
  );
}
