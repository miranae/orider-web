import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { FirebaseServicesProvider, type FirebaseServices } from "../contexts/FirebaseServicesContext";
import { useSignInResolve } from "./useSignInResolve";

const signIn = vi.fn(async () => {});
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ signIn }) }));

describe("useSignInResolve", () => {
  it("웹에서는 로그인 안내 문구를 누르면 로그인 창을 연다", () => {
    const { result } = renderHook(() => useSignInResolve());
    result.current?.onClick?.();
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("앱 임베드에서는 열 로그인이 없으니 문구를 누를 수 없게 둔다", () => {
    const services = { scope: "embedded" } as unknown as FirebaseServices;
    const wrapper = ({ children }: { children: ReactNode }) => <FirebaseServicesProvider services={services}>{children}</FirebaseServicesProvider>;
    const { result } = renderHook(() => useSignInResolve(), { wrapper });
    expect(result.current).toBeUndefined();
  });
});
