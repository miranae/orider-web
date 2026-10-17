import { Mail, Package, Users, PenLine, Megaphone, Store, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import { Card, buttonClass } from "../theme/components";

const topics = [
  { key: "product", Icon: Package },
  { key: "brand", Icon: Megaphone },
  { key: "community", Icon: Users },
  { key: "content", Icon: PenLine },
  { key: "shop", Icon: Store },
  { key: "regional", Icon: MapPin },
] as const;

export default function PartnershipPage() {
  const { t } = useTranslation("common");

  return (
    <div className="mx-auto max-w-4xl break-keep space-y-8 pb-8">
      <header className="space-y-3">
        <p className="text-[length:var(--fs-xs)] font-semibold text-[var(--ink-3)]">{t("partnership.eyebrow")}</p>
        <h1 className="text-[length:var(--fs-2xl)] font-bold tracking-tight text-[var(--ink-0)]">{t("partnership.title")}</h1>
        <p className="max-w-2xl text-[length:var(--fs-xl)] font-semibold leading-relaxed text-[var(--ink-0)]">{t("partnership.intro")}</p>
        <p className="max-w-2xl text-[length:var(--fs-base)] leading-relaxed text-[var(--ink-2)]">{t("partnership.origin")}</p>
        <a href="#partnership-contact" className="inline-flex min-h-[var(--dim-button-height)] items-center text-[length:var(--fs-sm)] font-semibold text-[var(--accent)] underline underline-offset-4">{t("partnership.jumpToContact")}</a>
      </header>

      <section aria-labelledby="partnership-direction" className="space-y-4">
        <h2 id="partnership-direction" className="text-[length:var(--fs-lg)] font-semibold text-[var(--ink-0)]">{t("partnership.directionTitle")}</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          {(["during", "after"] as const).map(moment => <div key={moment} className="space-y-2 border-l-2 border-[var(--accent-soft-border)] pl-4">
            <dt className="text-[length:var(--fs-base)] font-semibold text-[var(--ink-0)]">{t(`partnership.moments.${moment}.title`)}</dt>
            <dd className="text-[length:var(--fs-sm)] leading-relaxed text-[var(--ink-2)]">{t(`partnership.moments.${moment}.description`)}</dd>
          </div>)}
        </dl>
        <p className="text-[length:var(--fs-sm)] leading-relaxed text-[var(--ink-2)]">{t("partnership.openDirection")}</p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {(["people", "business"] as const).map(kind => <section key={kind} aria-labelledby={`partnership-${kind}`}>
          <Card className="h-full space-y-3">
            <h2 id={`partnership-${kind}`} className="text-[length:var(--fs-lg)] font-semibold text-[var(--ink-0)]">{t(`partnership.${kind}.title`)}</h2>
            <p className="text-[length:var(--fs-sm)] leading-relaxed text-[var(--ink-2)]">{t(`partnership.${kind}.description`)}</p>
            <p className="text-[length:var(--fs-sm)] leading-relaxed text-[var(--ink-2)]">{t(`partnership.${kind}.invitation`)}</p>
          </Card>
        </section>)}
      </div>

      <section aria-labelledby="partnership-topics" className="space-y-3">
        <h2 id="partnership-topics" className="text-[length:var(--fs-base)] font-semibold text-[var(--ink-0)]">{t("partnership.topicsTitle")}</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {topics.map(({ key, Icon }) => (
            <Card key={key} padding="compact" className="min-w-0 space-y-2">
              <div className="flex items-start gap-2">
                <Icon aria-hidden="true" size={16} className="shrink-0 text-[var(--accent)]" />
                <h3 className="text-[length:var(--fs-base)] font-semibold text-[var(--ink-0)]">{t(`partnership.topics.${key}.title`)}</h3>
              </div>
              <p className="text-[length:var(--fs-sm)] leading-relaxed text-[var(--ink-2)]">{t(`partnership.topics.${key}.description`)}</p>
            </Card>
          ))}
        </div>
        <p className="text-[length:var(--fs-sm)] leading-relaxed text-[var(--ink-3)]">{t("partnership.otherIdeas")}</p>
      </section>

      <section id="partnership-contact" aria-labelledby="partnership-contact-heading" tabIndex={-1} style={{ scrollMarginTop: "calc(var(--space-8) + var(--space-7))" }}>
        <Card className="space-y-5">
          <div className="space-y-2">
            <h2 id="partnership-contact-heading" className="text-[length:var(--fs-lg)] font-semibold text-[var(--ink-0)]">{t("partnership.contactTitle")}</h2>
            <p className="text-[length:var(--fs-sm)] leading-relaxed text-[var(--ink-2)]">{t("partnership.contactDescription")}</p>
            <ul className="list-disc space-y-2 pl-5 text-[length:var(--fs-sm)] leading-relaxed text-[var(--ink-2)]">
              {(["who", "idea", "context"] as const).map(key => <li key={key}>{t(`partnership.details.${key}`)}</li>)}
            </ul>
          </div>
          <div className="space-y-3 border-t border-[var(--line)] pt-4">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[length:var(--fs-sm)]">
              <span className="text-[var(--ink-3)]">{t("partnership.emailLabel")}:</span>
              <a href="mailto:orider.app@gmail.com" draggable={false} className="select-text break-all font-semibold text-[var(--accent)] underline underline-offset-4" style={{ userSelect: "text" }}>orider.app@gmail.com</a>
            </div>
            <p className="text-[length:var(--fs-xs)] leading-relaxed text-[var(--ink-3)]">{t("partnership.emailHint")}</p>
            <a href="mailto:orider.app@gmail.com" className={buttonClass({ variant: "primary", className: "w-full sm:w-auto" })}>
              <Mail aria-hidden="true" size={16} />
              <span className="ds-btn__label">{t("partnership.emailAction")}</span>
            </a>
          </div>
        </Card>
      </section>

      <p className="text-[length:var(--fs-sm)] leading-relaxed text-[var(--ink-3)]">
        {t("partnership.supportText")}{" "}
        <Link to="/community/board?type=inquiry" className="text-[var(--accent)] underline underline-offset-4">{t("partnership.supportLink")}</Link>
      </p>
    </div>
  );
}
