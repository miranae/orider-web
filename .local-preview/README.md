# Native twelve local design preview

From this worktree run `SENTRY_AUTH_TOKEN= npm run dev -- --host 127.0.0.1 --port 5187 --strictPort`, then open `http://127.0.0.1:5187/.local-preview/native-twelve.html`.

The entry renders the production `NativePowerTwelvePersonalView` using the same generated design tokens, DS component stylesheet, theme providers, Korean resources, and local fonts as the app. The synthetic scalar fixture is explicitly labeled. It mounts no app router, Firebase initialization, Auth provider, cloud callable, or delegated-login substitute. It is guarded to Vite DEV and localhost. This entry is outside the production build input.

Check 390 and 1440 widths, select/check the first synthetic activity, then analyze. W/Wkg, duration and source selectors are local display controls. A 60-minute short window displays missing, not a padded value. This preview supports design review; it is not Stage owner-data acceptance or computation proof.
