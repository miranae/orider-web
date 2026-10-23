import { useState } from "react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import DateField from "../../../components/redesign/DateField";
import InfoTip from "../../../components/InfoTip";
import { DropdownSelect } from "../../../theme/components";
import CoachDetailSection from "./CoachDetailSection";

function PortalTools() {
  const [date, setDate] = useState("2026-01-31");
  const [period, setPeriod] = useState("recent");
  return <CoachDetailSection id="analysis-tools" title="분석 도구">
    <label htmlFor="portal-test-date">비교 날짜</label>
    <DateField id="portal-test-date" value={date} onChange={setDate} presets={false} portal />
    <output aria-label="선택한 날짜">{date}</output>
    <DropdownSelect label="비교 기간" value={period} onChange={setPeriod} options={[
      { value: "recent", label: "최근 28일" },
      { value: "previous", label: "이전 28일" },
    ]} />
    <InfoTip label="계산 기준 설명" title="계산 기준" content="저장된 기록의 기간별 비교입니다." activation="click">계산 기준</InfoTip>
    <button>마지막 도구</button>
  </CoachDetailSection>;
}

async function openTools() {
  const trigger = screen.getByRole("button", { name: "분석 도구 →" });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = await screen.findByRole("dialog", { name: "분석 도구" });
  const back = within(dialog).getByRole("button", { name: /뒤로/ });
  expect(back).toHaveFocus();
  return { trigger, dialog, back };
}

describe("coach details with owned portal tools", () => {
  it("keeps calendar day focus and arrow navigation inside the owner, then closes the calendar before the detail", async () => {
    const { container } = renderWithProviders(<PortalTools />, { route: "/ko/coach/analysis?sport=bike" });
    const initialInert = container.inert;
    const initialPosition = document.body.style.position;
    const { trigger, dialog, back } = await openTools();
    expect(container.inert).toBe(true);
    expect(document.body.style.position).toBe("fixed");

    const dateTrigger = within(dialog).getByLabelText("비교 날짜");
    fireEvent.click(dateTrigger);
    const calendar = screen.getByRole("dialog", { name: "날짜 선택" });
    expect(dialog).not.toContainElement(calendar);
    expect(dateTrigger).toHaveAttribute("aria-controls", calendar.id);
    const firstDay = within(calendar).getByRole("gridcell", { name: "2026-01-31" });
    expect(firstDay).toHaveFocus();
    fireEvent.keyDown(firstDay, { key: "ArrowRight" });
    const nextDay = within(calendar).getByRole("gridcell", { name: "2026-02-01" });
    expect(nextDay).toHaveFocus();
    expect(within(dialog).getByLabelText("선택한 날짜")).toHaveTextContent("2026-01-31");

    fireEvent.keyDown(nextDay, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "날짜 선택" })).not.toBeInTheDocument();
    expect(dialog).toBeVisible();
    expect(dateTrigger).toHaveFocus();
    expect(container.inert).toBe(true);
    fireEvent.keyDown(dateTrigger, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "분석 도구" })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(container.inert).toBe(initialInert);
    expect(document.body.style.position).toBe(initialPosition);
    expect(back).not.toBeVisible();
  });

  it("keeps keyboard Tab within the detail or its owned calendar with roving date cells", async () => {
    renderWithProviders(<PortalTools />);
    const { dialog, back } = await openTools();
    fireEvent.click(within(dialog).getByLabelText("비교 날짜"));
    const calendar = screen.getByRole("dialog", { name: "날짜 선택" });
    expect(screen.getByRole("gridcell", { name: "2026-01-31" })).toHaveFocus();
    await userEvent.tab();
    expect(dialog.contains(document.activeElement) || calendar.contains(document.activeElement)).toBe(true);
    expect(screen.queryByRole("dialog", { name: "날짜 선택" })).not.toBeInTheDocument();
    back.focus();
    await userEvent.tab({ shift: true });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect((document.activeElement as HTMLElement).tabIndex).toBeGreaterThanOrEqual(0);
    expect(document.activeElement).not.toHaveAttribute("tabindex", "-1");
  });

  it("commits calendar and listbox selections and retains them after closing and reopening the detail", async () => {
    renderWithProviders(<PortalTools />, { route: "/ko/coach/analysis?sport=run&range=90" });
    const { dialog, back } = await openTools();
    fireEvent.click(within(dialog).getByLabelText("비교 날짜"));
    const selectedDay = screen.getByRole("gridcell", { name: "2026-01-31" });
    fireEvent.keyDown(selectedDay, { key: "ArrowRight" });
    expect(screen.getByRole("gridcell", { name: "2026-02-01" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(within(dialog).getByLabelText("선택한 날짜")).toHaveTextContent("2026-02-01");
    expect(screen.queryByRole("dialog", { name: "날짜 선택" })).not.toBeInTheDocument();

    const period = within(dialog).getByRole("combobox", { name: "비교 기간" });
    period.focus();
    fireEvent.keyDown(period, { key: "ArrowDown" });
    const list = screen.getByRole("listbox", { name: "비교 기간" });
    expect(dialog).not.toContainElement(list);
    expect(period).toHaveAttribute("aria-controls", list.id);
    expect(period).toHaveFocus();
    fireEvent.keyDown(period, { key: "End" });
    fireEvent.keyDown(period, { key: "Enter" });
    expect(period).toHaveTextContent("이전 28일");
    expect(period).toHaveFocus();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.click(back);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "분석 도구" })).not.toBeInTheDocument());
    const reopened = await openTools();
    expect(within(reopened.dialog).getByLabelText("선택한 날짜")).toHaveTextContent("2026-02-01");
    expect(within(reopened.dialog).getByRole("combobox", { name: "비교 기간" })).toHaveTextContent("이전 28일");
  });

  it("lets Escape dismiss the listbox and tooltip separately before closing their detail owner", async () => {
    renderWithProviders(<PortalTools />);
    const { dialog } = await openTools();
    const period = within(dialog).getByRole("combobox", { name: "비교 기간" });
    period.focus();
    fireEvent.keyDown(period, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeVisible();
    fireEvent.keyDown(period, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(dialog).toBeVisible();
    expect(period).toHaveFocus();
    expect(period).toHaveTextContent("최근 28일");

    const explanation = within(dialog).getByRole("button", { name: "계산 기준 설명" });
    explanation.focus();
    fireEvent.click(explanation);
    const tooltip = screen.getByRole("tooltip");
    expect(dialog).not.toContainElement(tooltip);
    expect(explanation).toHaveAttribute("aria-describedby", tooltip.id);
    const closeHelp = screen.getByRole("button", { name: "닫기" });
    closeHelp.focus();
    expect(closeHelp).toHaveFocus();
    fireEvent.keyDown(closeHelp, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(dialog).toBeVisible();
    expect(explanation).toHaveFocus();
    fireEvent.keyDown(explanation, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "분석 도구" })).not.toBeInTheDocument());
  });
});
