import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}

describe('feedback route redirects', () => {
  it('normalizes /feedback links to the inquiry board', () => {
    render(
      <MemoryRouter initialEntries={['/ko/feedback']}>
        <Routes>
          <Route path="/:lang" element={<Outlet />}>
            <Route path="feedback" element={<Navigate to="../board?type=inquiry" replace />} />
            <Route path="board" element={<LocationProbe />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('location')).toHaveTextContent('/ko/board?type=inquiry');
  });

  it('normalizes legacy /feedback/board links to the inquiry board', () => {
    render(
      <MemoryRouter initialEntries={['/ko/feedback/board?type=inquiry']}>
        <Routes>
          <Route path="/:lang" element={<Outlet />}>
            <Route path="feedback/board" element={<Navigate to="../board?type=inquiry" replace />} />
            <Route path="board" element={<LocationProbe />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('location')).toHaveTextContent('/ko/board?type=inquiry');
  });
});

function LayoutProbe() {
  return (
    <div>
      <nav>app shell</nav>
      <Outlet />
    </div>
  );
}

describe('localized not found routes', () => {
  it('keeps the app shell for unknown paths under a language prefix', () => {
    render(
      <MemoryRouter initialEntries={['/ko/activityy']}>
        <Routes>
          <Route path="/:lang" element={<Outlet />}>
            <Route element={<LayoutProbe />}>
              <Route path="activity/:activityId" element={<div>activity detail</div>} />
              <Route path="*" element={<div>not found</div>} />
            </Route>
          </Route>
          <Route path="*" element={<div>locale redirect</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('app shell')).toBeInTheDocument();
    expect(screen.getByText('not found')).toBeInTheDocument();
    expect(screen.queryByText('locale redirect')).not.toBeInTheDocument();
  });
});
