import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronUp } from "lucide-react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Card } from "../theme/components";
import { LocalizedLink as Link } from "./LocalizedLink";
import AppInstallLinks from "./AppInstallLinks";

type Group = "partnershipInquiry" | "help" | "policies" | "install";
const partnershipLinks = [
  ["/about", "nav.aboutOrider"], ["/partnership/build", "partnership.build.title"],
  ["/partnership/collaborate", "partnership.collaborate.title"], ["/partnership/investment", "partnership.investment.title"],
];
const helpLinks = [
  ["/manual", "footer.appManual"], ["/web-manual", "footer.webManual"],
  ["/community/board?type=inquiry", "footer.contact"], ["/feedback", "footer.feedback"],
  ["/tools/virtual-power", "footer.calculator"], ["/explore/recipes/deploy", "nav.developerDocs"],
];
// 매뉴얼은 Hosting 의 정적 HTML(public/manual, public/web-manual)이라 SPA 라우트가 없다.
// LocalizedLink 로 걸면 /ko/web-manual 로 SPA 내부 이동해 404 화면이 나오므로 전체 페이지 이동으로 연다.
const staticDocLinks = new Set(["/manual", "/web-manual"]);
const policyLinks = [
  ["/terms", "footer.terms"], ["/privacy", "footer.privacy"],
  ["/policies/community", "footer.community"], ["/policies/ai-coach", "footer.aiPolicy"],
  ["/strava-terms", "footer.stravaTerms"],
];

export default function FooterNavigation() {
  const { t } = useTranslation("common");
  const location = useLocation();
  const [open, setOpen] = useState<Group | null>(null);
  const [position, setPosition] = useState({ left: 0, bottom: 0, width: 256 });
  const root = useRef<HTMLElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const triggers = useRef<Partial<Record<Group, HTMLButtonElement | null>>>({});
  const id = useId();
  useEffect(() => { setOpen(null); }, [location]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: Event) => {
      if (!root.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) setOpen(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(null); triggers.current[open]?.focus(); }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("focusin", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("focusin", dismiss); document.removeEventListener("keydown", escape); };
  }, [open]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = triggers.current[open]?.getBoundingClientRect();
      if (!rect) return;
      if (rect.top < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) { setOpen(null); return; }
      const width = Math.min(256, window.innerWidth - 32);
      setPosition({ width, left: Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16)), bottom: Math.min(Math.max(16, window.innerHeight - rect.top + 8), Math.max(16, window.innerHeight - 64)) });
    };
    place();
    (panel.current?.querySelector("a") ?? panel.current)?.focus({ preventScroll: true });
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);
  const linkClass = "transition-colors hover:opacity-80";
  return <nav ref={root} aria-label={t("footer.navigation")} className="flex flex-wrap items-center gap-4">
    {(["partnershipInquiry", "help", "policies", "install"] as const).map(group => <Button key={group} ref={node => { triggers.current[group] = node; }} variant="ghost" size="sm"
      aria-expanded={open === group} aria-controls={`${id}-${group}`} onClick={() => setOpen(value => value === group ? null : group)}
      style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{t(`footer.${group}`)}<ChevronUp aria-hidden="true" size={12} style={{ transform: open === group ? "rotate(180deg)" : undefined }} /></Button>)}
    {open && createPortal(<div ref={panel} tabIndex={-1} id={`${id}-${open}`} role="region" aria-label={t(`footer.${open}`)}
      style={{ position: "fixed", ...position, zIndex: 100, maxHeight: `calc(100dvh - ${position.bottom}px - 16px)`, overflowY: "auto" }}>
      <Card padding="compact" style={{ boxShadow: "var(--shadow-lg)" }}>
        {open === "install" ? <AppInstallLinks compact appStoreLabel="App Store" playStoreLabel="Google Play" /> : <div className="flex flex-col gap-1">
          {(open === "partnershipInquiry" ? partnershipLinks : open === "help" ? helpLinks : policyLinks).map(([to, key]) => staticDocLinks.has(to!)
            ? <a key={to} href={`${to}/`} className={`${linkClass} flex items-center rounded-[var(--r-sm)] px-3 py-2`} style={{ minHeight: 44, fontSize: "var(--fs-sm)" }}>{t(key!)}</a>
            : <Link key={to} to={to!} data-testid={to === "/about" ? "X2-1" : undefined} className={`${linkClass} flex items-center rounded-[var(--r-sm)] px-3 py-2`} style={{ minHeight: 44, fontSize: "var(--fs-sm)" }}>{t(key!)}</Link>)}
        </div>}
      </Card>
    </div>, document.body)}
  </nav>;
}
