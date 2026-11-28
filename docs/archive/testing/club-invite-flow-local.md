# Club invitation recovery: local verification

Scope: R7 #1345 invitation → sign in → join destination. This change reuses the existing club/member screens, invite URLs, Google sign-in modal, and server join contract. It does not implement new club sharing UI or route comparison.

## Behavior

- Anonymous Firebase sessions see the sign-in prompt and never call `joinGroupByCode`.
- After real authentication, the original normalized URL code is used. The Google popup/redirect entry point does not navigate away from the invitation.
- Successful active membership opens the club; approval-required membership retains the existing pending notice and club-list destination.
- Temporary failure keeps the invitation and exposes an explicit retry. Known App Check cooldown disables retry until the cooldown ends; it never automatically repeats a join.
- Expired codes show an explicit club-list exit instead of automatically discarding the invitation.
- A response from an earlier account cannot navigate the next account. Invitation credentials are omitted from client error context.

## Validation

Node 22.23.4: GroupInvitePage, GroupsPage.join, groupInviteLink suites: 42 tests passed. Targeted ESLint and `tsc -b` passed. Tests cover anonymous-to-authenticated continuation, active/pending destinations, explicit retry, expired-code exit, and a late previous-account response. Google provider redirect round-trip and real backend membership were not executed; this is local contract verification, not production or browser evidence.

## Existing sharing and remaining scope

`GroupSubNav` copies the localized club URL. `GroupMembersPage` restricts invitation management to `canManage` and uses `buildGroupInviteUrl`. Existing server SEO parser supports activity/segment/course/event, not club-specific metadata. Dynamic club OG and actual Kakao crawler preview remain unverified. A secret invitation code must not be added to publicly rendered OG content.

Server `joinGroupByCode` currently checks `request.auth`, without explicitly rejecting the anonymous provider. The frontend guard does not establish server enforcement; server membership policy needs independent review. Existing member activity/dashboard behavior is preserved, not newly proven end-to-end.

All changes remain local as requested; no PR update, issue update, push, merge, or deployment is included.
