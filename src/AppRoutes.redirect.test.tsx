import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
            <Route path="feedback" element={<Navigate to="../community/board?type=inquiry" replace />} />
            <Route path="community/board" element={<LocationProbe />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('location')).toHaveTextContent('/ko/community/board?type=inquiry');
  });

  it('normalizes legacy /feedback/board links to the inquiry board', () => {
    render(
      <MemoryRouter initialEntries={['/ko/feedback/board?type=inquiry']}>
        <Routes>
          <Route path="/:lang" element={<Outlet />}>
            <Route path="feedback/board" element={<Navigate to="../community/board?type=inquiry" replace />} />
            <Route path="community/board" element={<LocationProbe />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('location')).toHaveTextContent('/ko/community/board?type=inquiry');
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

describe('legacy route declarations (App.tsx)', () => {
  const app = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');
  const indexOf = (needle: string) => {
    const i = app.indexOf(needle);
    expect(i, needle).toBeGreaterThan(-1);
    return i;
  };

  it.each([
    ['fitness', '/coach/condition'],
    ['coach', '/coach/chat'],
    ['coach/:threadId', '/coach/chat/:threadId'],
    ['plan', '/coach/plan'],
    ['my', '/athlete/me'],
    ['log', '/athlete/me/activities'],
    ['year-recap', '/athlete/me/records'],
    ['friends', '/athlete/me/friends'],
    ['social', '/athlete/me/friends'],
    ['groups', '/clubs'],
    ['group/:groupId', '/club/:groupId'],
    ['group/:groupId/ride/:rideId', '/club/:groupId/rides/:rideId'],
    ['courses', '/explore/courses'],
    ['explore', '/explore/segments'],
    ['discover', '/explore/challenges'],
    ['leaderboard', '/explore/segments/leaderboard'],
    ['events', '/explore/events'],
    ['events/organize', '/explore/events/organize'],
    ['event/:eventId/dashboard', '/event/:eventId/host'],
    ['event/:eventId/edit', '/event/:eventId/host/edit'],
    ['event/:eventId/participants', '/event/:eventId/host/participants'],
    ['board', '/community/board'],
    ['board/write', '/community/board/write'],
    ['board/:postId', '/community/board/:postId'],
    ['creator', '/explore/recipes'],
    ['community/recipes', '/explore/recipes'],
    ['creator/:section', '/explore/recipes/:section'],
    ['community/recipes/:section', '/explore/recipes/:section'],
    ['community', '/policies/community'],
  ])('redirects %s → %s', (from, to) => {
    indexOf(`<Route path="${from}" element={<LegacyRedirect to="${to}" />} />`);
  });

  it('keeps preserved contract routes on their current paths', () => {
    for (const path of ['group/join/:code', 'friend/:code', 'strava/callback', 'live/:eventId', 'embed/fitness', 'embed/plan', 'goal-setup', 'event/create']) {
      indexOf(`path="${path}"`);
    }
  });

  it('declares static routes before their parameter siblings', () => {
    expect(indexOf('path="coach/condition"')).toBeLessThan(indexOf('path="coach/:threadId"'));
    expect(indexOf('path="coach/chat"')).toBeLessThan(indexOf('path="coach/:threadId"'));
    expect(indexOf('path="club/join"')).toBeLessThan(indexOf('path="club/:groupId"'));
    expect(indexOf('path="community/board/write"')).toBeLessThan(indexOf('path="community/board/:postId"'));
    expect(indexOf('path="athlete/me"')).toBeLessThan(indexOf('path="athlete/:userId"'));
  });
});
