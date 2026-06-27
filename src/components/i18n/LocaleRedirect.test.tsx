import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LocaleRedirect } from './LocaleRedirect';

describe('LocaleRedirect', () => {
  it('prefixes /dashboard with detected lang (default ko)', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<LocaleRedirect />} />
          <Route path="/:lang/dashboard" element={<div data-testid="ok">OK</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId('ok')).toBeInTheDocument();
  });
});
