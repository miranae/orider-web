# Public feed recovery — 2026-10-27

At 11:06 KST the home page rendered, but the public activity feed repeatedly failed.
The browser's preflight to `getActivityDiscovery` returned HTTP 404 and no CORS
allow-origin header. An authenticated Cloud Functions inventory lookup confirmed
that the production function did not exist. The new consumer was present in web
release `v2026.10.27-1051` (`4e2d8a148b4fc658ee0e8870e19e22f2b8d40903`),
while its producer existed only on the backend development branch.

At 11:09:49 KST, Hosting was restored to the previous finalized version
`15a2e4c911516145`, from `v2026.10.27-0137`
(`429c06a00d0651952b35eeae27daa7f022a8ea25`). Recovery release:
`sites/miranae-orider-g1/releases/1793066989897000`.
The public home feed displayed activity cards again in a fresh browser session.
The new release's other UI changes were also rolled back with the artifact.

The existing Hosting deployment gate checked eight social callables but omitted
the new discovery dependency. The gate now requires discovery to be ACTIVE and
its callable endpoint to reject an unauthenticated probe correctly, before
Hosting can be changed. A regression reproduces healthy existing callables with
missing discovery. The production smoke additionally requires a visible activity
card in each locale, since checking the application shell missed this incident.

The recovery does not activate the development backend or weaken Firestore rules.
Keep the previous Hosting version live until the new backend contract, secrets,
indexes and rollout have been verified. Merging this deployment guard does not
deploy the incompatible web revision; do not create a new release tag merely to
publish the guard. Future release attempts must first satisfy the backend gate.
