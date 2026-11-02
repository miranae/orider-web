import { createInstance, type ReadCallback } from "i18next";
import { describe, expect, it, vi } from "vitest";
import { registerLegalResources } from "./legalResources";

describe("policy page resources", () => {
  it("provides both languages synchronously without a backend read on language changes", async () => {
    const read = vi.fn((_language: string, _namespace: string, callback: ReadCallback) => callback(Error("offline"), false));
    const instance = createInstance();
    await instance.use({ type: "backend", read }).init({ lng: "ko", fallbackLng: false, ns: [], resources: {}, partialBundledLanguages: true });
    registerLegalResources(instance);
    expect(instance.getFixedT("ko", "legal")("terms.title")).not.toBe("terms.title");
    expect(instance.getFixedT("en", "legal")("terms.title")).not.toBe("terms.title");
    await instance.changeLanguage("en");
    await instance.loadNamespaces("legal");
    expect(instance.t("privacy.sections", { ns: "legal", returnObjects: true })).toEqual(expect.any(Array));
    expect(read).not.toHaveBeenCalled();
  });

  it("does not replace resources already loaded for a language", async () => {
    const instance = createInstance();
    await instance.init({ lng: "ko", resources: { ko: { legal: { sentinel: "Existing policy" } } } });
    registerLegalResources(instance);
    registerLegalResources(instance);
    expect(instance.getFixedT("ko", "legal")("sentinel")).toBe("Existing policy");
    expect(instance.hasResourceBundle("en", "legal")).toBe(true);
  });
});
