import { useTranslation } from "react-i18next";
import { Card } from "../theme/components";

interface Group {
  heading: string;
  list: string[];
}

interface SectionData {
  title: string;
  paragraphs?: string[];
  list?: string[];
  groups?: Group[];
  footer?: string;
  stravaLinkHeading?: string;
  stravaLinkSentencePrefix?: string;
  stravaLinkSentenceSuffix?: string;
}

export default function PrivacyPage() {
  const { t } = useTranslation("legal");
  const sections = (t("privacy.sections", { returnObjects: true }) as SectionData[]) ?? [];
  const stravaLinkLabel = t("privacy.stravaPrivacyLink");

  return (
    <div className="max-w-2xl mx-auto pb-20 space-y-8">
      <div>
        <h1 className="text-[length:var(--fs-2xl)] font-bold tracking-tight text-[var(--ink-0)]">{t("privacy.title")}</h1>
        <p className="text-[length:var(--fs-sm)] text-[var(--ink-2)] mt-1">{t("privacy.lastUpdated")}</p>
      </div>

      <p className="text-[length:var(--fs-sm)] text-[var(--ink-2)] leading-relaxed">{t("privacy.intro")}</p>

      <Card padding="none" className="divide-y divide-[var(--line-soft)]">
        {sections.map((s, i) => (
          <Section key={i} title={s.title}>
            {s.paragraphs?.map((p, j) => (
              <p key={`p${j}`} className="mb-2">{p}</p>
            ))}
            {s.list && (
              <ul className="list-disc list-inside space-y-1.5">
                {s.list.map((item, j) => (
                  <li key={`l${j}`}>{item}</li>
                ))}
              </ul>
            )}
            {s.groups?.map((g, j) => (
              <div key={`g${j}`}>
                <p className="font-medium text-[var(--ink-1)] mt-3 mb-1">{g.heading}</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  {g.list.map((item, k) => (
                    <li key={k}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
            {s.footer && <p className="mt-2">{s.footer}</p>}
            {s.stravaLinkHeading && (
              <>
                <p className="font-medium text-[var(--ink-1)] mt-3 mb-1">{s.stravaLinkHeading}</p>
                <p className="ml-2">
                  {s.stravaLinkSentencePrefix}
                  <a href="https://www.strava.com/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-[var(--strava)] hover:underline font-medium">
                    {stravaLinkLabel}
                  </a>
                  {s.stravaLinkSentenceSuffix}
                </p>
              </>
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
