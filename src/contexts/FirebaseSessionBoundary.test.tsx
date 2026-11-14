import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import type { FirebaseServices } from "./FirebaseServicesContext";
import { FirebaseServicesProvider } from "./FirebaseServicesContext";
import FirebaseSessionBoundary from "./FirebaseSessionBoundary";
const session = vi.hoisted(() => ({ uid: "viewer" }));
vi.mock("./AuthContext", () => ({ useAuth: () => ({ user: { uid: session.uid } }) }));
const cleanup = vi.fn();
function Probe() {
  const [count, setCount] = useState(0);
  useEffect(() => cleanup, []);
  return <button onClick={() => setCount(value => value + 1)}>{count}</button>;
}
it("preserves ordinary rerenders but resets state and effects for replacement apps and same-uid sessions", () => {
  const services = { auth: { currentUser: { uid: "viewer" } }, firestore: {}, functions: {} } as unknown as FirebaseServices;
  const tree = (value: FirebaseServices) => <FirebaseServicesProvider services={value}><FirebaseSessionBoundary><Probe /></FirebaseSessionBoundary></FirebaseServicesProvider>;
  const view = render(tree(services));
  fireEvent.click(screen.getByRole("button"));
  view.rerender(tree({ ...services }));
  expect(screen.getByRole("button")).toHaveTextContent("1");
  const next = { ...services, firestore: {} } as FirebaseServices;
  view.rerender(tree(next));
  expect(screen.getByRole("button")).toHaveTextContent("0");
  expect(cleanup).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button"));
  next.auth.currentUser = { uid: "viewer" } as FirebaseServices["auth"]["currentUser"];
  view.rerender(tree(next));
  expect(screen.getByRole("button")).toHaveTextContent("0");
  expect(cleanup).toHaveBeenCalledTimes(2);
});
