import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { useLocalizedPath, useLocalizedNavigate } from './useLocalizedNavigate';

function Probe({ to }: { to: string }) {
  const path = useLocalizedPath(to);
  return <div>{path}</div>;
}

describe('useLocalizedPath', () => {
  it('prefixes lang from URL', () => {
    render(
      <MemoryRouter initialEntries={['/en/x']}>
        <Routes>
          <Route path="/:lang/x" element={<Probe to="/dashboard" />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('/en/dashboard')).toBeInTheDocument();
  });

  it('keeps already-prefixed paths unchanged', () => {
    render(
      <MemoryRouter initialEntries={['/en/x']}>
        <Routes>
          <Route path="/:lang/x" element={<Probe to="/ko/dashboard" />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('/ko/dashboard')).toBeInTheDocument();
  });

  it('passes external URLs through', () => {
    render(
      <MemoryRouter initialEntries={['/en/x']}>
        <Routes>
          <Route path="/:lang/x" element={<Probe to="https://example.com/foo" />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('https://example.com/foo')).toBeInTheDocument();
  });
});

function NavigateFlow({ to }: { to: string }) {
  const navigate = useLocalizedNavigate();
  const location = useLocation();
  return <><button onClick={() => navigate(to)}>Continue</button><output data-testid="flow-path">{location.pathname}</output><output data-testid="flow-state">{JSON.stringify(location.state)}</output></>;
}
describe("localized nested detail navigation", () => {
  it.each(["/event/e1/register", "/event/e1/results", "/event/e1/host/edit", "/activity/a1/edit"])("preserves entry context when navigating to %s", target => {
    render(<MemoryRouter initialEntries={[{ pathname: "/en/event/e1/results", state: { fromHub: "club" } }]}><Routes><Route path="/:lang/*" element={<NavigateFlow to={target} />} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByText("Continue"));
    expect(screen.getByTestId("flow-path")).toHaveTextContent(`/en${target}`);
    expect(JSON.parse(screen.getByTestId("flow-state").textContent!)).toEqual({ fromHub: "club" });
  });
  it("does not inject detail state into creation", () => {
    render(<MemoryRouter initialEntries={[{ pathname: "/en/event/e1/results", state: { fromHub: "club" } }]}><Routes><Route path="/:lang/*" element={<NavigateFlow to="/event/create" />} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByText("Continue"));
    expect(screen.getByTestId("flow-state")).toHaveTextContent("null");
  });
});


it("keeps callback identity while using the latest language and entry hub", () => {
  const callbacks: ReturnType<typeof useLocalizedNavigate>[] = [];
  function StableProbe() {
    const localized = useLocalizedNavigate();
    const native = useNavigate();
    const location = useLocation();
    callbacks.push(localized);
    return <>
      <button onClick={() => native("/ko/clubs")}>Change origin</button>
      <button onClick={() => callbacks[0]!("/activity/a2")}>Use original callback</button>
      <output data-testid="stable-path">{location.pathname}</output>
      <output data-testid="stable-state">{JSON.stringify(location.state)}</output>
    </>;
  }
  render(<MemoryRouter initialEntries={["/en/"]}><Routes><Route path="/:lang/*" element={<StableProbe />} /></Routes></MemoryRouter>);
  fireEvent.click(screen.getByText("Change origin"));
  expect(new Set(callbacks).size).toBe(1);
  fireEvent.click(screen.getByText("Use original callback"));
  expect(screen.getByTestId("stable-path")).toHaveTextContent("/ko/activity/a2");
  expect(JSON.parse(screen.getByTestId("stable-state").textContent!)).toEqual({ fromHub: "club" });
  expect(new Set(callbacks).size).toBe(1);
});
