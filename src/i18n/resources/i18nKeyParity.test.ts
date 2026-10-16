import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";

/**
 * i18n 키 누락 회귀 테스트 (#400 §3).
 *
 * `today.start` 처럼 번역 키가 한 언어에만 존재하면 i18next 는 누락된 언어에서 키 문자열
 * 원문("today.start")을 그대로 렌더한다. 네임스페이스 파일 간 ko/en 키 집합이 어긋나는
 * 순간 즉시 잡아낸다. CLDR 복수형은 양쪽 기본 키 또는 양쪽의 완전한 복수형 묶음이
 * 있을 때 언어별로 허용한다. 일반 키 누락은 양방향으로 검증한다.
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

function parityFailures(ko: unknown, en: unknown): string[] {
  const localeKeys = { ko: new Set(flattenKeys(ko)), en: new Set(flattenKeys(en)) };
  const localeCategories = Object.fromEntries(LOCALES.map(locale => [locale,
    new Set<string>(new Intl.PluralRules(locale).resolvedOptions().pluralCategories),
  ])) as Record<(typeof LOCALES)[number], Set<string>>;
  const failures: string[] = [];
  for (const locale of LOCALES) {
    const keys = localeKeys[locale];
    const otherKeys = localeKeys[locale === "ko" ? "en" : "ko"];
    const categories = localeCategories[locale];
    const families = new Set<string>();
    for (const key of keys) {
      const match = /^(.*)_(zero|one|two|few|many|other)$/.exec(key);
      const localPlural = match && categories.has(match[2]);
      if (localPlural) families.add(match[1]);
      if (otherKeys.has(key)) continue;
      if (localPlural) {
        const sharedBase = keys.has(match[1]) && otherKeys.has(match[1]);
        const completeBoth = LOCALES.every(language => [...localeCategories[language]]
          .every(category => localeKeys[language].has(`${match[1]}_${category}`)));
        if (sharedBase || completeBoth) continue;
      }
      failures.push(`${locale}: unmatched key ${key}`);
    }
    for (const base of families) {
      for (const category of categories) {
        const key = `${base}_${category}`;
        if (!keys.has(key)) failures.push(`${locale}: incomplete plural family ${key}`);
      }
    }
  }
  return failures.sort();
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

    expect(parityFailures(ko, en), `ko/en key contract for ${file}`).toEqual([]);
  });

  it("allows complete English plural variants when both locales retain the base key", () => {
    expect(parityFailures({ count: "{{count}}개" }, { count: "{{count}} items", count_one: "{{count}} item", count_other: "{{count}} items" })).toEqual([]);
  });

  it("still rejects ordinary missing keys in either direction", () => {
    expect(parityFailures({ today: { start: "시작" } }, {})).toContain("ko: unmatched key today.start");
    expect(parityFailures({}, { today: { start: "Start" } })).toContain("en: unmatched key today.start");
  });

  it("rejects orphan plural variants, missing base translations and invalid locale categories", () => {
    expect(parityFailures({}, { count_one: "one", count_other: "many" })).toContain("en: unmatched key count_one");
    expect(parityFailures({ count: "개" }, { count_one: "one", count_other: "many" })).toContain("ko: unmatched key count");
    expect(parityFailures({ count: "개" }, { count: "items", count_few: "few" })).toContain("en: unmatched key count_few");
  });

  it("requires every CLDR category once a locale supplies a plural family", () => {
    expect(parityFailures({ count: "개" }, { count: "items", count_one: "one" })).toContain("en: incomplete plural family count_other");
    expect(parityFailures({ count: "개" }, { count: "items", count_other: "many" })).toContain("en: incomplete plural family count_one");
  });

  it("rejects matching incomplete plural-only families instead of accepting identical key sets", () => {
    expect(parityFailures({ count_one: "하나" }, { count_one: "one" })).toContain("en: incomplete plural family count_other");
  });

  it("preserves complete plural-only families and actual i18next rendering without a base key", async () => {
    const ko = { count_other: "{{count}}개" };
    const en = { count_one: "{{count}} item", count_other: "{{count}} items" };
    expect(parityFailures(ko, en)).toEqual([]);
    // Historical matching unused categories are ordinary shared keys, not an asymmetry exemption.
    expect(parityFailures({ ...ko, count_one: "{{count}}개" }, en)).toEqual([]);
    expect(parityFailures({ ...ko, count_unknown: "값" }, en)).toContain("ko: unmatched key count_unknown");
    const instance = createInstance();
    await instance.init({ lng: "en", resources: { ko: { example: ko }, en: { example: en } }, defaultNS: "example" });
    expect(instance.t("count", { count: 1 })).toBe("1 item");
    expect(instance.t("count", { count: 2 })).toBe("2 items");
    await instance.changeLanguage("ko");
    expect(instance.t("count", { count: 1 })).toBe("1개");
    expect(instance.t("count", { count: 2 })).toBe("2개");
  });

  it.each([
    ["group", "list.groupCount", "Member of 1 club", "Member of 2 clubs"],
    ["event", "view.dayEventCount", "1 event", "2 events"],
    ["event", "view.monthEvents", "1 event this month", "2 events this month"],
  ])("preserves actual English singular/plural rendering for %s:%s", async (namespace, key, singular, plural) => {
    const resource = JSON.parse(readFileSync(join(RESOURCES_DIR, "en", `${namespace}.json`), "utf8"));
    const instance = createInstance();
    await instance.init({ lng: "en", resources: { en: { [namespace]: resource } }, defaultNS: namespace, keySeparator: false });
    expect(instance.t(key, { count: 1 })).toBe(singular);
    expect(instance.t(key, { count: 2 })).toBe(plural);
  });
});
