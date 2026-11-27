import { SUPPORTED_LANGS } from "./detector";

const manualRoot = /^\/(manual|web-manual)(?:\/|$)/;

export function isManualPath(path: string): boolean {
  return manualRoot.test(path);
}

/** 정적 매뉴얼 경로에서 챕터와 앵커를 유지한다. 한국어는 기존 주소를 사용한다. */
export function localizedManualPath(path: string, language?: string): string {
  const locale = SUPPORTED_LANGS.find((code) => code.toLowerCase() === language?.toLowerCase()) ?? "ko";
  return path.replace(manualRoot, (_, manual: string) =>
    locale === "ko" ? `/${manual}/` : `/${manual}/${locale}/`,
  );
}
