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
