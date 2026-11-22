import { embeddedInternalDestination } from "../../embedded/hubNavigation";
import "../../pages/group/ClubSurface.css";
import { MoreHorizontal, Share2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useMobile } from "../../hooks/useMobile";
import { IconButton, Text } from "../../theme/components";
import { ICON_SIZE } from "../../theme/tokens/icon";
import { useToast } from "../../contexts/ToastContext";
import { logClientError } from "../../services/errorLogger";
import { useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { RouteTabNav } from "../TabNav";
import { LocalizedLink as Link } from "../LocalizedLink";
import type { Group } from "@shared/types";

interface GroupSubNavProps {
  group: Group;
  isCreator: boolean;
  compact?: boolean;
}

export default function GroupSubNav({ group, isCreator, compact = false }: GroupSubNavProps) {
  const { showToast } = useToast();
  const { t } = useTranslation("group");
  const { groupId, lang } = useParams();
  const { search, pathname } = useLocation();
  const destination = (to: string) => embeddedInternalDestination(pathname, to) ?? to;
  const sharedParams = new URLSearchParams(search);
  sharedParams.delete("section");
  sharedParams.delete("copyFrom");
  const sharedSearch = sharedParams.size ? `?${sharedParams.toString()}` : "";
  const base = `/club/${groupId}`;
  const mobile = useMobile();
  const cycling = (group.sports ?? [group.discipline ?? "bike"]).includes("bike");
  const share = async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/${lang ?? "ko"}${base}`); showToast(t("invite.copied")); } catch (error) { logClientError("GroupSubNav.share", error, { groupId }); showToast(t("dashboard.posts.actionFailed"), "error"); } };

  if (mobile) {
    // 휴대폰: 탭은 모임 | 소식 | 활동 셋. 활동은 이번 주(모든 종목) + 공동 기록(자전거 클럽)을 한 화면에 둔다.
    // 자전거 클럽의 활동 탭은 기존 공동 기록 주소(/rides)로, 그 밖은 이번 주 주소(/week)로 간다 — 두 주소 모두 같은 활동 화면이다.
    // 멤버·운영·공유는 머리글 ⋯ 메뉴로 옮긴다(주소는 그대로 열린다).
    const mobileTabs = [
      { to: base, label: t("subNav.events"), end: true, activePaths: [`${base}/events`, `${base}/meetings`] },
      { to: `${base}/news`, label: t("subNav.news") },
      { to: cycling ? `${base}/rides` : `${base}/week`, label: t("subNav.activity"), activePaths: [`${base}/rides`, `${base}/week`, `${base}/leaderboard`] },
    ];
    return (
      <div data-testid="C1-0" className="club-surface club-subnav mb-4">
        <nav
          aria-label={t("subNav.contextLabel")}
          className="flex flex-wrap items-center mb-3 text-[length:var(--ft-body-size)]"
          style={{ gap: "var(--space-3)", color: "var(--ink-3)" }}
        >
          <Link to="/clubs" style={{ color: "var(--ink-2)" }}>{t("subNav.groupList")}</Link>
        </nav>
        <div className="club-subnav-header">
          <div>
            <Text as="h1" variant="pageTitle" data-testid="C1-0-1">{group.name}</Text>
            <Text as="p" variant="body" tone="secondary" className="mt-1">
              {t("dashboard.memberCount", { count: group.memberCount })}
            </Text>
            {!compact && group.description && (
              <Text as="p" variant="body" tone="secondary" className="mt-1">{group.description}</Text>
            )}
          </div>
          <ClubHeaderMenu label={t("subNav.more")} items={[
            { id: "C1-0-5", label: t("members"), to: destination(`${base}/members${sharedSearch}`) },
            ...(isCreator ? [{ id: "C1-0-6", label: t("subNav.settings"), to: destination(`${base}/settings${sharedSearch}`) }] : []),
            { id: "C1-0-4", label: t("button.share"), onSelect: () => { void share(); } },
          ]} />
        </div>
        <RouteTabNav tabs={mobileTabs.map(tab => ({ ...tab, specId: "C1-0-2", to: destination(`${tab.to}${sharedSearch}`), activePaths: tab.activePaths?.map(destination) }))} />
      </div>
    );
  }

  const tabs = [
    { to: base, label: t("subNav.events"), end: true, activePaths: [`${base}/events`, `${base}/meetings`] },
    { to: `${base}/news`, label: t("subNav.news") },
    ...((group.sports ?? [group.discipline ?? "bike"]).includes("bike") ? [{ to: `${base}/rides`, label: t("subNav.rides") }] : []),
    { to: `${base}/week`, label: t("subNav.week") },
    { to: `${base}/members`, label: t("members") },
    ...(isCreator ? [{ to: `${base}/settings`, label: t("subNav.settings") }] : []),
  ];

  return (
    <div data-testid="C1-0" className="club-surface club-subnav mb-4">
      <nav
        aria-label={t("subNav.contextLabel")}
        className="flex flex-wrap items-center mb-3 text-[length:var(--ft-body-size)]"
        style={{ gap: "var(--space-3)", color: "var(--ink-3)" }}
      >
        <Link to="/clubs" style={{ color: "var(--ink-2)" }}>{t("subNav.groupList")}</Link>
      </nav>
      <div className="club-subnav-header">
        <div>
          <Text as="h1" variant="pageTitle" data-testid="C1-0-1">{group.name}</Text>
          {!compact && group.description && (
            <Text as="p" variant="body" tone="secondary" className="mt-1">{group.description}</Text>
          )}
          <Text as="p" variant="body" tone="secondary" className="mt-1">
            {t("dashboard.memberCount", { count: group.memberCount })}
          </Text>
        </div>
      {/* 공유는 머리글 오른쪽의 작은 아이콘으로 — 큰 글자 버튼이 클럽 이름 옆 자리를 차지하지 않게 */}
      <IconButton variant="secondary" data-testid="C1-0-4" aria-label={t("button.share")} title={t("button.share")} icon={<Share2 size={ICON_SIZE.md} />}
        onClick={share} />
      </div>
      <RouteTabNav tabs={tabs.map(tab => ({ ...tab, specId: "C1-0-2", to: destination(`${tab.to}${sharedSearch}`), activePaths: tab.activePaths?.map(destination) }))} />

    </div>
  );
}

type ClubMenuItem = { id: string; label: string } & ({ to: string; onSelect?: never } | { onSelect: () => void; to?: never });

/** 클럽 상세 머리글 ⋯ — 멤버·운영·공유처럼 드물게 쓰는 이동을 모은다. 닫히면 자리를 차지하지 않는다. */
function ClubHeaderMenu({ label, items }: { label: string; items: ClubMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);
  return (
    <div ref={rootRef} className="club-subnav-menu" onKeyDown={(event) => { if (event.key === "Escape" && open) { setOpen(false); triggerRef.current?.focus(); } }}>
      <IconButton ref={triggerRef} variant="ghost" data-testid="C1-0-7" icon={<MoreHorizontal size={ICON_SIZE.md} />} aria-label={label} title={label}
        aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)} style={{ minWidth: 44, minHeight: 44 }} />
      <div id={panelId} className="club-subnav-menu__panel" hidden={!open}>
        {items.map((item) => item.to !== undefined
          ? <Link key={item.id} data-testid={item.id} to={item.to} className="club-subnav-menu__item" onClick={() => setOpen(false)}>{item.label}</Link>
          : <button key={item.id} type="button" data-testid={item.id} className="club-subnav-menu__item" onClick={() => { setOpen(false); item.onSelect(); }}>{item.label}</button>)}
      </div>
    </div>
  );
}
