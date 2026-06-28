import { LocalizedLink as Link } from "../LocalizedLink";
import { Bike, Footprints, Triangle, Waves } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import type { Group, GroupKind } from "@shared/types";
import { Button, Card, Chip, Text } from "../../theme/components";

interface GroupCardProps {
  group: Group & { isLeader?: boolean };
  showJoinButton?: boolean;
  onJoin?: () => void;
  joining?: boolean;
  /** 추천/공개 그룹 카드용 매칭 이유 */
  why?: string;
  /** 다음 이벤트 라벨 (예: "4/20(토) 07:00 · 북한강") */
  nextEvent?: string;
  /** 이번 주 활동(km) */
  weekDistKm?: number;
  /** 새 게시물 카운트 */
  newPosts?: number;
}

const KIND_LABEL_KEYS: Record<GroupKind, string> = {
  club: "card.kind.club",
  running_crew: "card.kind.runningCrew",
  tri_team: "card.kind.triTeam",
  corporate: "card.kind.corporate",
};

const DISCIPLINE_META: Record<string, { labelKey: string; color: string; icon: ReactNode }> = {
  bike: { labelKey: "card.discipline.bike", color: "var(--lime)", icon: <Bike size={12} /> },
  run: { labelKey: "card.discipline.run", color: "var(--amber)", icon: <Footprints size={12} /> },
  swim: { labelKey: "card.discipline.swim", color: "var(--aqua)", icon: <Waves size={12} /> },
  tri: { labelKey: "card.discipline.tri", color: "var(--aqua)", icon: <Triangle size={12} /> },
};

function badgeText(name: string): string {
  // 한글이면 첫 글자, 영문이면 단어 첫 글자 3개
  const trimmed = name.trim();
  if (!trimmed) return "??";
  const ascii = /^[A-Za-z\s]+$/.test(trimmed);
  if (ascii) {
    const words = trimmed.split(/\s+/).filter(Boolean);
    return words.slice(0, 3).map((w) => w[0]?.toUpperCase() ?? "").join("") || trimmed.slice(0, 3).toUpperCase();
  }
  return trimmed.slice(0, 2);
}

export default function GroupCard({ group, showJoinButton, onJoin, joining, why, nextEvent, weekDistKm, newPosts }: GroupCardProps) {
  const { t } = useTranslation("group");
  const primarySport = (group.sports && group.sports[0]) ?? group.discipline ?? "bike";
  const meta = DISCIPLINE_META[primarySport] ?? DISCIPLINE_META.bike!;
  const kindLabel = group.kind ? t(KIND_LABEL_KEYS[group.kind]) : null;

  const content = (
    <Card padding="none"
      style={{
        padding: 'var(--space-4)',
        display: "grid",
        gridTemplateColumns: "48px 1fr",
        gap: "var(--space-3)",
        transition: "border-color 0.15s",
      }}
    >
      {/* Badge */}
      <div
        style={{
          width: 48, height: 48, borderRadius: "var(--r-md)",
          background: "var(--bg-2)", border: "1px solid var(--line-soft)",
          display: "grid", placeItems: "center",
          fontSize: "var(--fs-base)", fontWeight: 800, color: meta.color, letterSpacing: "-0.02em",
          flexShrink: 0,
        }}
      >
        {(group.badge ?? badgeText(group.name)).slice(0, 3).toUpperCase()}
      </div>

      {/* Body */}
      <div className="min-w-0">
        <div className="flex items-center" style={{ gap: "var(--space-1-5)", marginBottom: 'var(--space-1)' }}>
          <h3 className="font-semibold truncate" style={{ color: "var(--ink-0)", margin: 0, fontSize: "var(--fs-sm)" }}>
            {group.name}
          </h3>
          {group.isLeader && (
            <Chip style={{ color: "var(--lime)", fontSize: "var(--fs-2xs)", padding: "1px 6px", whiteSpace: "nowrap" }}>{t("card.leader")}</Chip>
          )}
        </div>
        <div className="flex items-center flex-wrap text-[length:var(--fs-xs)]" style={{ gap: 'var(--space-1)', color: "var(--ink-3)", marginBottom: "var(--space-1-5)" }}>
          <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", color: meta.color }}>{meta.icon}</span>
          <span style={{ color: meta.color }}>{kindLabel ?? t(meta.labelKey)}</span>
          {group.city && (<><span aria-hidden="true">·</span><span>{group.city}</span></>)}
          <span aria-hidden="true">·</span>
          <span>{t("card.memberCount", { count: group.memberCount })}</span>
        </div>
        {group.description && !why && (
          <p className="text-[length:var(--fs-xs)] line-clamp-2" style={{ color: "var(--ink-2)", margin: 0 }}>{group.description}</p>
        )}
        {why && (
          <p className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-2)", margin: 0 }}>{why}</p>
        )}

        {/* 메타 표시 (이번 주 활동 / 다음 이벤트 / 새 게시물) */}
        {(weekDistKm != null || nextEvent || (newPosts ?? 0) > 0) && (
          <div className="flex items-center flex-wrap text-[length:var(--fs-xs)]" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-2)', color: "var(--ink-2)" }}>
            {weekDistKm != null && (
              <span><span style={{ color: "var(--ink-3)" }}>{t("card.thisWeek")}</span> <Text variant="num" style={{ color: "var(--ink-0)" }}>{weekDistKm.toFixed(0)}km</Text></span>
            )}
            {nextEvent && (
              <span><span style={{ color: "var(--ink-3)" }}>{t("card.next")}</span> <span style={{ color: "var(--ink-0)" }}>{nextEvent}</span></span>
            )}
            {(newPosts ?? 0) > 0 && (
              <Chip style={{ color: "var(--lime)", fontSize: "var(--fs-2xs)" }}>{t("card.newPosts", { count: newPosts })}</Chip>
            )}
          </div>
        )}

        {showJoinButton && onJoin && (
          <div style={{ marginTop: "var(--space-2)" }}>
            <Button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onJoin(); }}
              disabled={joining} variant="primary" size="sm"
            >
              {joining ? t("card.joining") : t("card.join")}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );

  if (showJoinButton) return content;
  return <Link to={`/group/${group.id}`} style={{ textDecoration: "none" }}>{content}</Link>;
}
