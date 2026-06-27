import { useTranslation } from "react-i18next";
import { Card } from "../theme/components";

export default function CommunityGuidelinesPage() {
  const { t } = useTranslation("legal");
  return (
    <div className="max-w-2xl mx-auto pb-20 space-y-8">
      <div>
        <h1 className="text-[length:var(--fs-2xl)] font-bold tracking-tight text-[var(--ink-0)]">{t("guidelines.pageTitle")}</h1>
      </div>

      <p className="text-[length:var(--fs-sm)] text-[var(--ink-2)] leading-relaxed">
        {t("guidelines.intro")}
      </p>

      <Card padding="none" className="divide-y divide-[var(--line-soft)]">
        <Section title={t("guidelines.section1.title")}>
          <ul className="list-disc list-inside space-y-1.5">
            <li>{t("guidelines.section1.item1")}</li>
            <li>{t("guidelines.section1.item2")}</li>
          </ul>
        </Section>

        <Section title={t("guidelines.section2.title")}>
          <ul className="list-disc list-inside space-y-1.5">
            <li>{t("guidelines.section2.item1")}</li>
            <li>{t("guidelines.section2.item2")}</li>
            <li>{t("guidelines.section2.item3")}</li>
          </ul>
        </Section>

        <Section title={t("guidelines.section3.title")}>
          <ul className="list-disc list-inside space-y-1.5">
            <li>{t("guidelines.section3.item1")}</li>
            <li>{t("guidelines.section3.item2")}</li>
          </ul>
        </Section>

        <Section title={t("guidelines.section4.title")}>
          <ul className="list-disc list-inside space-y-1.5">
            <li>{t("guidelines.section4.item1")}</li>
            <li>{t("guidelines.section4.item2")}</li>
          </ul>
        </Section>

        <Section title={t("guidelines.section5.title")}>
          <p className="mb-2">{t("guidelines.section5.intro")}</p>
          <ul className="list-disc list-inside space-y-1.5">
            <li>{t("guidelines.section5.item1")}</li>
            <li>{t("guidelines.section5.item2")}</li>
            <li>{t("guidelines.section5.item3")}</li>
          </ul>
          <p className="mt-2">{t("guidelines.section5.footer")}</p>
        </Section>
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
