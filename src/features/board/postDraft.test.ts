import { clearPostDraft, getPostDraftKey, readPostDraft, writePostDraft } from "./postDraft";

describe("postDraft", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("stores and reads a user scoped draft", () => {
    const key = getPostDraftKey("uid-1", "free");
    writePostDraft(key, {
      title: "임시 제목",
      tags: "tag",
      contentHtml: "<p>내용</p>",
      feedbackType: "bug",
      isPrivate: false,
      updatedAt: 123,
    });

    expect(readPostDraft(key)).toMatchObject({
      title: "임시 제목",
      tags: "tag",
      contentHtml: "<p>내용</p>",
    });
  });

  it("drops malformed drafts instead of throwing", () => {
    const key = getPostDraftKey("uid-1", "inquiry");
    window.localStorage.setItem(key, "{bad-json");

    expect(readPostDraft(key)).toBeNull();
  });

  it("clears saved drafts after successful submit", () => {
    const key = getPostDraftKey("uid-1", "free");
    writePostDraft(key, {
      title: "임시 제목",
      tags: "",
      contentHtml: "<p>내용</p>",
      feedbackType: "bug",
      isPrivate: false,
      updatedAt: 123,
    });

    clearPostDraft(key);

    expect(readPostDraft(key)).toBeNull();
  });
});
