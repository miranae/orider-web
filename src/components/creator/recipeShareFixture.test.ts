import { parseRecipeSharePayload } from "../../../e2e/fixtures/recipeSharePayload";
function encode(value: unknown) { return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
it("loads only validated public fields from a unicode base64url visual-fixture payload", () => {
  const card = { title: "월간 배지", body: "기억할 한 달", footer: "위치 제외", kind: "badge", metrics: [{ label: "거리", value: "480 km" }], privateDiary: "EXCLUDED" };
  expect(parseRecipeSharePayload(encode(card))).toEqual({ title: card.title, body: card.body, footer: card.footer, kind: card.kind, metrics: card.metrics });
});
it("rejects malformed or oversized fixture payloads", () => {
  expect(parseRecipeSharePayload(null)).toBeNull();
  expect(() => parseRecipeSharePayload(encode({ title: 1 }))).toThrow();
  expect(() => parseRecipeSharePayload("a".repeat(900001))).toThrow();
});
