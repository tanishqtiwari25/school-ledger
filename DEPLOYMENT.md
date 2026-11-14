# Deployment and first use

The application requires a server and database. GitHub stores its source. GitHub Pages cannot run this Worker or D1, and the source must not be published as a static site with disabled authentication.

The existing OpenAI Sites deployment remains separate. A direct Cloudflare deployment uses **Cloudflare Access** to sign in, verifies its signed JWT on every request, and keeps the same database-enforced Admin and Accountant permissions. No passwords, access tokens, database snapshots or local offline vaults belong in GitHub.

## Direct Cloudflare setup

1. Sign in to your own Cloudflare account with `node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js login`. Complete the browser authorization yourself. Keep Workers on the Free plan; do not enable paid add-ons. Plan quotas and account billing must be checked in your Cloudflare dashboard.
2. Create a D1 database named `school-ledger` with `node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 create school-ledger`. Retain the returned database ID. Reuse this database on later deployments; never create a new one for each release.
3. Choose the Worker name and its full `workers.dev` hostname. Create a Cloudflare Access application for **the entire hostname**, allowing only your administrator email initially, using the available identity provider or email one-time PIN. Retain the team URL and this application's audience (AUD). Do not use an Allow Everyone or Bypass policy. Account creation, sign-in and permission approvals require the account owner.
4. Run `npm run build` and `node node_modules/typescript/bin/tsc --noEmit`.
5. Generate the direct deployment configuration, replacing every placeholder with your actual Cloudflare values:

   ```text
   node scripts/configure-cloudflare.mjs --name=YOUR-WORKER-NAME --account=YOUR-ACCOUNT-ID --database=YOUR-D1-ID --team=https://YOUR-TEAM.cloudflareaccess.com --audience=YOUR-APPLICATION-AUD --admin-email=YOUR-EMAIL
   ```

   The generated `.cloudflare/wrangler.json` is local and ignored by Git. It preserves the separate Sites manifest, routes requests through JWT verification before serving assets, disables preview URLs and binds the real D1 database. Repeat this configuration step after every build because build output metadata can change.

6. Apply schema-only migrations and deploy:

   ```text
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 migrations apply school-ledger --remote --config .cloudflare/wrangler.json
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js deploy --config .cloudflare/wrangler.json
   ```

7. Open the returned URL in desktop Chrome. Confirm Cloudflare Access asks for sign-in. Sign in as the configured administrator. A different Access-authenticated email cannot claim the empty workspace. The first saved change retains the configured administrator in the application user list. Add accountants in Settings **and** allow their email addresses in the Access application policy.

If issuer, AUD or owner configuration is missing, the Worker fails closed. If Access is not configured on the hostname, the Worker returns an authentication error rather than trusting browser-supplied user headers. Do not disable the JWT checks to resolve a login error.

## Real school launch

1. Explore the clearly marked fictional sample workspace.
2. In Settings, use **Start real school accounts**, enter the school name, academic session and actual cash/bank opening balances, then type the confirmation. The sample ledger is archived as a recovery point. Opening balances must be the funds held at the chosen starting date; do not also enter them as income.
3. Add students and their tuition schedule, previous-session dues and discounts. For transport students, select the chargeable months and rates. Confirm total obligations before collecting money.
4. Add staff and create the required salary months. These records preserve that month's salary even if a later salary changes.
5. Collect a small real payment only when actually received. Check its receipt, student history, fee report and account balance agree. Never use fabricated payments to test the live financial ledger. Corrections use refunds/reversals with reasons.
6. Download a full JSON backup and keep it outside the app. Recovery points share the application's database and are not independent disaster recovery.
7. Enable Offline & sync on a private device, choose your own passphrase and keep an encrypted device backup. Confirm the app says its offline pages are ready, install it from Chrome, then test reopening without network. Provisional device entries become official receipts only after server confirmation. Sync every device before restoring a server backup.

## Release checks

```text
node node_modules/typescript/bin/tsc --noEmit
npm run build
node --test tests/completion.test.mjs tests/transport.test.mjs tests/offline.test.mjs tests/pwa.test.mjs tests/access.test.mjs
```

GitHub Actions runs these checks on every push and pull request. Against the loopback production preview, the integration scripts additionally verify persistent transactions, duplicate retries, stale context, recovery/restore, role authorization and transport allocation. Do not run those write tests against a real school database.

Before replacing the existing live link, verify the new account's billing/limits, sign-in, owner/accountant permissions, persistence after refresh, printable receipts, report exports, backup download/restore and an actual installed device's offline/sync behavior. Migration is complete only after these live checks pass. Native Android/iPhone testing requires those devices.
