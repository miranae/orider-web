# Page transition audit — 2026-11-18

## Scope and evidence

This continues PR #1713 beyond activity detail. The source inventory is all **142 explicit `path` declarations** plus the index route in `src/App.tsx`. It includes aliases, wildcards and 16 embedded entry declarations; it does not mean 142 independently tested browser screens. Embedded detail subroutes reuse the same feature pages.

The audit checked route loading boundaries, request dependencies, optional enrichment, retained-page behavior, recovery and account/permission invalidation. Implementation and independent review are separate passes. A static dependency closure includes shared JavaScript; its byte total is not incremental transferred data or measured time saved.

Native Chrome observation reached signed-in home and Coach condition on production. The browser connector host was unavailable and the native target did not remain stable across subsequent calls. No complete production timing trace or cold-cache visual acceptance is claimed. Changes remain unmerged and undeployed.

## Reading order and loading behavior

| Information / action | User purpose | Previous dependency | Intended presentation |
|---|---|---|---|
| Navigation and page context | Know where I am; move elsewhere | Ordinary lazy routes suspended the whole application | Keep navigation and retained hubs; skeleton only in destination content |
| Activity overview | Read the selected activity | Heavy page download, access check, then owner raw read | Parallel module/access loading; display-only authorized summary before full owner controls |
| Settings sections | Change one setting | Every pane imported before any section | Keep header/sidebar, load active pane locally |
| Coach condition and analysis | Read current fitness | Child code delayed shared model commit | Commit the shared model while child code loads |
| Public event list/detail/results/edit/participants | Read already authorized core records | Course preview, nickname and participation/profile enrichment | Render core records first; patch optional values within the same current session |
| Course overview and elevation | Read title/stats, then examine terrain | Track download and integrity verification before first metadata | Publish authorized metadata; local track state, no stale geometry; export waits for complete data |
| Club meetings/events | Read available upcoming cards | Both sources and RSVP fan-out had to finish | Render available rows and retain pending status; unknown RSVP stays unknown |
| Selected-year records | Read a known year | Calendar discovery before year read | Start explicit-year request independently; local calendar error/retry |
| Profile-dependent entry | Recover when profile is unavailable | Migration could remain in an indefinite spinner | Distinguish loading, signed out and recoverable missing profile |

## Coverage inventory

| Route family | Source path checked | Audit result |
|---|---|---|
| Home `/` | `Layout`, `DashboardPage`, `RetainedHubPages` | Existing dashboard shell and independent feed/KPI/today sections retained. Common route boundary improved. |
| Activity detail/edit | `ActivityDetailRoute`, `ActivityPage`, `ActivityEditPage` | Authorized progressive overview; edit keeps required core/ownership gate. |
| Coach condition/analysis | `CoachFitnessLayout`, `FitnessPage`, `useFitnessModel` | Shared model and existing retained analysis remain; local child-code boundary added. |
| Coach plan/goals/climb setup | `usePlanModel`, `PlanPage`, `GoalHub`, `GoalSetupPage`, `ClimbGoalSetupPage` | An uncached confirmed goal renders before its plan; cached goal/week pairs stay atomic. Plan-dependent actions remain gated; course-picker loads locally. |
| Coach chat/thread | `CoachHistoryPage` | List, selected thread and quota have separate states; old-account identity guard retained. |
| Settings and own gear | `SettingsPage`, settings panes | Active-pane code is deferred; category/header/sidebar stays visible; auth restoration does not imply signed out. |
| Own profile, activities, records, friends | `AthleteMePage`, `TrainingLogPage`, `YearRecapPage`, `FriendsPage` | Own-profile blank wait improved. Month/friends sections already local; explicit-year/calendar waterfall removed. |
| Public athlete/discovery | `AthletePage`, `ExploreAthletesPage` | Profile visibility/relationship gate retained; activities, annual chart and media already independent. |
| Explore courses/segments | `CoursesPage`, `ExplorePage` | Existing shared overview promise/remount handling and local result-state controls retained; no new global cache introduced. |
| Course detail/create/edit | `CoursePage`, `courseDetailAsset`, `CreateCoursePage`, `CourseEditPage` | Metadata/track hydration separated and read errors made recoverable; actual editable-source gate retained. |
| Segment detail/create | `SegmentPage`, `CreateSegmentPage` | Metadata/auth gates are required; histories/photos/picker already independent. Heavy map-code splitting remains a candidate. |
| Event discovery/organizer/create | `EventsPage`, `EventOrganizerPage`, `EventCreatePage` | Optional list enrichment separated; static organizer and group choice-local form loading retained. |
| Event detail/results/host edit/participants | `EventDetailPage`, `EventResultsPage`, `EventEditPage`, `EventParticipantsPage` | Nickname/course/profile fan-out no longer gates ready authorized core records. |
| Event register/host/live | `EventRegisterPage`, `EventDashboardPage`, `EventLivePage` | Existing registration hydration includes real/emergency contact fields; private-role and live-snapshot gates remain intentional. Optional live course stats do not block snapshot start. |
| Clubs/home/news/rides/week | `GroupsPage`, `ClubHomePage`, `GroupDashboardPage`, `GroupRidesPage`, `GroupRidePage`, `GroupWeekPage` | Required member gates retained; independent dashboard sections and pagination already retain ready content. Combined meeting/event rows improved. |
| Club meetings/detail/new/edit/live | `ClubMeetingPage`, `ClubMeetingLivePage`, `GroupEventsPage`, `UnifiedClubEventList` | Combined-list waiting fixed; live snapshot/error state already local. Authoring/map code assessed for deferred panels. |
| Club events/members/settings/invite | `PublicGroupEventsEntry`, `GroupMembersPage`, `GroupSettingsPage`, `GroupInvitePage` | Canonical redirect, management/role and actual join progress retained. Members and pending requests have local loading. |
| Board/post/write | `BoardPage`, `PostDetailPage`, `CreatePostPage` | Block-list gate is intentional; comments/linked activity do not block authorized post. Editor waits for auth. |
| Recipes/challenges | `CreatorHubPage`, `ChallengesPage` | Static recipes and challenge heading do not wait for optional stats or diary actions. Group challenges load locally. |
| Tools/lab | `VirtualPowerToolPage`, `LabPage` | Calculator content is local; course picker/hydration independent. |
| Migration/onboarding/OAuth/friend invite | `MigrationPage`, `OnboardingPage`, `StravaCallbackPage`, `SocialAuthCallbackPage`, `FriendInvitePage` | Migration profile recovery fixed; actual identity, callback, onboarding and acceptance requirements remain. |
| Terms/privacy/policies/partnership/about/deletion/not found | Static page modules, `AccountDeletionPage`, `AboutPage`, `NotFoundPage` | No backend enrichment waterfall found. About intentionally navigates to static localized document. Deletion explanation precedes gated destructive action. |
| Embedded entries and their detail subroutes | `EmbeddedBootstrapRoot`, `HubSurfaceFrame`, detail surfaces | Existing local surface Suspense and injected Firebase/host handshake kept; reused page fixes apply. Native handoff/session policy not changed. |
| Legacy aliases/catchall/language redirects | `App`, `LocaleRoot`, `LocaleRedirect`, `LegacyRedirect` | Checked destinations/search/hash preservation; aliases do not introduce separate data loaders. |

## Remaining distinctions

- Initial auth loading currently includes profile initialization and App Check retries. Its meaning is relied upon by callers; this audit does not split that security-sensitive lifecycle as a cosmetic loading change.
- Club home and its child subscribe to membership separately. Source duplication is established; duplicate network reads or meaningful added latency are not established because Firestore can share listeners/cache. Current permission revalidation is retained.
- GroupRidePage, ClubMeetingPage and some segment/course-authoring surfaces still statically reference map/chart code. Their authoring callbacks, tooltips and navigation need a separate interaction-focused split; no unverified split is included. A large closure is a candidate, not proof of a particular production transition time.
- Private profiles, blocked authors, hidden/deleted courses, host management, existing registration fields and write actions must not be exposed or activated from a provisional display.

## Verification

- Final production build, TypeScript, repository lint budget, quality budget, locale-key coverage and contract suites: passed.
- Focused shell/plan tests: 10 files / 123 passed. Course/year/club: 7 files / 91 passed. Event/activity: 11 files / 172 passed. Final session/cancellation follow-up: 5 files / 72 passed. Final map JS/CSS change: 2 files / 30 passed. These runs overlap and are not an aggregate test count.
- Full Vitest run: **1,052 files passed / 2 failed; 11,293 tests passed / 4 failed**. One failure froze the old sequential calendar request count. It now verifies both bounded parallel endpoints and no activity-range request after cancellation; its 19-test service suite passes in the final follow-up run.
- The remaining three `dompurifyShadowRoot` cases reproduce in the unmodified dev archive with the same installed dependencies. No sanitizer change or full-suite-green claim is included.
- Independent review prompted additional post-JSON/post-track cancellation guards, bounded profile hydration, detached private-result names, CSV readiness and exact-SDK session replacement coverage. All identified source findings were resolved before final approval.
- Browser visual acceptance and production latency measurement remain incomplete. Source/build/testing evidence is distinct from deployed acceptance.

### Built dependency evidence

Static reachability from each route entry, including shared JavaScript. Before is the activity-only PR build at `8df8ecf3`; after is this expanded audit build. These totals are **not incremental network bytes**, and are not a speed benchmark. The listed deferred map/chart runtime is absent from the initial route closure. EventsPage requests Mapbox JavaScript and CSS together only when its map view renders.

| Route module | Before static JS modules | After static JS modules | Initial Mapbox/chart runtime after change |
|---|---:|---:|---|
| `SettingsPage` | 32 | 7 | Absent |
| `EventsPage` | 16 | 14 | Absent |
| `EventDetailPage` | 44 | 33 | Absent |
| `CoursePage` | 49 | 37 | Absent |
| `ActivityDetailRoute` | 19 | 18 | Absent |

`GroupRidePage` and `ClubMeetingPage` retain 39 statically reachable JS modules each and include the map/chart runtime. They are recorded as follow-up candidates, not counted as completed code-splitting fixes.


## App route declarations

The exact inventory below is generated from `src/App.tsx` during this audit. Paths are relative to `/:lang` except that declaration and outer wildcard. A repeated wildcard belongs to a different parent.

```text
(index)
/:lang
m/:groupId/:meetingId
live/:eventId
onboarding
embed/activity/:activityId/public
embed/activity/:activityId/analysis
embed/fitness
embed/plan
embed/clubs
embed/clubs/:groupId/*
embed/courses/:courseId/*
embed/segments/:segmentId/*
embed/athlete/:userId/*
embed/explore
embed/event/:eventId/*
embed/search
embed/about
embed/policies/community
embed/feedback
embed/activity/:activityId/edit
activity/:activityId
activity/:activityId/edit
coach/condition
coach/analysis
coach/plan
coach/today
coach/goals
coach/chat
coach/chat/:threadId
lab
goal/climb
goal-setup
athlete/me
athlete/me/activities
athlete/me/records
athlete/me/friends
athlete/me/gear
athlete/:userId
settings
settings/account
settings/connections
settings/data
settings/display
settings/developer
settings/device
settings/training
settings/*
clubs
club/join
club/join/:code
club/:groupId
club/:groupId/news
club/:groupId/rides
club/:groupId/rides/:rideId
club/:groupId/week
club/:groupId/meetings/new
club/:groupId/meetings/:meetingId/edit
club/:groupId/meetings/:meetingId/live
club/:groupId/meetings/:meetingId
club/:groupId/events
club/:groupId/leaderboard
club/:groupId/members
club/:groupId/settings
group/join/:code
segment/create
segment/:segmentId
explore/courses
explore/segments
explore/segments/leaderboard
explore/events
explore/events/organize
explore/challenges
explore/athletes
explore/clubs
course/create
course/:courseId/edit
course/:courseId
strava/callback
auth/social/callback
friend/:code
migrate
community/board
community/board/write
community/board/:postId
explore/recipes
explore/recipes/:section
community/recipes
community/recipes/:section
tools/virtual-power
feedback
feedback/board
terms
privacy
account-deletion
policies/ai-coach
policies/community
about
partnership
partnership/build
partnership/collaborate
partnership/investment
strava-terms
event/create
event/:eventId
event/:eventId/host
event/:eventId/host/edit
event/:eventId/host/participants
event/:eventId/results
event/:eventId/register
fitness
coach
coach/:threadId
plan
my
log
year-recap
friends
social
groups
group/:groupId
group/:groupId/rides
group/:groupId/ride/:rideId
group/:groupId/leaderboard
group/:groupId/members
group/:groupId/settings
courses
explore
discover
leaderboard
events
events/organize
event/:eventId/dashboard
event/:eventId/edit
event/:eventId/participants
board
board/write
board/:postId
creator
creator/:section
community
*
*
```
