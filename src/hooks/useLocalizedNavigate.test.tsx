import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useLocalizedPath } from './useLocalizedNavigate';

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
