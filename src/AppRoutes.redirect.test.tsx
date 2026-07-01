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
