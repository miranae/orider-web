import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GearKitSection } from "./GearKitSection";

const mocks = vi.hoisted(() => ({ add: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../hooks/useGear", () => ({ useGear: () => ({ items: [], loading: false, addGear: mocks.add }) }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));

describe("Gear form keyboard and save contract", () => {
  it("names and portals the dialog, closes the menu before dialog, and restores the opener", async () => {
    const user = userEvent.setup();
    const view = render(<GearKitSection uid="test-owner" />);
    const opener = screen.getByRole("button");
    await user.click(opener);
    const panel = screen.getByRole("dialog");
    expect(panel.getAttribute("aria-labelledby")).toBeTruthy();
    expect(view.container.contains(panel)).toBe(false);
    await user.click(screen.getByRole("combobox"));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("dialog")).toBe(panel);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("toggles the default gear draft without saving", async () => {
    const user = userEvent.setup();
    render(<GearKitSection uid="test-owner" />);
    await user.click(screen.getByRole("button"));
    const toggle = screen.getByRole("switch", { name: "기본 장비로 설정" });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
  });

  it("keeps the existing gear payload when saving a trimmed name", async () => {
    const user = userEvent.setup();
    render(<GearKitSection uid="test-owner" />);
    await user.click(screen.getByRole("button"));
    const inputs = screen.getAllByRole("textbox");
    await user.type(inputs[0]!, "  Road bike  ");
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(mocks.add).toHaveBeenCalledWith(expect.objectContaining({ name: "Road bike", type: "bike", isDefault: false })));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
