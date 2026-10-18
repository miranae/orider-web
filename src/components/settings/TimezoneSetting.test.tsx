import settingsKo from "../../i18n/resources/ko/settings.json";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const locale = vi.hoisted(() => ({ timezone: null as string | null, setTimezone: vi.fn() }));
vi.mock("../../contexts/LocaleContext", () => ({ useLocale: () => locale }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
import { TimezoneSetting } from "./TimezoneSetting";

describe("TimezoneSetting", () => {
  beforeEach(() => {
    locale.timezone = null;
    locale.setTimezone.mockReset().mockResolvedValue(true);
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
      () => ({ resolvedOptions: () => ({ timeZone: "Europe/Paris" }) }) as unknown as Intl.DateTimeFormat,
    );
  });

  it("shows the unset state with the server default and saves nothing automatically", () => {
    render(<TimezoneSetting />);
    expect(screen.getByText(settingsKo.pane.app.timezoneUnset)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: settingsKo.pane.app.timezoneReset })).not.toBeInTheDocument();
    expect(locale.setTimezone).not.toHaveBeenCalled();
  });

  it("saves the device time zone only after the suggestion button is clicked", async () => {
    render(<TimezoneSetting />);
    fireEvent.click(screen.getByRole("button", { name: "기기 시간대 Europe/Paris 사용" }));
    await waitFor(() => expect(locale.setTimezone).toHaveBeenCalledExactlyOnceWith("Europe/Paris"));
  });

  it("saves a time zone picked from the list", async () => {
    render(<TimezoneSetting />);
    fireEvent.change(screen.getByLabelText(settingsKo.pane.app.timezoneSelectLabel), { target: { value: "Asia/Seoul" } });
    await waitFor(() => expect(locale.setTimezone).toHaveBeenCalledExactlyOnceWith("Asia/Seoul"));
  });

  it("saves null when resetting to the default", async () => {
    locale.timezone = "Europe/Paris";
    render(<TimezoneSetting />);
    expect(screen.getByText("현재 설정: Europe/Paris")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: settingsKo.pane.app.timezoneReset }));
    await waitFor(() => expect(locale.setTimezone).toHaveBeenCalledExactlyOnceWith(null));
  });
});
