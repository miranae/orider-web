import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Disclosure } from "./Disclosure";

describe("Disclosure", () => {
  it("keeps supporting evidence available while toggling its visibility", () => {
    render(<Disclosure title="Calculation details" description="Recorded inputs"><p>Measured power: 240 W</p></Disclosure>);
    const summary = screen.getByText("Calculation details").closest("summary")!;
    expect(screen.getByText("Measured power: 240 W")).not.toBeVisible();
    fireEvent.click(summary);
    expect(screen.getByText("Measured power: 240 W")).toBeVisible();
    fireEvent.click(summary);
    expect(screen.getByText("Measured power: 240 W")).not.toBeVisible();
    expect(screen.getByText("Recorded inputs")).toBeVisible();
  });
});
