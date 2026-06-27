import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import { Card } from "../theme/components";

interface SectionData {
  title: string;
  paragraphs?: string[];
  list?: string[];
  list2?: string[];
  stravaLinkSentencePrefix?: string;
  stravaLinkSentenceSuffix?: string;
}

export default function TermsPage() {
  const { t } = useTranslation("legal");

  const sections = (t("terms.sections", { returnObjects: true }) as SectionData[]) ?? [];
  const stravaLinkLabel = t("terms.stravaTermsLink");

  return (
    <div className="max-w-2xl mx-auto pb-20 space-y-8">
      <div>
        <h1 className="text-[length:var(--fs-2xl)] font-bold tracking-tight text-[var(--ink-0)]">{t("terms.title")}</h1>
        <p className="text-[length:var(--fs-sm)] text-[var(--ink-2)] mt-1">{t("terms.lastUpdated")}</p>
      </div>

      <Card padding="none" className="divide-y divide-[var(--line-soft)]">
        {sections.map((s, i) => (
          <Section key={i} title={s.title}>
            {s.paragraphs?.map((p, j) => (
              <p key={`p${j}`} className={s.list || s.list2 ? "mb-2" : ""}>{p}</p>
            ))}
            {s.list && (
              <ul className="list-disc list-inside space-y-1.5">
                {s.list.map((item, j) => (
                  <li key={`l${j}`}>{item}</li>
                ))}
              </ul>
            )}
            {s.list2 && (
              <ul className="list-disc list-inside space-y-1.5 mt-3">
                {s.list2.map((item, j) => (
                  <li key={`l2${j}`}>{item}</li>
                ))}
              </ul>
            )}
            {s.stravaLinkSentencePrefix !== undefined && (
              <p className="mt-2">
                {s.stravaLinkSentencePrefix}
                <Link to="/strava-terms" className="text-[var(--strava)] hover:underline font-medium">
                  {stravaLinkLabel}
                </Link>
                {s.stravaLinkSentenceSuffix}
              </p>
            )}
          </Section>
        ))}
      </Card>
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
