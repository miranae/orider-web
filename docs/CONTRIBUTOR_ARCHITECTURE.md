# Contributor Architecture Guide

O-Rider is a production frontend with a private Firebase backend. The public repository is open for frontend, UX, documentation, i18n, accessibility, and test contributions, but new code should keep domain logic easy to review.

## Current State

The app already has useful layers:

- `src/services/`: Firebase, analytics, error logging, API clients.
- `src/hooks/`: reusable data loading and derived state.
- `src/features/board/`: the first feature-slice example.
- `src/shared/`: cross-platform types and calculation logic.
- `src/theme/`: design-system primitives and tokens.

The main limitation is that older domains still keep too much logic in large pages and components. Treat the large files below as refactor targets, not examples to copy:

- `src/pages/ActivityPage.tsx`
- `src/pages/FitnessPage.tsx`
- `src/components/training/TodaysWorkoutCard.tsx`
- `src/pages/event/EventDetailPage.tsx`
- `src/pages/event/EventEditPage.tsx`
- `src/pages/CreatePostPage.tsx`

## Preferred Feature Shape

When adding or significantly changing a domain, prefer this shape:

```text
src/features/<domain>/
  components/
  hooks/
  mutations.ts
  queries.ts
  types.ts
  utils.ts
```

Pages should mostly compose feature components and route-level state:

```text
src/pages/<DomainPage>.tsx
  route params
  layout composition
  permission/loading/error states
  feature component wiring
```

Keep these out of page files when possible:

- Firestore writes and callable invocations.
- Complex query assembly.
- Business calculations.
- Chart/data transforms.
- Toast/error mapping reused by more than one component.

## Firestore Writes

New Firestore writes should live in `features/<domain>/mutations.ts` or a service module. This makes it easier to compare frontend write intent with Firestore Rules.

For each new write path, document or test:

- collection/document path
- required owner or role condition
- fields the client is allowed to set
- counter fields that must not be client-mutated
- corresponding Rules coverage, when applicable

## Logging And User Feedback

Use the existing wrappers instead of ad hoc logging:

- `logClientError(source, err, context)` for unexpected operational failures.
- `track(...)` or existing analytics helpers for product events.
- Toast/modal UI for user-facing feedback.

Avoid in new product code:

- `console.*` outside explicit development-only diagnostics.
- `alert()` for errors or normal workflows.
- Silent catches unless the failure is truly non-actionable and documented in a short comment.

Recommended pattern:

```ts
try {
  await saveThing(input);
  showToast({ type: "success", message: t("saved") });
} catch (err) {
  logClientError("feature.saveThing", err, { thingId });
  showToast({ type: "error", message: t("saveFailed") });
}
```

## Lint Warning Budget

The repository currently has legacy lint warnings, mostly design-system and direct-console warnings. CI uses `npm run lint:budget`, which allows the current baseline but fails if a PR increases the warning count.

For contributors:

- Do not add new lint warnings.
- Prefer reducing nearby warnings when touching a file.
- Keep `npm run lint:budget` passing before opening a PR.

When the baseline improves, lower the budget in `package.json`.

## Large File Refactor Strategy

Do not rewrite a large page in one PR. Prefer small extraction PRs:

1. Move pure helpers into `features/<domain>/utils.ts` with tests.
2. Move Firestore/callable writes into `mutations.ts`.
3. Move subscriptions and derived data into feature hooks.
4. Extract repeated UI into feature components.
5. Add a route smoke test or focused component test.

Good first refactor targets:

- `ActivityPage`: stream loading, photo/social mutations, visibility/delete actions.
- `FitnessPage`: projection subscriptions, chart transforms, goal state.
- `EventDetailPage`: registration/event action mutations and chart data.
- `CreatePostPage`: editor serialization and upload pipeline.
