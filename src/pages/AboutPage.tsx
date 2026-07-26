import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";

export function getAboutDocumentPath(language: string): string {
  return language.startsWith("en") ? "/en/about/index.html" : "/ko/about/index.html";
}

export function redirectToAboutDocument(
  language: string,
  replace: (path: string) => void = (path) => window.location.replace(path),
): void {
  replace(getAboutDocumentPath(language));
}

type AboutPageProps = {
  replace?: (path: string) => void;
};

export default function AboutPage({ replace }: AboutPageProps) {
  const { t, i18n } = useTranslation("common");
  const { lang } = useParams<{ lang: string }>();

  useEffect(() => {
    redirectToAboutDocument(lang ?? i18n.language, replace);
  }, [i18n.language, lang, replace]);

  return (
    <div className="flex min-h-48 items-center justify-center text-[var(--ink-3)]" role="status">
      {t("button.loading")}
    </div>
  );
}
