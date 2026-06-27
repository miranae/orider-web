import { useMemo, useRef, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getDisciplineColor, getDisciplineLabelKey } from "../../utils/disciplineFilter";
import { track } from "../../services/analytics";
import { Bike, Footprints, Triangle, Waves } from "lucide-react";
import type { ReactNode } from "react";

export type Discipline = "tri" | "bike" | "run" | "swim";

interface DisciplineTabsProps {
  value?: Discipline;
  onChange?: (next: Discipline) => void;
  includeTri?: boolean;
}

/**
 * 종목 전환 탭 (사이클/러닝/수영, 선택적으로 통합 탭 포함).
 *
 * - `value` + `onChange` 전달 시: controlled 모드
 * - 둘 다 미전달 시: URL ?sport= 쿼리스트링으로 자동 관리
 * - `includeTri`: true 시 "통합" 탭을 첫 번째로 추가
 */
export default function DisciplineTabs({ value, onChange, includeTri }: DisciplineTabsProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation("common");

  const tabs = useMemo<{ key: Discipline; label: string; icon: ReactNode; color: string }[]>(() => {
    const base = [
      { key: "bike" as Discipline, label: t(getDisciplineLabelKey("bike")), icon: <Bike size={13} />, color: getDisciplineColor("bike") },
      { key: "run"  as Discipline, label: t(getDisciplineLabelKey("run")),  icon: <Footprints size={13} />, color: getDisciplineColor("run") },
      { key: "swim" as Discipline, label: t(getDisciplineLabelKey("swim")), icon: <Waves size={13} />, color: getDisciplineColor("swim") },
    ];
    if (includeTri) {
      base.unshift({ key: "tri" as Discipline, label: t(getDisciplineLabelKey("tri")), icon: <Triangle size={13} />, color: getDisciplineColor("tri") });
    }
    return base;
  }, [includeTri, t]);

  const active: Discipline = value ?? (searchParams.get("sport") as Discipline) ?? "bike";

  const handleClick = (key: Discipline) => {
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
    let nextIdx = idx;
    if (e.key === "ArrowLeft") nextIdx = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "ArrowRight") nextIdx = (idx + 1) % tabs.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = tabs.length - 1;
    const nextKey = tabs[nextIdx]?.key;
    if (nextKey) {
      handleClick(nextKey);
      tabRefs.current[nextIdx]?.focus();
    }
  };

  return (
    <div
      role="tablist"
      aria-label={t("discipline.selectAria")}
      className="flex items-center gap-1"
      style={{ background: "var(--bg-2)", padding: 3, borderRadius: "var(--r-md)", border: "1px solid var(--line-soft)" }}
    >
      {tabs.map(({ key, label, icon, color }, idx) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            ref={(el) => {
              tabRefs.current[idx] = el;
              return () => { tabRefs.current[idx] = null; };
            }}
            onClick={() => handleClick(key)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            style={{
              display: "flex", alignItems: "center", gap: 'var(--space-1)',
              padding: "4px 10px", borderRadius: 4, border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: isActive ? 600 : 400,
              background: isActive ? "var(--bg-3)" : "transparent",
              color: isActive ? color : "var(--ink-3)",
            }}
          >
            <span aria-hidden="true" style={{ display: "inline-flex" }}>{icon}</span>
            {label}
          </button>
        );
      })}
    </div>
  );
}
