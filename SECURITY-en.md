# Security Policy

## Reporting a Vulnerability

If you find a security vulnerability, do **not** open a public issue or discuss it in public pull request comments.

Please report it privately:

- Email: **security@orider.co.kr**

Include, when possible:

- impact and severity,
- reproduction steps or proof of concept,
- affected version or commit.

We will respond within a reasonable period and coordinate privately until a fix is available.

## Scope

This repository contains the **Orider web frontend client**. The client calls a Firebase-backed private backend. Server-side authorization and validation are enforced by private backend services and Firebase security rules.

Therefore:

- `VITE_FIREBASE_*` values are browser-exposed public configuration, not secrets. Access control must come from backend authorization and security rules.
- If client code appears to bypass authorization, please also report the possible server-side rule or validation weakness.

## Do Not

- access or modify real user data without permission,
- run denial-of-service tests,
- test against accounts that are not yours.

## Public Repository Boundary

This repository intentionally does not include:

- Cloud Functions implementation,
- Firestore or Storage production rules,
- service accounts,
- provider secrets,
- production exports,
- operational logs,
- private user data.

Please do not request or disclose those materials in public issues or pull requests.
