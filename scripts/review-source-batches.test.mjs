import assert from "node:assert/strict";
import test from "node:test";
import { packReviewSourceGroups } from "./lib/review-source-batches.mjs";

test("shared dependency graph fits the existing limit with complete pair and source coverage", () => {
  let state = 4;
  const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
  const costs = new Map([["bootstrap", 1200]]);
  for (let index = 0; index < 80; index++) {
    costs.set(`source${String(index).padStart(2, "0")}`, 1000 + next() % 24000);
  }
  const names = [...costs.keys()].slice(1);
  const groups = names.map(file => new Set([file]));
  for (let index = 0; index < 160; index++) {
    groups.push(new Set([names[next() % 80], names[next() % 80]]));
  }
  const core = new Set(["bootstrap"]);
  const cost = file => costs.get(file);
  const bytes = files => 1000 + [...files].reduce((sum, file) => sum + cost(file), 0);
  const request = { groups, core, cost, bytes, maxBytes: 95000 };
  const chunks = packReviewSourceGroups(request);
  // This graph exhausted the 24-batch cap with the previous packing order.
  assert.ok(chunks.length <= 24);
  for (const chunk of chunks) {
    assert.ok(chunk.has("bootstrap"));
    assert.ok(bytes(chunk) <= request.maxBytes);
  }
  for (const group of groups) {
    assert.ok(chunks.some(chunk => [...group].every(file => chunk.has(file))));
  }
  const normalized = values => values.map(value => [...value].sort());
  assert.deepEqual(normalized(packReviewSourceGroups({ ...request, groups: [...groups].reverse() })), normalized(chunks));
});

test("oversized dependency pairs and more than 24 required batches still fail closed", () => {
  const core = new Set(["bootstrap"]);
  const cost = file => file === "bootstrap" ? 100 : 700;
  const bytes = files => [...files].reduce((sum, file) => sum + cost(file), 0);
  const request = { core, cost, bytes, maxBytes: 1000 };
  assert.throws(() => packReviewSourceGroups({ ...request, groups: [new Set(["caller", "callee"])] }), /pair exceeds/);
  const groups = Array.from({ length: 25 }, (_, index) => new Set([`source${index}`]));
  assert.throws(() => packReviewSourceGroups({ ...request, groups }), /more than 24 batches/);
});
