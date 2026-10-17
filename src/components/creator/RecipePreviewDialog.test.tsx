import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { mockCallableInvocations, setCallableImplementation, setCallableResult } from "../../__tests__/mocks/firebase";
import { RecipePreviewDialog, privateRecipeDocument } from "./RecipePreviewDialog";

beforeEach(() => { HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); }; });

it("neutralizes scripts, navigation, forms, and nested contexts in private report previews and saved HTML", () => {
  const html = privateRecipeDocument('<html><head></head><body><script>window.__unsafe = true</script><a href="https://example.com">Link</a><form><input></form><iframe src="https://example.com"></iframe><p onclick="window.__unsafe = true">Private</p></body></html>');
  expect(html).toContain("Content-Security-Policy");
  expect(html).toContain("default-src 'none'");
  expect(html).toContain("Private");
  expect(html).not.toMatch(/<script|<a\s|<form|<input|<iframe|onclick=/);
});

it("previews the exact activity and photo without emailing, then sends only after explicit action", async () => {
  setCallableResult("previewCreatorRecipe", { data: { subject: "나의 Ride Story", html: "<p>PRIVATE ACTIVITY DETAILS</p>", shareCard: { title: "공개 카드", body: "즐거웠던 42km", footer: "위치 제외" } } });
  setCallableResult("sendCreatorRecipeEmail", { data: { sent: true } });
  const onSent = vi.fn();
  renderWithProviders(<RecipePreviewDialog request={{ recipeId: "ride-story", activityId: "owned-ride", photoId: null }} language="ko" ownerId="test-uid" onClose={vi.fn()} onSent={onSent} />);
  const iframe = await screen.findByTitle("비공개 이메일 최종 결과");
  expect(iframe).toHaveAttribute("sandbox", "");
  expect(iframe).toHaveAttribute("referrerpolicy", "no-referrer");
  expect(iframe.getAttribute("srcdoc")).toContain("PRIVATE ACTIVITY DETAILS");
  expect(mockCallableInvocations).toContainEqual({ name: "previewCreatorRecipe", data: { recipeId: "ride-story", activityId: "owned-ride", photoId: null, includePhoto: false, lang: "ko" } });
  expect(mockCallableInvocations.some((call) => call.name === "sendCreatorRecipeEmail")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "본인 이메일로 받기" }));
  await waitFor(() => expect(onSent).toHaveBeenCalledOnce());
  expect(mockCallableInvocations).toContainEqual({ name: "sendCreatorRecipeEmail", data: { recipeId: "ride-story", activityId: "owned-ride", photoId: null, lang: "ko", deliveryMode: "manual" } });
}, 15_000);

it("does not create a public achievement from missing activity data", async () => {
  setCallableResult("previewCreatorRecipe", { data: { subject: "기록 없음", html: "<p>No activities</p>", shareCard: null } });
  renderWithProviders(<RecipePreviewDialog request={{ recipeId: "ride-widget" }} language="ko" ownerId="test-uid" onClose={vi.fn()} onSent={vi.fn()} />);
  expect(await screen.findByText("공유 카드를 만들 활동이 없습니다. 개인 리포트에서 기록 상태를 확인하세요.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "PNG 저장" })).not.toBeInTheDocument();
});

it("resets email confirmation when the selected activity or language changes", async () => {
  setCallableResult("previewCreatorRecipe", { data: { subject: "첫 번째 결과", html: "<p>Private</p>", shareCard: null } });
  setCallableResult("sendCreatorRecipeEmail", { data: { sent: true } });
  const onClose = vi.fn(); const onSent = vi.fn();
  const { rerender } = renderWithProviders(<RecipePreviewDialog request={{ recipeId: "ride-story", activityId: "first" }} language="ko" ownerId="test-uid" onClose={onClose} onSent={onSent} />);
  fireEvent.click(await screen.findByRole("button", { name: "본인 이메일로 받기" }));
  expect(await screen.findByRole("button", { name: "이메일 발송 완료" })).toBeDisabled();
  setCallableResult("previewCreatorRecipe", { data: { subject: "Second result", html: "<p>Private</p>", shareCard: null } });
  rerender(<RecipePreviewDialog request={{ recipeId: "ride-story", activityId: "second" }} language="en" ownerId="test-uid" onClose={onClose} onSent={onSent} />);
  expect(await screen.findByRole("button", { name: "Email to myself" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Email sent" })).not.toBeInTheDocument();
});

it("includes a selected photo in the public result only after explicit opt-in and re-preview", async () => {
  setCallableResult("previewCreatorRecipe", { data: { subject: "사진 검토", html: "<p>Private</p>", shareCard: null } });
  renderWithProviders(<RecipePreviewDialog request={{ recipeId: "ride-story", activityId: "ride", photoId: "photo" }} language="ko" ownerId="test-uid" onClose={vi.fn()} onSent={vi.fn()} />);
  await screen.findByTitle("비공개 이메일 최종 결과");
  expect(mockCallableInvocations.filter(call => call.name === "previewCreatorRecipe")[0]?.data).toHaveProperty("includePhoto", false);
  fireEvent.click(screen.getByRole("checkbox", { name: /선택한 사진을 공개 카드와 PNG에도 포함/ }));
  await waitFor(() => expect(mockCallableInvocations).toContainEqual({ name: "previewCreatorRecipe", data: { recipeId: "ride-story", activityId: "ride", photoId: "photo", includePhoto: true, lang: "ko" } }));
});

it.each(["success", "failure"])("ignores a previous request's late %s, including its final loading cleanup", async (outcome) => {
  let resolveFirst!: (value: unknown) => void;
  let rejectFirst!: (reason: Error) => void;
  let resolveSecond!: (value: unknown) => void;
  const first = new Promise((resolve, reject) => { resolveFirst = resolve; rejectFirst = reject; });
  const second = new Promise((resolve) => { resolveSecond = resolve; });
  let sends = 0;
  setCallableImplementation("sendCreatorRecipeEmail", () => sends++ === 0 ? first : second);
  setCallableResult("previewCreatorRecipe", { data: { subject: "Result", html: "<p>Private</p>", shareCard: null } });
  const onSent = vi.fn(); const onClose = vi.fn();
  const { rerender } = renderWithProviders(<RecipePreviewDialog request={{ recipeId: "ride-story", activityId: "first" }} language="ko" ownerId="first-owner" onClose={onClose} onSent={onSent} />);
  fireEvent.click(await screen.findByRole("button", { name: "본인 이메일로 받기" }));
  await waitFor(() => expect(sends).toBe(1));
  rerender(<RecipePreviewDialog request={{ recipeId: "ride-story", activityId: "second" }} language="en" ownerId="second-owner" onClose={onClose} onSent={onSent} />);
  fireEvent.click(await screen.findByRole("button", { name: "Email to myself" }));
  await waitFor(() => expect(sends).toBe(2));
  await act(async () => { if (outcome === "success") resolveFirst({ data: { sent: true } }); else rejectFirst(new Error("Old request failed")); });
  expect(onSent).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Email to myself" })).toBeDisabled();
  await act(async () => resolveSecond({ data: { sent: true } }));
  expect(onSent).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Email sent" })).toBeDisabled();
});

it("explicitly overrides a request's initial photo opt-in when the rider unchecks it", async () => {
  setCallableResult("previewCreatorRecipe", { data: { subject: "사진 검토", html: "<p>Private</p>", shareCard: null } });
  renderWithProviders(<RecipePreviewDialog request={{ recipeId: "ride-story", activityId: "ride", photoId: "photo", includePhoto: true }} language="ko" ownerId="test-uid" onClose={vi.fn()} onSent={vi.fn()} />);
  await screen.findByTitle("비공개 이메일 최종 결과");
  const checkbox = screen.getByRole("checkbox");
  expect(checkbox).toBeChecked();
  fireEvent.click(checkbox);
  await waitFor(() => expect(mockCallableInvocations).toContainEqual({ name: "previewCreatorRecipe", data: { recipeId: "ride-story", activityId: "ride", photoId: "photo", includePhoto: false, lang: "ko" } }));
});

it.each(["ko", "en"])("explains an activity cap without offering a repeated Retry in %s", async language => {
  setCallableImplementation("previewCreatorRecipe", () => { throw Object.assign(new Error("PRIVATE_TOKEN"), { details: { reason: "recipe-activity-limit", limit: 2000, retryable: false, retryAt: null } }); });
  renderWithProviders(<RecipePreviewDialog request={{ recipeId: "weekly-load" }} language={language} ownerId="test-uid" onClose={vi.fn()} onSent={vi.fn()} />);
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(language === "ko" ? "일부 기록만으로 결과를 만들지 않았습니다" : "partial set of records");
  expect(alert).not.toHaveTextContent("PRIVATE_TOKEN");
  expect(screen.queryByRole("button", { name: /^(Retry|다시 시도)$/ })).not.toBeInTheDocument();
});

it("enables retry only after the minute-read limit boundary, then makes a new read", async () => {
  vi.useFakeTimers();
  try {
    const now = Date.now();
    setCallableImplementation("previewCreatorRecipe", () => { throw Object.assign(new Error("PRIVATE"), { details: { reason: "recipe-read-minute-limit", retryAt: now + 60_000 } }); });
    await act(async () => {
      renderWithProviders(<RecipePreviewDialog request={{ recipeId: "weekly-load" }} language="en" ownerId="test-uid" onClose={vi.fn()} onSent={vi.fn()} />);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Please wait");
    const retry = screen.getByRole("button", { name: "Retry" });
    expect(retry).toBeDisabled();
    await act(async () => { vi.advanceTimersByTime(59_999); });
    expect(retry).toBeDisabled();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(retry).toBeEnabled();
    await act(async () => { fireEvent.click(retry); });
    expect(mockCallableInvocations.filter(call => call.name === "previewCreatorRecipe")).toHaveLength(2);
  } finally { cleanup(); vi.useRealTimers(); }
});

it("distinguishes a read limit from email quota when sending an already-previewed report", async () => {
  setCallableResult("previewCreatorRecipe", { data: { subject: "Report", html: "<p>Private</p>", shareCard: null } });
  setCallableImplementation("sendCreatorRecipeEmail", () => { throw Object.assign(new Error("PRIVATE"), { details: { reason: "recipe-read-daily-limit", retryAt: Date.now() + 86_400_000 } }); });
  renderWithProviders(<RecipePreviewDialog request={{ recipeId: "weekly-load" }} language="en" ownerId="test-uid" onClose={vi.fn()} onSent={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Email to myself" }));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("recipe read limit");
  expect(alert).toHaveTextContent("tomorrow");
  expect(alert).not.toHaveTextContent("email limit");
  expect(screen.getByRole("button", { name: "Email to myself" })).toBeDisabled();
});
