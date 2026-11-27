import { SUPPORTED_LANGS } from "./detector";
import ko from "./resources/ko/standalone.json";
import en from "./resources/en/standalone.json";
import ja from "./resources/ja/standalone.json";
import zhTW from "./resources/zh-TW/standalone.json";
import ptBR from "./resources/pt-BR/standalone.json";
import es from "./resources/es/standalone.json";

const messages = { ko, en, ja, "zh-TW": zhTW, "pt-BR": ptBR, es } satisfies
  Record<(typeof SUPPORTED_LANGS)[number], Record<keyof typeof ko, string>>;

export function standaloneText(language: string, key: keyof typeof ko, values: Record<string, string> = {}): string {
  const tag = language.replace(/_/g, "-").toLowerCase();
  const locale = SUPPORTED_LANGS.find((code) => code.toLowerCase() === tag)
    ?? (tag.startsWith("zh-hant") ? "zh-TW" : SUPPORTED_LANGS.find((code) => code === tag.split("-")[0]))
    ?? "en";
  return messages[locale][key].replace(/\{\{(\w+)\}\}/g, (token, name: string) => values[name] ?? token);
}
