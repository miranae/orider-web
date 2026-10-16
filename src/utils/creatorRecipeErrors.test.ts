import { creatorRecipeErrorDetails, creatorRecipeErrorFeedback } from "./creatorRecipeErrors";

it.each(["ko", "en"])("maps only recognized reasons without exposing server text in %s", language => {
  const failure = { message: "PRIVATE https://example.com?token=secret", details: { reason: "recipe-activity-limit", retryable: false, retryAt: null, limit: 2000 } };
  const feedback = creatorRecipeErrorFeedback(failure, language)!;
  expect(feedback.retryable).toBe(false);
  expect(feedback.message).toContain(language === "ko" ? "일부 기록만으로 결과를 만들지 않았습니다" : "partial set of records");
  expect(feedback.message).not.toMatch(/PRIVATE|secret|https:|짧은 기간|shorter period/);
  expect(creatorRecipeErrorFeedback({ message: failure.message, details: { reason: failure.message } }, language)).toBeNull();
});
it("reads callable details and the legacy customData envelope, retaining only a valid retry timestamp", () => {
  expect(creatorRecipeErrorDetails({ customData: { details: { reason: "cooldown" } } })).toEqual({ reason: "cooldown" });
  expect(creatorRecipeErrorFeedback({ details: { reason: "recipe-read-minute-limit", retryAt: 123456 } }, "en")).toMatchObject({ retryAt: 123456, retryable: true });
  expect(creatorRecipeErrorFeedback({ details: { reason: "recipe-read-minute-limit", retryAt: "PRIVATE" } }, "ko")?.retryAt).toBeNull();
});
it.each([
  ["recipe-read-minute-limit", "레시피 조회", "recipe reads", true],
  ["recipe-read-daily-limit", "내일", "tomorrow", false],
  ["photo-download-failed", "사진을 불러오지", "could not be downloaded", true],
  ["photo-encoding-failed", "다른 사진", "Choose another photo", false],
] as const)("provides safe Korean and English feedback for %s", (reason, koText, enText, retryable) => {
  for (const [language, expected] of [["ko", koText], ["en", enText]]) {
    const feedback = creatorRecipeErrorFeedback({ message: "PRIVATE_TOKEN", details: { reason } }, language!)!;
    expect(feedback.message).toContain(expected);
    expect(feedback.message).not.toContain("PRIVATE_TOKEN");
    expect(feedback.retryable).toBe(retryable);
  }
});
