import { feedSessionKey, readFeedDepth, saveFeedDepth } from "./feedNavigationDepth";
it("isolates the same UID across authentication incarnations and stores only bounded depth", () => {
  const first = { uid: "same" }; const second = { uid: "same" };
  const oldKey = `${feedSessionKey(first)}:entry`;
  saveFeedDepth(oldKey, 999);
  expect(readFeedDepth(oldKey, 10)).toBe(200);
  expect(readFeedDepth(`${feedSessionKey(second)}:entry`, 10)).toBe(10);
  expect(feedSessionKey(first)).toBe(feedSessionKey(first));
});
