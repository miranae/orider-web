import i18n from "../i18n";
import { SUPPORTED_LANGS, type Lang } from "../i18n/detector";

const dateLocales: Record<Lang, string> = {
  ko: "ko-KR",
  en: "en-US",
  ja: "ja-JP",
  "zh-TW": "zh-TW",
  "pt-BR": "pt-BR",
  es: "es-ES",
};

/** 날짜와 시간을 현재 UI 언어로 표시한다. */
export function localeTag(): string {
  const current = i18n.language?.toLowerCase();
  const language = SUPPORTED_LANGS.find((code) => {
    const tag = code.toLowerCase();
    return current === tag || current?.startsWith(tag + "-");
  });
  return dateLocales[language ?? "ko"];
}
