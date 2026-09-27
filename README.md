# The Lord City Gospel Grace Church

The public church website is deployed to Cloudflare Pages from GitHub `main`. Static pages are present in the repository root and mirrored in `dist` because the current Pages project has published the repository root. The `functions` folder contains Pages Functions for the database features.

## Activation checklist for the new features

The work is staged on a feature branch until these resources are connected. Do not merge it to `main` before completing these steps, since prayer submissions and sign-in need a database.

1. In Cloudflare **D1 SQL Database**, create `lords-city-church`.
2. Open its SQL console and run the statements in `migrations/0001_init.sql` in order. Alternatively run `npx wrangler d1 execute lords-city-church --remote --file=migrations/0001_init.sql` from a machine authenticated to this Cloudflare account.
3. In **Workers & Pages → the-lords-city-gospel-grace-church → Settings → Bindings**, add a production D1 binding named exactly `DB` for that database.
4. Create an R2 bucket named `lords-city-photos`. Add a production R2 binding named exactly `PHOTOS` to the same Pages project. Uploaded photos stay private in R2 and are served through the website's `/api/photo/:id` route. If R2 is not connected yet, the rest of the site can work, but new photo uploads will be unavailable.
5. In the Pages project's production environment variables, add an **encrypted secret** named `ADMIN_SETUP_KEY`, with a random value of at least 24 characters. Do not put it in GitHub or chat. Redeploy after adding bindings and the secret. Remove this secret after the first administrator account is created.
6. Merge the feature branch to `main` to trigger a Pages deployment. Visit `/api/theme` to verify the database is bound. It should return `{"theme":"Greater Level"}`. Then visit `/admin/`, use the setup key to create the first administrator, and sign in. Create partner and mentee accounts there.
7. Test a prayer request, an announcement, the monthly theme, one partner update, one mentorship update, and a photo upload. Verify each item is visible only to its intended audience.

Cloudflare Pages currently publishes from the repository root. Keep the build command blank and the output directory set to the repository root (typically `.`). If you change it to `dist`, make sure Pages Functions in `functions/` are still deployed. Pages requires Git integration for these Functions.

The giving page intentionally contains no bank account, checkout, or payment link until the church provides verified payment instructions. Partner and mentee passwords must be shared privately with their intended recipients. This initial release does not include password recovery or email notifications; an administrator can provision accounts and view requests in the dashboard.

## Files

- `index.html`, `photos/`, and page directories: public content.
- `site.css`, `site.js`: common styling and browser actions.
- `functions/api/[[path]].js`: Pages Functions for authentication, prayer, updates, and photo uploads.
- `migrations/0001_init.sql`: D1 database schema.
- `dist/`: mirrored static output for the original deployment setting.
