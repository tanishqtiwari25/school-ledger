# School Ledger

School financial management built with React, Vinext, and Cloudflare D1. The hosted site uses secure platform sign-in. The first authorized owner to save a record becomes Admin. Admin can allow other signed-in email identities as Admin or Accountant in Settings; private site access must also be granted through the hosting platform.

## Run locally

Node 24 recommended. Install with `npm run install:ci`, generate schema changes with `npm run db:generate`, and build with `npm run build`. Apply pending SQL from `drizzle/` using Wrangler's local D1 command and the generated `dist/server/wrangler.json`. Run `npm run dev -- --port 5189`. Local sign-in uses the starter's loopback-only simulated identity; production uses platform authentication.

## Financial model

All amounts are integer paise. Immutable payment and compensating reversal transactions drive balances and reports. Transfers affect two accounts without affecting income or expenses. Tuition supports monthly, quarterly, or annual schedules within April–March sessions, with oldest dues paid first. Previous-session dues and discounts adjust the total obligation. Explicit advance consent permits fee receipts above the assigned obligation. Salaries are snapshotted per staff member/month; later staff salary edits do not alter those snapshots.

The D1 ledger uses optimistic version checks for atomic, serialized financial changes. Payment IDs make retried submissions idempotent. Transactions are never deleted through the application. Partial refunds post compensating entries against the original transaction. Cumulative refunds and tuition/transport portions cannot exceed the original payment. Transfers are reversed in full. CSV and native XLSX exports are included; formula-looking text is exported as literal text. Printable receipts and reports can be saved as PDF through the browser print dialog. Settings provides complete JSON export, validated restore with record-count preview and typed confirmation, and automatic database recovery points before every successful change. Restores retain user access and audit history; the previous active ledger stays downloadable as a recovery point. Receipt numbering never moves backwards. Encrypted offline device backups have a separate restore flow described below.

## Verification

`node node_modules/typescript/bin/tsc --noEmit`

With the local server running on 5189: `node tests/integration.mjs`. This creates and reverses test payments in the local database only. Covers persistence, decimal precision, idempotency, concurrent-write rejection, fee/salary overpayment prevention, reversals, audit logging, and anonymous access rejection.

Production starts with realistic fictional sample school data. Local preview records are separate from production D1.


## Installable PWA and offline use

The production build generates `dist/client/sw.js` with every emitted JS/CSS/icon asset precached. The app manifest includes standard, maskable, and Apple touch icons. Updates are offered explicitly, rather than replacing an open financial form. HTTPS is required for installation on hosted domains; loopback is allowed for local development. Browser installation behavior varies; the app provides Android/desktop and iPhone/iPad instructions.

1. Open the school site online and sign in.
2. Expand **Offline & sync** and choose a device passphrase of at least 10 characters. This is separate from platform sign-in. Use a private device and retain an encrypted backup.
3. Ensure the app says its offline pages are ready. Install through **Install app** or the browser menu.
4. After reopening without internet, unlock the device vault with that passphrase. Previously synced student records, fee history, payroll, accounts, reports, and print/PDF remain available.
5. Fee collections, salary payments, income, expenses, transfers, and partial refunds/reversals are saved as device-only pending entries. Provisional slips are clearly marked and have LOCAL IDs. Confirmed balances and official reports exclude pending entries.
6. When connected, keep the app open and unlocked. Sync runs on reconnection, when the app becomes visible, every minute, or with **Sync now**. It does not run while the app is closed or the vault is locked.
7. Changed account balances or fee/salary obligations require explicit review. Invalid drafts can be cancelled with a retained reason, then re-entered correctly. Entries with uncertain server acknowledgement cannot be cancelled until sync verifies them.

Offline data uses IndexedDB, AES-GCM encryption, and a passphrase-derived PBKDF2 key held only in memory. An encrypted backup can be restored on the original site address using its original passphrase. Data is bound to the account and site origin. A different signed-in account cannot upload the queue. Online sign-in and current server role authorization are checked again during sync. Offline access uses the last authorized snapshot and cannot discover later permission changes until reconnecting.

Keep encrypted backups: browser data removal or device loss can remove unsynced entries, and lost passphrases cannot be recovered. Existing device data cannot be replaced by an import while pending entries remain. Cancellation history survives snapshot refreshes. API/authentication responses are never stored in the service-worker cache.

Student/staff editing, salary-month creation, user management, and school settings require an online connection. Create needed salary months before going offline. Partial refunds use the same component and cumulative checks online and offline.

### Run a production PWA preview locally

Build first with `npm run build`. Then run these commands in separate terminals from this project:

```
npm start -- --port 5190
node scripts/preview-pwa.mjs
```

Open `http://127.0.0.1:5189/` and use **Sign in securely**. The preview wrapper is bound strictly to loopback and uses the same fictional local identity as the starter. It is never imported into or deployed with the production Worker. Hosted authentication remains platform-owned. Close both preview processes when finished.

### PWA verification

```
node --test tests/offline.test.mjs tests/pwa.test.mjs
node node_modules/typescript/bin/tsc --noEmit
```

Tests cover encrypted persistence/restart, passphrase/account/origin checks, pending validation, cumulative salary overpayment, exact payment IDs, missing acknowledgements, multi-window writes, conflict review, transfers and reversals, retained cancellations, backup restoration, asset precaching, offline full navigation, and API/auth cache exclusions. `tests/pwa.test.mjs` requires the production build first. Financial API integration tests continue to use the loopback preview.

Browser QA verified that the built app shell reloads after the preview server is stopped. Encryption/queue/sync behavior is tested with the real IndexedDB adapter against a test-only IndexedDB implementation; no real school data or personal passphrase is used. Native installation prompts and device-specific iOS/Android behavior still require a hosted-device check after publication.

References: [MDN service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers), [installable PWAs](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API).


## Student transport fees

Transport is a separate fee component inside Students & Fees. Open a student, choose Edit student, enable Uses school transport, set a monthly rate, and select the chargeable months. Unselected months are not billed. Transport runs independently of the tuition payment schedule. The new rate effective month controls which future selected months receive a changed rate. Saved rates for elapsed or partly/fully paid months cannot be rewritten. Turning transport off retains those historical obligations and removes eligible future charges. A new academic session uses a separate student-session record.

Collect fee asks for Total received and Transport portion. The remaining portion is tuition. Each component pays its own oldest unpaid instalment first. A tuition advance never hides unpaid transport, and excess in either component requires explicit advance consent. Inactive transport plans cannot receive new transport advances. Old receipts without component allocation remain entirely tuition payments, including their reversals; adding transport does not reclassify historical income.

Student details show tuition and transport payable/paid/due, saved transport month rates, and named unpaid instalments. Receipts include both portions. Fee collection and outstanding reports can show both components or only tuition/transport. Income and account totals count the receipt once; component columns are a breakdown, not additional income. Offline payments keep the same split through sync, conflict review, provisional slips, and reversals. Student transport plan changes require an online Admin session.

Transport-specific checks: `node --test tests/transport.test.mjs tests/offline.test.mjs`. No route tracking, vehicles, or driver-management features are added.

## Starting real accounts and recovery

Fresh hosted databases start in an explicitly labelled fictional sample workspace. In Settings, Admin can enter the real school name, session and opening cash/bank balances, then type START REAL ACCOUNTS. This saves the sample ledger as a recovery point and starts empty student, staff, payroll and transaction lists. It cannot be repeated on a real workspace. Add real students, staff and salary months before collecting payments.

Recovery points are immutable D1 snapshots saved atomically with each successful ledger mutation. Settings lists the latest 100; older points remain stored. They share the application database and are not an independent disaster-recovery service. Download regular JSON copies to separate storage. Import only a trusted backup, review counts and currency, sync all devices, and type RESTORE BACKUP. Current access is retained and restore is audited. Encrypted device backups remain separate from server JSON backups.

Completion checks: `node --test tests/completion.test.mjs tests/transport.test.mjs tests/offline.test.mjs tests/pwa.test.mjs` (29 tests), plus `node tests/recovery.integration.mjs` against the local preview for persistent recovery points, restore, initialization, idempotency and role authorization. Actual iPhone/Android installation and device-specific offline behavior still require testing on those devices.
