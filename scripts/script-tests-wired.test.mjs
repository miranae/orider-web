import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

/**
 * 실행되지 않는 안전 검증은 없는 것과 같다. scripts/ 의 node:test 스위트는 vitest 가
 * 수집하지 않으므로 npm test 에 명시적으로 이어 붙여야 하는데, 실제로 두 개가 연결되지
 * 않은 채 남아 있었다(merge-gate-ci-reuse, social-callable-contract).
 *
 * 새 스위트를 추가하고 연결을 잊으면 이 테스트가 막는다.
 */
test("every scripts/*.test.mjs suite runs as part of npm test", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const scripts = pkg.scripts;
  const suites = readdirSync("scripts").filter((file) => file.endsWith(".test.mjs"));
  assert.ok(suites.length > 0, "the guard is pointless if it finds no suites");

  // npm test 가 직접 실행하거나, npm test 가 부르는 다른 스크립트가 실행하면 연결된 것이다.
  const invoked = new Set();
  const collect = (command) => {
    for (const [name, body] of Object.entries(scripts)) {
      if (!command.includes(`npm run ${name}`)) continue;
      if (invoked.has(name)) continue;
      invoked.add(name);
      collect(body);
    }
  };
  collect(scripts.test);
  const reachable = [scripts.test, ...[...invoked].map((name) => scripts[name])].join(" && ");

  const missing = suites.filter((suite) => !reachable.includes(suite));
  assert.deepEqual(missing, [], `unwired suites: ${missing.join(", ")}`);
});
