import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
test("mobile: keyboard-sized viewport keeps the focused meeting field uncovered", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "Mobile keyboard layout");
  await page.goto("/e2e/fixtures/club-meeting-entry.html?lang=ko&role=leader");
  await page.getByRole("link", { name: /주말 라이더/ }).click();
  await page.getByRole("link", { name: "모임 만들기", exact: true }).click();
  const field = page.getByRole("textbox", { name: "기본 집결 장소", exact: true });
  await field.focus();
  // Android resize 방식으로 키보드가 차지한 높이를 제외한다.
  await page.setViewportSize({ width: 390, height: 300 });
  await field.fill("반포 한강공원");
  await field.evaluate(node => node.scrollIntoView({ block: "end" }));
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("반포 한강공원");
  await expect.poll(() => field.evaluate(node => {
    const rect = node.getBoundingClientRect();
    return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === node;
  })).toBe(true);
  await page.screenshot({ path: info.outputPath("keyboard-input.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  const preview = page.getByRole("button", { name: "모집글 미리보기", exact: true });
  await preview.focus();
  await expect(preview).toBeInViewport();
});

for (const lang of ["ko", "en"]) {
  test(`${lang}: one coherent club-to-meeting flow`, async ({ page }, info) => {
    await page.goto(`/e2e/fixtures/club-meeting-entry.html?lang=${lang}&long=1&role=leader`);
    const clubName = lang === "ko" ? "주말마다 한강을 함께 달리는 라이더와 친구들의 클럽" : "Weekend Riverside Riders and Friends Cycling Club";
    await expect(page.getByRole("link", { name: lang === "ko" ? "모임 만들기" : "Create a meeting", exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: new RegExp(clubName) }).click();
    await expect(page.getByTestId("flow-location")).toHaveText(`/${lang}/club/fixture`);
    const create = page.getByRole("link", { name: lang === "ko" ? "모임 만들기" : "Create a meeting", exact: true });
    await expect(create).toHaveCount(1);
    await expect(create).toBeInViewport();
    await expect(page.getByRole("link", { name: lang === "ko" ? "모임" : "Meetings", exact: true })).toHaveAttribute("aria-current", "page");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const dir = "docs/reviews/2026-11-14-club-meeting-entry";
    await mkdir(dir, { recursive: true });
    await page.screenshot({ path: `${dir}/${info.project.name}-${lang}-meetings.png`, fullPage: true, animations: "disabled" });
    await create.click();
    await expect(page.getByTestId("flow-location")).toHaveText(`/${lang}/club/fixture/meetings/new`);
    await expect(page.locator(".cp-form-panel form")).toBeVisible();
    await expect(page.getByRole("link", { name: lang === "ko" ? "모임 만들기" : "Create a meeting", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: lang === "ko" ? "닫기" : "Close", exact: true }).click();
    await expect(page.getByTestId("flow-location")).toHaveText(`/${lang}/club/fixture`);
    await expect(create).toBeVisible();
  });
}

test("ko: 실내·실외를 먼저 고르고 그에 맞는 코스만 고른다 (#1779)", async ({ page }, info) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/e2e/fixtures/club-meeting-entry.html?lang=ko&role=leader");
  await page.getByRole("link", { name: /주말 라이더/ }).click();
  await page.getByRole("link", { name: "모임 만들기", exact: true }).click();
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true, animations: "disabled" });
  const tabs = page.getByRole("tab");
  // 고르기 전에는 코스 준비 방법을 열지 않는다.
  await expect(tabs).toHaveCount(0);
  await expect(page.getByText("실내·실외를 먼저 골라주세요.", { exact: false })).toBeVisible();
  await shot("01-venue-first");

  await page.getByRole("radio", { name: /실내/ }).check();
  await expect(tabs).toHaveText(["앱 실내 코스"]);
  await expect(page.getByRole("textbox", { name: "기본 집결 장소", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("출발 시각", { exact: true })).toBeVisible();
  await page.getByRole("listitem").filter({ hasText: "한강 자전거길" }).getByRole("button", { name: "이 코스 가져오기" }).click();
  await expect(page.locator(".cp-imported-summary")).toContainText("한강 자전거길");
  // 빈 모임 이름은 코스 이름으로 채운다.
  await expect(page.getByRole("textbox", { name: "모임 이름", exact: true })).toHaveValue("한강 자전거길");
  await shot("02-indoor-course");

  // 실외로 바꾸면 내장 코스는 쓸 수 없다 — 확인을 받고 비운다.
  await page.getByRole("radio", { name: /실외/ }).click();
  const confirm = page.getByRole("region", { name: "실내·실외 변경 확인" });
  await expect(confirm).toContainText("한강 자전거길");
  await shot("03-venue-switch-confirm");
  await confirm.getByRole("button", { name: "실외로 바꾸고 코스 비우기" }).click();
  await expect(tabs).toHaveText(["기존 코스 가져오기", "GPX로 준비하기", "세그먼트로 준비하기"]);
  await expect(page.locator(".cp-imported-summary")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "기본 집결 장소", exact: true })).toBeVisible();
  await shot("04-outdoor");

  // 다시 실내로 — 코스가 없으니 묻지 않는다. 코스 없이 미리보기를 누르면 넘어가지 않고 이유를 알린다.
  await page.getByRole("radio", { name: /실내/ }).check();
  // 코스 이름으로 채워 둔 모임 이름은 코스와 함께 비워졌다. 주최자가 적은 이름은 코스를 골라도 그대로다.
  const title = page.getByRole("textbox", { name: "모임 이름", exact: true });
  await expect(title).toHaveValue("");
  await title.fill("토요 실내 번개");
  await page.getByLabel("날짜", { exact: true }).fill("2030-10-25");
  await page.getByRole("button", { name: "모집글 미리보기", exact: true }).click();
  await expect(page.getByRole("alert").first()).toContainText("실내 모임은 코스 경로가 필요해요");
  await expect(page.getByRole("button", { name: "모집 시작", exact: true })).toHaveCount(0);
  await page.getByRole("listitem").filter({ hasText: "남산 순환로" }).getByRole("button", { name: "이 코스 가져오기" }).click();
  await expect(page.locator(".cp-imported-summary")).toContainText("남산 순환로");
  await expect(title).toHaveValue("토요 실내 번개");
  await page.getByRole("button", { name: "모집글 미리보기", exact: true }).click();
  const start = page.getByRole("button", { name: "모집 시작", exact: true });
  await expect(start).toBeDisabled();
  await expect(page.getByText("2030-10-25 (금) 08:00에 개최하는 모임이 맞습니다.")).toBeVisible();
  // 코스가 확정으로 게시된다 — 「최종 코스 준비 중」 칩이 없다.
  await expect(page.getByText("최종 코스 준비 중")).toHaveCount(0);
  await expect(page.locator(".cp-review-summary")).not.toContainText("안내 없음");
  await expect(page.locator(".cp-review-summary")).not.toContainText("집결 장소");
  await page.getByRole("checkbox").check();
  await expect(start).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await shot("05-preview");
  expect(pageErrors).toEqual([]);
});

test("ko: 실외 GPX의 실제 출발 장소를 집결 장소와 미리보기에 반영한다 (#1779)", async ({ page }) => {
  await page.goto("/e2e/fixtures/club-meeting-entry.html?lang=ko&role=leader");
  await page.getByRole("link", { name: /주말 라이더/ }).click();
  await page.getByRole("link", { name: "모임 만들기", exact: true }).click();
  await page.getByRole("radio", { name: /실외/ }).check();
  await page.getByRole("tab", {name: "GPX로 준비하기"}).click();
  const track = Array.from({ length: 60 }, (_, i) => `<trkpt lat="${37.5 + i * .00018}" lon="127"/>`).join("");
  await page.locator('input[type="file"]').setInputFiles({
    name: "start-point.gpx", mimeType: "application/gpx+xml",
    buffer: Buffer.from(`<gpx><wpt lat="37.5" lon="127.0001"><name>근처 카페</name></wpt><wpt lat="37.5" lon="127"><name>강변공원 북문</name></wpt><trk><name>강변 코스</name><trkseg>${track}</trkseg></trk></gpx>`),
  });
  await expect(page.getByRole("textbox", { name: "기본 집결 장소" })).toHaveValue("강변공원 북문");
  await page.getByLabel("날짜", { exact: true }).fill("2030-10-25");
  await page.getByRole("button", { name: "모집글 미리보기", exact: true }).click();
  await expect(page.locator(".cp-review-summary")).toContainText("강변공원 북문");
});
