import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { vi } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import { EventCapacityField } from "./EventCapacityField";

it("selects unlimited without showing a numeric zero and allows a custom positive limit", () => {
  const changed = vi.fn();
  function Form() {
    const [capacity, setCapacity] = useState(37);
    return <EventCapacityField value={capacity} onChange={value => { setCapacity(value); changed(value); }} />;
  }
  renderWithProviders(<Form />, { route: "/ko/event/create" });
  expect(screen.getByRole("spinbutton")).toHaveValue(37);
  fireEvent.click(screen.getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: "무제한" }));
  expect(changed).toHaveBeenLastCalledWith(0);
  expect(screen.getByRole("combobox")).toHaveTextContent("무제한");
  expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: "인원 지정" }));
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "73" } });
  expect(changed).toHaveBeenLastCalledWith(73);
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "-1" } });
  expect(screen.getByRole("spinbutton")).toHaveValue(73);
});
