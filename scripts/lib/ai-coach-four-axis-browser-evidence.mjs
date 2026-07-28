import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";
import { createServer } from "vite";
import { prefixedEvidenceDigest } from "./ai-coach-four-axis-web-evidence.mjs";

const HARNESS_PATH = "/scripts/evidence/four-axis/index.html";
const COMPONENTS = Object.freeze({ pmc: "CoachPmcInsightCard", rider: "CoachRiderInsightCard",
  progress: "CoachPrescription", ride: "CourseRidePlanSection" });
const QUESTION_SELECTORS = Object.freeze({ pmc: ".coach-pmc-card__questions button",
  rider: ".coach-rider-card__questions button", progress: ".coach-progress-review__questions button",
  ride: ".course-ride-plan__questions button" });

function evidenceAliases(root) {
  const directory = resolve(root, "scripts/evidence/four-axis");
  const replacements = [
    ["services/runtimeConfig", "runtime-config.stub.ts"],
    ["hooks/useCoachPmcInsight", "pmc-hook.stub.ts"],
    ["hooks/useCoachRiderInsight", "rider-hook.stub.ts"],
    ["services/coachClient", "coach-client.stub.ts"],
    ["coach/CoachQuestionLauncher", "question-launcher.stub.tsx"],
  ];
  return { name: "four-axis-evidence-aliases", enforce: "pre", resolveId(source) {
    const replacement = replacements.find(([suffix]) => source.endsWith(suffix));
    return replacement ? resolve(directory, replacement[1]) : null;
  } };
}

export async function collectBrowserEvidence(root = process.cwd()) {
  const server = await createServer({ root, configFile: false, mode: "evidence", appType: "spa", logLevel: "silent",
    plugins: [evidenceAliases(root), react()], server: { host: "127.0.0.1", port: 0, strictPort: false } });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("web_evidence:harness_address");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 320, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage(); const captures = []; const surfaces = {};
  await page.addInitScript(() => {
    globalThis.__fourAxisEvidence = { live: {}, activations: {} };
    const inspect = () => document.querySelectorAll("[data-evidence-surface]").forEach((rootElement) => {
      const name = rootElement.getAttribute("data-evidence-surface");
      if (!name) return;
      const count = rootElement.querySelectorAll("[aria-live], [role=status], [role=alert]").length;
      globalThis.__fourAxisEvidence.live[name] = Math.max(globalThis.__fourAxisEvidence.live[name] ?? 0, count);
    });
    document.addEventListener("DOMContentLoaded", () => {
      inspect(); new MutationObserver(inspect).observe(document.body, { childList: true, subtree: true, attributes: true });
      document.addEventListener("click", (event) => {
        const name = event.target?.closest?.("[data-evidence-surface]")?.getAttribute("data-evidence-surface");
        if (name) globalThis.__fourAxisEvidence.activations[name] = (globalThis.__fourAxisEvidence.activations[name] ?? 0) + 1;
      }, true);
    });
  });
  try {
    for (const [name, componentName] of Object.entries(COMPONENTS)) {
      await page.goto(`http://127.0.0.1:${address.port}${HARNESS_PATH}?surface=${name}`, { waitUntil: "networkidle" });
      await page.locator('[data-evidence-harness="four-axis-actual-components"]').waitFor();
      const rootLocator = page.locator(`[data-evidence-surface="${name}"]`);
      await rootLocator.locator(QUESTION_SELECTORS[name]).first().waitFor();
      await rootLocator.evaluate((element) => { element.style.zoom = "2"; });
      const traversal = await rootLocator.evaluate((element, questionSelector) => {
        const descriptor = (candidate) => `${candidate.tagName.toLowerCase()}|${candidate.getAttribute("role") ?? ""}|${candidate.getAttribute("aria-label") ?? candidate.textContent?.replace(/\s+/gu, " ").trim() ?? ""}`;
        const focusable = [...element.querySelectorAll("a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]")]
          .filter((candidate) => Number(candidate.getAttribute("tabindex") ?? "0") >= 0
            && candidate.getClientRects().length > 0);
        const questions = [...element.querySelectorAll(questionSelector)].filter((candidate) => !candidate.disabled);
        const firstQuestionIndex = focusable.indexOf(questions[0]);
        if (firstQuestionIndex < 0) throw new Error("question control is not in the sequential focus order");
        return { expected: focusable.slice(0, firstQuestionIndex + 1).map(descriptor), questions: questions.map(descriptor),
          tabindexMinusOneQuestionCount: questions.filter((candidate) => candidate.getAttribute("tabindex") === "-1").length };
      }, QUESTION_SELECTORS[name]);
      if (!await page.evaluate(() => document.activeElement === document.body)) throw new Error("web_evidence:tab_body_start");
      await page.keyboard.press("Tab");
      const startDescriptor = await page.evaluate((surfaceName) => {
        const active = document.activeElement;
        if (!active || active.getAttribute("data-evidence-start") !== surfaceName) throw new Error("start sentinel skipped");
        return `${active.tagName.toLowerCase()}|${active.getAttribute("role") ?? ""}|${active.getAttribute("aria-label") ?? active.textContent?.replace(/\s+/gu, " ").trim() ?? ""}`;
      }, name);
      const observed = [];
      for (let index = 0; index < traversal.expected.length; index += 1) {
        await page.keyboard.press("Tab");
        observed.push(await page.evaluate(() => {
          const active = document.activeElement;
          return `${active?.tagName.toLowerCase() ?? ""}|${active?.getAttribute("role") ?? ""}|${active?.getAttribute("aria-label") ?? active?.textContent?.replace(/\s+/gu, " ").trim() ?? ""}`;
        }));
      }
      const focusOrderMismatchCount = traversal.expected.reduce((count, item, index) => count + (observed[index] === item ? 0 : 1), 0);
      const focusedQuestionOrdinal = traversal.questions.indexOf(observed.at(-1));
      const skippedQuestionControlCount = focusedQuestionOrdinal < 0 ? traversal.questions.length : focusedQuestionOrdinal;
      await page.keyboard.press("Enter");
      const ariaSnapshot = await rootLocator.ariaSnapshot();
      const screenshot = await rootLocator.screenshot({ animations: "disabled" });
      const measurement = await rootLocator.evaluate((element, surfaceName) => {
        const labelledRoots = [...element.querySelectorAll("[aria-labelledby]")].filter((candidate) => {
          const id = candidate.getAttribute("aria-labelledby"); return id && document.getElementById(id)?.textContent?.trim();
        }).length;
        const namedInteractiveCount = [...element.querySelectorAll("button, input, select, textarea")]
          .filter((candidate) => candidate.getAttribute("aria-label")?.trim() || candidate.textContent?.trim()
            || candidate.closest("label")?.textContent?.trim()).length;
        return { rootClientWidth: element.clientWidth, rootScrollWidth: element.scrollWidth,
          labelledRootCount: labelledRoots, namedInteractiveCount,
          liveRegionObservedCount: globalThis.__fourAxisEvidence.live[surfaceName] ?? 0,
          keyboardActivations: globalThis.__fourAxisEvidence.activations[surfaceName] ?? 0,
          dom: element.innerHTML };
      }, name);
      captures.push(measurement.dom);
      const receipt = { surface: name, componentName, harnessPath: HARNESS_PATH, viewportCssPx: 320,
        deviceScaleFactor: 2, cssZoomPercent: 200, rootClientWidth: measurement.rootClientWidth,
        rootScrollWidth: measurement.rootScrollWidth, labelledRootCount: measurement.labelledRootCount,
        namedInteractiveCount: measurement.namedInteractiveCount,
        liveRegionObservedCount: measurement.liveRegionObservedCount,
        tabStartDigest: prefixedEvidenceDigest(startDescriptor), tabSteps: observed.length,
        expectedFocusOrderDigest: prefixedEvidenceDigest(traversal.expected),
        observedFocusOrderDigest: prefixedEvidenceDigest(observed), focusOrderMismatchCount,
        questionControlOrderDigest: prefixedEvidenceDigest(traversal.questions), focusedQuestionOrdinal,
        focusedQuestionControlDigest: prefixedEvidenceDigest(observed.at(-1)),
        tabindexMinusOneQuestionCount: traversal.tabindexMinusOneQuestionCount, skippedQuestionControlCount,
        keyboardActivations: measurement.keyboardActivations, domDigest: prefixedEvidenceDigest(measurement.dom),
        ariaSnapshotDigest: prefixedEvidenceDigest(ariaSnapshot), screenshotDigest: prefixedEvidenceDigest(screenshot) };
      surfaces[name] = { ...receipt, measurementReceiptDigest: prefixedEvidenceDigest(receipt) };
    }
  } finally { await context.close(); await browser.close(); await server.close(); }
  return { evidence: { engine: "chromium", harnessMode: "evidence", harnessPath: HARNESS_PATH,
    viewportCssPx: 320, deviceScaleFactor: 2, cssZoomPercent: 200, surfaces }, captures };
}
