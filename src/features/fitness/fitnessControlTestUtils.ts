import { fireEvent, screen } from "@testing-library/react";

export function chooseDropdown(control: HTMLElement, label: string) {
  fireEvent.click(control);
  const option = Array.from(document.querySelectorAll<HTMLElement>('[role="listbox"] [role="option"]')).find(item => item.textContent === label);
  if (!option) throw new Error(`Missing dropdown option: ${label}`);
  fireEvent.click(option);
}

export function chooseDate(control: HTMLElement, iso: string) {
  fireEvent.click(control);
  const popup = screen.getByRole("dialog");
  for (let attempts = 0; attempts < 120; attempts += 1) {
    const middle = popup.querySelectorAll("[data-calendar-date]")[15]!.getAttribute("aria-label")!;
    if (middle.slice(0, 7) === iso.slice(0, 7)) break;
    const navigation = popup.querySelectorAll<HTMLButtonElement>("button[aria-label]");
    fireEvent.click(navigation[middle < iso ? 1 : 0]!);
  }
  const day = popup.querySelector<HTMLButtonElement>(`[data-calendar-date="${iso}"]`);
  if (!day) throw new Error(`Missing calendar date: ${iso}`);
  fireEvent.click(day);
}

export function chooseDropdownAt(control: HTMLElement, index: number) {
  fireEvent.click(control);
  const option = document.querySelectorAll<HTMLElement>('[role="listbox"] [role="option"]')[index];
  if (!option) throw new Error(`Missing dropdown option index: ${index}`);
  fireEvent.click(option);
}

export function dropdownSelectedIndex(control: HTMLElement) {
  const previousFocus = document.activeElement;
  fireEvent.click(control);
  const index = Array.from(document.querySelectorAll('[role="listbox"] [role="option"]')).findIndex(option => option.getAttribute("aria-selected") === "true");
  fireEvent.keyDown(control, { key: "Escape" });
  if (previousFocus instanceof HTMLElement || previousFocus instanceof SVGElement) previousFocus.focus();
  return index;
}
