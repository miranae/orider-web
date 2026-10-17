import type { KeyboardEvent } from "react";

/** Club tab/radio groups activate the arrow-key target and keep one tab stop. */
export function handleGroupChoiceKey(event: KeyboardEvent<HTMLElement>, role: "tab" | "radio") {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
  const controls = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(`button[role="${role}"]:not(:disabled)`));
  const active = (event.target as HTMLElement).closest<HTMLButtonElement>(`button[role="${role}"]`);
  const index = active ? controls.indexOf(active) : -1;
  if (index < 0 || !controls.length) return;
  event.preventDefault();
  const target = event.key === "Home" ? 0 : event.key === "End" ? controls.length - 1
    : (index + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) + controls.length) % controls.length;
  controls[target]!.focus();
  controls[target]!.click();
}
