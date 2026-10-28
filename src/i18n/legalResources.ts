import i18n, { type i18n as I18n } from "i18next";
import koLegal from "./resources/ko/legal.json";
import enLegal from "./resources/en/legal.json";

/** Loaded with the existing lazy policy pages, before useTranslation can suspend. */
export function registerLegalResources(target: Pick<I18n, "hasResourceBundle" | "addResourceBundle">) {
  for (const [language, resources] of Object.entries({ ko: koLegal, en: enLegal })) {
    if (!target.hasResourceBundle(language, "legal")) {
      target.addResourceBundle(language, "legal", resources);
    }
  }
}

registerLegalResources(i18n);
