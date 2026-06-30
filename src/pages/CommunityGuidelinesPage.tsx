import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import { Card, buttonClass } from "../theme/components";

interface GuidelineSection {
  title: string;
  intro?: string;
  items: string[];
  footer?: string;
}

export default function CommunityGuidelinesPage() {
  const { t } = useTranslation("legal");
  const highlights = t("guidelines.highlights", { returnObjects: true }) as string[];
  const sections = t("guidelines.sections", { returnObjects: true }) as GuidelineSection[];

  return (
    <div className="mx-auto max-w-4xl pb-20 space-y-6">
      <section className="rounded-[var(--r-lg)] border p-5 md:p-6" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex rounded-[var(--r-sm)] px-2 py-1 text-[length:var(--fs-xs)] font-semibold" style={{ background: "var(--bg-2)", color: "var(--lime)" }}>
              {t("guidelines.eyebrow")}
            </div>
            <h1 className="break-keep text-[length:var(--fs-xl)] font-bold leading-tight tracking-tight text-[var(--ink-0)] md:text-[length:var(--fs-2xl)]">{t("guidelines.pageTitle")}</h1>
            <p className="mt-2 text-[length:var(--fs-sm)] text-[var(--ink-2)] leading-relaxed">
              {t("guidelines.intro")}
            </p>
          </div>
          <div className="grid w-full gap-2 min-[420px]:w-auto min-[420px]:grid-cols-2 lg:grid-cols-1">
            <Link to="/" className={buttonClass({ variant: "primary", size: "sm", className: "justify-center" })}>
              {t("guidelines.actions.home")}
            </Link>
            <Link to="/board" className={buttonClass({ variant: "secondary", size: "sm", className: "justify-center" })}>
              {t("guidelines.actions.board")}
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {highlights.map((item) => (
          <div key={item} className="rounded-[var(--r-md)] border p-4 text-[length:var(--fs-sm)] leading-5" style={{ background: "var(--bg-1)", borderColor: "var(--line)", color: "var(--ink-2)" }}>
            {item}
          </div>
        ))}
      </section>

      <Card padding="none" className="divide-y divide-[var(--line-soft)]">
        {sections.map((section) => (
          <Section key={section.title} title={section.title}>
            {section.intro && <p className="mb-2">{section.intro}</p>}
            <ul className="list-disc list-inside space-y-1.5">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {section.footer && <p className="mt-2">{section.footer}</p>}
          </Section>
        ))}
      </Card>

      <section className="rounded-[var(--r-lg)] border p-5" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
        <h2 className="text-[length:var(--fs-base)] font-semibold text-[var(--ink-0)]">{t("guidelines.next.title")}</h2>
        <p className="mt-2 text-[length:var(--fs-sm)] leading-6 text-[var(--ink-2)]">{t("guidelines.next.body")}</p>
        <div className="mt-4 grid gap-2 min-[420px]:flex min-[420px]:flex-wrap">
          <Link to="/" className={buttonClass({ variant: "primary", size: "sm", className: "justify-center" })}>
            {t("guidelines.actions.home")}
          </Link>
          <Link to="/board" className={buttonClass({ variant: "secondary", size: "sm", className: "justify-center" })}>
            {t("guidelines.actions.board")}
          </Link>
          <Link to="/board/write" className={buttonClass({ variant: "secondary", size: "sm", className: "justify-center" })}>
            {t("guidelines.actions.write")}
          </Link>
          <Link to="/feedback" className={buttonClass({ variant: "ghost", size: "sm", className: "justify-center" })}>
            {t("guidelines.actions.feedback")}
          </Link>
        </div>
      </section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-5 sm:p-6">
      <h2 className="text-[length:var(--fs-sm)] font-bold text-[var(--ink-0)] mb-3">{title}</h2>
      <div className="text-[length:var(--fs-sm)] text-[var(--ink-2)] leading-relaxed">
        {children}
      </div>
    </div>
  );
}
