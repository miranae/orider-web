import { useTranslation } from "react-i18next";
import { PageHeader } from "../components/redesign";

export default function AboutPage() {
  const { t } = useTranslation("common");
  const points = t("about.points", { returnObjects: true }) as string[];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t("nav.aboutOrider")}
        title={t("about.title")}
        subtitle={t("about.subtitle")}
      />
      <section
        className="grid gap-3 md:grid-cols-3"
        aria-label={t("about.pointsAria")}
      >
        {points.map((point) => (
          <div
            key={point}
            className="rounded-[var(--r-lg)] border p-4"
            style={{ background: "var(--bg-1)", borderColor: "var(--line-soft)" }}
          >
            <p className="m-0 text-[length:var(--fs-sm)] leading-6" style={{ color: "var(--ink-1)" }}>
              {point}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
