import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useParams, useLocation, type NavLinkProps } from "react-router-dom";
import { SUPPORTED_LANGS } from "../i18n/detector";
import "./TabNav.css";

const langSet = new Set<string>([...SUPPORTED_LANGS]);
const tabFocusClass = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lime)]";

/** RouteTab `to` 에 현재 로케일 prefix(`/ko` 등) 부여. 절대 URL·이미 prefix 된 경로는 이중화 없이 그대로. */
function localizeTo(to: string, lang: string | undefined): string {
  if (/^[a-z]+:\/\//i.test(to) || to.startsWith("//") || to.startsWith("mailto:") || to.startsWith("tel:")) return to;
  const norm = to.startsWith("/") ? to : "/" + to;
  const firstSeg = norm.split("/")[1];
  if (firstSeg !== undefined && langSet.has(firstSeg)) return norm; // 이미 lang prefix 있음 → /ko/ko 방지
  return `/${lang ?? "ko"}${norm}`;
}

interface TabNavProps {
  tabs: { id: string; label: string; count?: number; specId?: string }[];
  activeTab: string;
  onChange: (id: string) => void;
}

export default function TabNav({ tabs, activeTab, onChange }: TabNavProps) {
  return (
    <div className="flex border-b overflow-x-auto" role="tablist" style={{ borderColor: "var(--line-soft)" }}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          data-testid={tab.specId}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex-shrink-0 whitespace-nowrap min-h-[44px] flex items-center rounded-t-[var(--r-sm)] px-4 py-2.5 text-[length:var(--fs-sm)] font-medium border-b-2 transition-colors ${tabFocusClass} ${
            activeTab === tab.id
              ? ""
              : "border-transparent hover:border-[var(--line)]"
          }`}
          style={activeTab === tab.id ? { borderColor: "var(--lime)", color: "var(--lime)" } : { color: "var(--ink-2)" }}
        >
          {tab.label}
          {tab.count != null && (
            <span className="ml-1.5 text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>({tab.count})</span>
          )}
        </button>
      ))}
    </div>
  );
}

interface RouteTab {
  to: string;
  label: string;
  end?: boolean;
  specId?: string;
}

interface RouteTabNavProps {
  revealActive?: boolean;
  tabs: RouteTab[];
  state?: NavLinkProps["state"];
}

export function RouteTabNav({ tabs, state, revealActive = true }: RouteTabNavProps) {
  const { lang } = useParams();
  const { pathname } = useLocation();
  const { t } = useTranslation("common");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const cancelRevealRef = useRef(() => {});
  const [canScrollBack, setCanScrollBack] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(false);

  const tabGeometryKey = tabs.map(tab => `${tab.to}:${tab.label}`).join("|");
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let autoRevealAllowed = revealActive;
    let frame = 0;
    let settledFrame = 0;
    const measure = (reveal: boolean) => {
      const active = scroller.querySelector<HTMLElement>('[aria-current="page"]');
      if (reveal && active) {
        const box = scroller.getBoundingClientRect();
        const item = active.getBoundingClientRect();
        if (item.left < box.left || item.right > box.right) {
          scroller.scrollLeft = Math.max(0, Math.min(scroller.scrollWidth - scroller.clientWidth,
            scroller.scrollLeft + item.left - box.left - (box.width - item.width) / 2));
        }
      }
      setCanScrollBack(scroller.scrollLeft > 1);
      setCanScrollForward(scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(settledFrame);
      measure(false);
      frame = requestAnimationFrame(() => {
        measure(autoRevealAllowed);
        // Repeat after layout settles; reserved arrow slots keep the viewport width stable.
        settledFrame = requestAnimationFrame(() => measure(autoRevealAllowed));
      });
    };
    const manualScroll = () => { autoRevealAllowed = false; };
    cancelRevealRef.current = manualScroll;
    const resize = () => { autoRevealAllowed = revealActive; schedule(); };
    const scroll = () => measure(false);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(scroller);
    scroller.querySelectorAll("a").forEach(tab => observer?.observe(tab));
    scroller.addEventListener("scroll", scroll);
    scroller.addEventListener("pointerdown", manualScroll);
    scroller.addEventListener("touchstart", manualScroll, { passive: true });
    scroller.addEventListener("wheel", manualScroll, { passive: true });
    window.addEventListener("resize", resize);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(settledFrame);
      observer?.disconnect();
      scroller.removeEventListener("scroll", scroll);
      scroller.removeEventListener("pointerdown", manualScroll);
      scroller.removeEventListener("touchstart", manualScroll);
      scroller.removeEventListener("wheel", manualScroll);
      window.removeEventListener("resize", resize);
    };
  }, [pathname, revealActive, tabGeometryKey]);

  return (
    <div className="route-tab-nav" style={{ borderColor: "var(--line-soft)" }}>
      <button type="button" className="route-tab-nav__more" disabled={!canScrollBack} style={{ visibility: canScrollBack ? "visible" : "hidden" }} aria-label={t("button.previousTabs")} onClick={() => {
        const scroller = scrollerRef.current;
        if (scroller) { cancelRevealRef.current(); scroller.scrollLeft -= scroller.clientWidth * 0.7; }
      }}>‹</button>
      <div ref={scrollerRef} className="route-tab-nav__scroller flex overflow-x-auto">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          data-testid={tab.specId}
          to={localizeTo(tab.to, lang)}
          end={tab.end}
          state={state}
          className={({ isActive }) =>
            `flex-shrink-0 whitespace-nowrap min-h-[44px] flex items-center rounded-t-[var(--r-sm)] px-2 sm:px-4 py-2.5 text-[length:var(--fs-sm)] font-medium border-b-2 transition-colors ${tabFocusClass} ${
              isActive
                ? ""
                : "border-transparent hover:border-[var(--line)]"
            }`
          }
          style={({ isActive }) => isActive ? { borderColor: "var(--lime)", color: "var(--lime)" } : { color: "var(--ink-2)" }}
        >
          {tab.label}
        </NavLink>
      ))}
      </div>
      <button type="button" className="route-tab-nav__more" disabled={!canScrollForward} style={{ visibility: canScrollForward ? "visible" : "hidden" }} aria-label={t("button.nextTabs")} onClick={() => {
        const scroller = scrollerRef.current;
        if (scroller) { cancelRevealRef.current(); scroller.scrollLeft += scroller.clientWidth * 0.7; }
      }}>›</button>
    </div>
  );
}
