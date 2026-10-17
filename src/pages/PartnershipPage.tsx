import { ArrowLeft, ArrowRight, PencilRuler, Handshake, Mail, Sprout } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import { Card, buttonClass } from "../theme/components";

const purposes = [
  { key: "build", Icon: PencilRuler },
  { key: "collaborate", Icon: Handshake },
  { key: "investment", Icon: Sprout },
] as const;
type Purpose = typeof purposes[number]["key"];
type DetailSection = { title: string; description: string };

function usePartnershipScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const { pathname, hash } = useLocation();
  useLayoutEffect(() => {
    const page = ref.current;
    if (hash) {
      if (hash === "#partnership-contact") {
        const contact = page?.querySelector<HTMLElement>(hash);
        contact?.scrollIntoView({ block: "start", behavior: "instant" });
        contact?.focus({ preventScroll: true });
      }
      return;
    }
    const main = page?.closest("main");
    if (main) main.scrollTop = 0;
  }, [pathname, hash]);
  return ref;
}

export default function PartnershipPage() {
  const { t } = useTranslation("common");
  const pageRef = usePartnershipScroll();
  return (
    <div ref={pageRef} className="mx-auto max-w-4xl break-keep space-y-6 pb-8">
      <header className="max-w-2xl space-y-3">
        <p className="text-[length:var(--fs-xs)] font-semibold text-[var(--ink-3)]">{t("partnership.eyebrow")}</p>
        <h1 className="text-[length:var(--fs-2xl)] font-bold tracking-tight text-[var(--ink-0)]">{t("partnership.title")}</h1>
        <p className="text-[length:var(--fs-base)] leading-relaxed text-[var(--ink-2)]">{t("partnership.intro")}</p>
      </header>
      <nav aria-label={t("partnership.choicesLabel")} className="grid gap-3 md:grid-cols-3">
        {purposes.map(({ key, Icon }) => <Link key={key} to={`/partnership/${key}`} className="min-w-0 rounded-[var(--r-lg)] transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]">
          <Card className="flex h-full flex-col gap-3">
            <Icon aria-hidden="true" size={20} className="text-[var(--accent)]" />
            <h2 className="text-[length:var(--fs-lg)] font-semibold text-[var(--ink-0)]">{t(`partnership.${key}.title`)}</h2>
            <p className="flex-1 text-[length:var(--fs-sm)] leading-relaxed text-[var(--ink-2)]">{t(`partnership.${key}.summary`)}</p>
            <ArrowRight aria-hidden="true" size={16} className="text-[var(--accent)]" />
          </Card>
        </Link>)}
      </nav>
      <p className="text-[length:var(--fs-sm)] leading-relaxed text-[var(--ink-2)]">
        {t("partnership.aboutContext")}{" "}
        <Link to="/about" className="text-[var(--accent)] underline underline-offset-4">{t("partnership.aboutLink")}</Link>
      </p>
      <SupportLink />
    </div>
  );
}

export function PartnershipDetailPage({ purpose }: { purpose: Purpose }) {
  const { t } = useTranslation("common");
  const pageRef = usePartnershipScroll();
  const sections = t(`partnership.${purpose}.sections`, { returnObjects: true }) as DetailSection[];
  return (
    <div ref={pageRef} className="mx-auto max-w-3xl break-keep space-y-6 pb-8">
      <Link to="/partnership" className="inline-flex min-h-[var(--dim-button-height)] items-center gap-2 text-[length:var(--fs-sm)] text-[var(--ink-2)] underline underline-offset-4"><ArrowLeft aria-hidden="true" size={16} />{t("partnership.back")}</Link>
      <header className="space-y-3">
        <p className="text-[length:var(--fs-xs)] font-semibold text-[var(--ink-3)]">{t("partnership.eyebrow")}</p>
        <h1 className="text-[length:var(--fs-2xl)] font-bold tracking-tight text-[var(--ink-0)]">{t(`partnership.${purpose}.title`)}</h1>
        <p className="text-[length:var(--fs-base)] leading-relaxed text-[var(--ink-2)]">{t(`partnership.${purpose}.intro`)}</p>
        <a href="#partnership-contact" className="inline-flex min-h-[var(--dim-button-height)] items-center text-[length:var(--fs-sm)] font-semibold text-[var(--accent)] underline underline-offset-4">{t("partnership.jumpToContact")}</a>
      </header>
      <div className="space-y-5">
        {sections.map(section => <section key={section.title} className="space-y-2">
          <h2 className="text-[length:var(--fs-lg)] font-semibold text-[var(--ink-0)]">{section.title}</h2>
          <p className="text-[length:var(--fs-sm)] leading-relaxed text-[var(--ink-2)]">{section.description}</p>
        </section>)}
        {purpose === "build" && <a href="https://github.com/miranae/orider-web" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[var(--dim-button-height)] items-center text-[length:var(--fs-sm)] text-[var(--accent)] underline underline-offset-4">{t("partnership.build.repository")}</a>}
      </div>
      <PartnershipContact purpose={purpose} />
      <SupportLink />
    </div>
  );
}

function PartnershipContact({ purpose }: { purpose: Purpose }) {
  const { t } = useTranslation("common");
  const details = t(`partnership.${purpose}.contactDetails`, { returnObjects: true }) as string[];
  return <section id="partnership-contact" aria-labelledby="partnership-contact-heading" tabIndex={-1} style={{ scrollMarginTop: "calc(var(--space-8) + var(--space-7))" }}>
    <Card className="space-y-4">
      <div className="space-y-3">
        <h2 id="partnership-contact-heading" className="text-[length:var(--fs-lg)] font-semibold text-[var(--ink-0)]">{t("partnership.contactTitle")}</h2>
        <p className="text-[length:var(--fs-sm)] leading-relaxed text-[var(--ink-2)]">{t("partnership.contactDescription")}</p>
        <ul className="list-disc space-y-2 pl-5 text-[length:var(--fs-sm)] leading-relaxed text-[var(--ink-2)]">{details.map(detail => <li key={detail}>{detail}</li>)}</ul>
      </div>
      <div className="space-y-3 border-t border-[var(--line)] pt-4">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[length:var(--fs-sm)]">
          <span className="text-[var(--ink-3)]">{t("partnership.emailLabel")}:</span>
          <a href="mailto:orider.app@gmail.com" draggable={false} className="select-text break-all font-semibold text-[var(--accent)] underline underline-offset-4" style={{ userSelect: "text" }}>orider.app@gmail.com</a>
        </div>
        <p className="text-[length:var(--fs-xs)] leading-relaxed text-[var(--ink-3)]">{t("partnership.emailHint")}</p>
        <a href="mailto:orider.app@gmail.com" className={buttonClass({ variant: "primary", className: "w-full sm:w-auto" })}><Mail aria-hidden="true" size={16} /><span className="ds-btn__label">{t(`partnership.${purpose}.emailAction`)}</span></a>
      </div>
    </Card>
  </section>;
}

function SupportLink() {
  const { t } = useTranslation("common");
  return <p className="text-[length:var(--fs-sm)] leading-relaxed text-[var(--ink-3)]">{t("partnership.supportText")}{" "}<Link to="/community/board?type=inquiry" className="text-[var(--accent)] underline underline-offset-4">{t("partnership.supportLink")}</Link></p>;
}
