import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * i18n 키 누락 회귀 테스트 (#400 §3).
 *
 * `today.start` 처럼 번역 키가 한 언어에만 존재하면 i18next 는 누락된 언어에서 키 문자열
 * 원문("today.start")을 그대로 렌더한다. 네임스페이스 파일 간 ko/en 키 집합이 어긋나는
 * 순간 즉시 잡아내기 위해, 모든 리소스 파일에 대해 두 언어의 키 집합이 정확히 일치하는지
 * 검증한다. (값 텍스트 자체의 번역 품질은 검증 대상이 아니다 — 오직 "키 존재 여부".)
 */

const RESOURCES_DIR = join(process.cwd(), "src/i18n/resources");
const LOCALES = ["ko", "en"] as const;

function flattenKeys(obj: unknown, prefix = ""): string[] {
  if (obj == null || typeof obj !== "object") return [prefix];
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const nextPrefix = prefix ? `${prefix}.${k}` : k;
    if (v != null && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, nextPrefix));
    } else {
      keys.push(nextPrefix);
    }
  }
  return keys;
}

function loadNamespaceFiles(locale: (typeof LOCALES)[number]): string[] {
  return readdirSync(join(RESOURCES_DIR, locale)).filter((f) => f.endsWith(".json"));
}

describe("i18n key parity (ko <-> en)", () => {
  const koFiles = loadNamespaceFiles("ko");
  const enFiles = loadNamespaceFiles("en");

  it("defines the same set of namespace files for every locale", () => {
    expect([...koFiles].sort()).toEqual([...enFiles].sort());
  });

  it.each(koFiles)("keeps ko/en keys in sync for %s", (file) => {
    const ko = JSON.parse(readFileSync(join(RESOURCES_DIR, "ko", file), "utf8"));
    const en = JSON.parse(readFileSync(join(RESOURCES_DIR, "en", file), "utf8"));

    const koKeys = new Set(flattenKeys(ko));
    const enKeys = new Set(flattenKeys(en));

    const missingInEn = [...koKeys].filter((k) => !enKeys.has(k)).sort();
    const missingInKo = [...enKeys].filter((k) => !koKeys.has(k)).sort();

    expect(missingInEn, `keys present in ko/${file} but missing in en/${file}`).toEqual([]);
    expect(missingInKo, `keys present in en/${file} but missing in ko/${file}`).toEqual([]);
  });
});
