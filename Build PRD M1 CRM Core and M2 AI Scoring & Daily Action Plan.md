# Build PRD: M1 CRM Core and M2 AI Scoring & Daily Action Plan

Nov 13, 2026 · @Mayank Singhal

## Read this first

You are extending a live real-estate website for one agent, Steven Lenz Jr. (Compass, CA DRE# 01989811), by turning its lead inbox into a CRM (M1) and adding lead scoring and a daily action plan with AI drafts (M2). Build exactly what this document specifies, in the order given in the last section, and stop at each gate for review.

Rules that cannot be broken:

1. **Do not break what is live.** The public site, every form, `/api/lead`, the notification outbox and the admin login must keep working after every commit.
2. **Never fake success.** A form, a send or an AI call that fails must show a real error. No canned fallback may be presented as a real result.
3. **Never invent data.** No sample contacts, listings, reviews, prices or statistics in the database or the UI. Empty states say the list is empty.
4. **Nothing reaches a contact without Steven's approval.** M2 drafts messages; only an explicit Approve action sends one.
5. **Consent is checked in code before every send**, using the rules in the behaviour section. A send without a passing check is a bug.
6. **Secrets live only in `.env`.** Never in source, logs, the browser or this document.
7. **Every state change is written to `audit_log`.**
8. **Mobile first.** Every admin screen must work at 375 px wide with 44 px tap targets and 16 px inputs.

How to work:

- Before writing code, read the repository and produce a short discrepancy report: anything in the code that differs from the Existing system section. Wait for approval before resolving a conflict.
- Use database migrations that are additive and safe to run twice. Back up the database file before the first migration.
- Keep the existing conventions: Node 22, the built-in `node:sqlite` module, no web framework, plain JavaScript modules, no build step for the public site.
- New dependencies need a one-line justification in the pull request. Two are pre-approved: `web-push` and the official Google Gemini SDK.
- Write tests alongside each feature. A phase is not done until its acceptance tests pass.

## Decisions and constraints

These were decided by the owner on 13 November 2026 and are not open for redesign.

| Decision | Value | Consequence for the build |
| --- | --- | --- |
| Who uses it | Steven only | One owner account. No teams, roles, lead routing or multi-tenancy |
| Who approves | Steven approves all content and AI drafts | Single approver; no review queue between people |
| Database | Stay on SQLite (`node:sqlite`, WAL mode) | No Postgres. One user makes SQLite sufficient; add a nightly backup job |
| Mobile | Installable web app | Web manifest, service worker for the admin shell, web push. No app-store app |
| Monthly budget | $100 total for SMS, email, AI and data | Hard spending caps in code; see allocation below |
| AI provider | Google Gemini API | One internal service wraps all calls |
| Site statistics | Keep the figures currently on the site | Do not change them |
| SMS | Not in M1 or M2 | The action plan may suggest a text and offer copy-to-clipboard and an `sms:` link only where SMS consent exists |

Budget allocation, enforced by environment variables. These are caps, not prices; check current provider pricing before launch.

| Service | Monthly cap | Variable |
| --- | --- | --- |
| Gemini API | $25 | `AI_MONTHLY_BUDGET_USD=25` |
| Email sending | $20 | `EMAIL_MONTHLY_BUDGET_USD=20` |
| Reserved for SMS and data in later modules | $55 | not used in M1 or M2 |

When a cap is reached the feature stops, the Today screen shows a banner saying which cap was hit, and nothing fails silently.

## Existing system

This is what was live on 13 November 2026 at the staging address. Verify each line against the repository first; the owner changed code after the last review.

| Area | What exists | Keep, change or replace |
| --- | --- | --- |
| Server | `site/server.js`: plain Node HTTP server behind nginx, static allowlist, security headers, rate limiting | Keep. Add routes only |
| Database | `site/db/database.js`, SQLite file outside the web root in `data/` | Keep. Add tables by migration |
| Lead pipeline | `site/api/lead.js`: validates, saves to `leads`, queues notifications. `POST /api/lead` and `POST /api/valuation` use it | Keep. Add contact upsert after the save |
| Second lead endpoint | `POST /api/leads`, used by the site chat widget | Change: must call the same pipeline as `/api/lead` |
| Outbox | `site/lib/outbox.js`: retrying delivery of owner email, visitor acknowledgment, webhooks | Keep. Reuse for all M1 and M2 sends |
| Admin API | `site/api/admin.js`: scrypt password hash in `.env`, HttpOnly session cookie, `X-SL-Admin` header and origin check on writes, audit log | Keep the security model exactly |
| Admin UI | `site/admin/`: single-page admin with leads, listings, reviews, activity | Extend. Split the script into modules per screen |
| Tables | `leads`, `outbox`, `listings`, `testimonials`, `valuations`, `newsletter_subscribers`, `admin_sessions`, `audit_log`, `meta` | Keep. `leads` stays as the raw submission record |
| Site chat | `site/js/ai-steve.js`, `POST /api/chat`, `POST /api/feedback` | Out of scope here, except the lead endpoint fix above |

A lead row holds: `lead_id`, `received_at`, `form_type`, `source_page`, `name`, `email`, `phone`, `interest`, `budget`, `timeline`, `areas_json`, `segment`, `message`, `email_consent`, `sms_consent`, `consent_text_version`, `consent_timestamp`, `utm_json`, `referrer`, `status`, `notes`, `follow_up_at`.

### Live admin as reviewed on 13 November 2026

The admin has six tabs: Dashboard, Leads, Listings, Reviews, Subscribers, Activity. It held 0 leads, 0 subscribers, 24 published listings and 6 published reviews, and the audit log held only sign-ins.

| Finding | What the build must do |
| --- | --- |
| No notification channel is configured, so a new lead alerts nobody | Configure email before M1 goes live; web push in Step 7 is the second channel |
| The lead flow has never been exercised on this server | Step 1 regression tests must submit every form and confirm the row and its delivery log |
| Listing editor has 8 fields: address, city, price, beds, baths, status, photo path, published | Out of M1 scope, but do not let a save blank the fields it does not show (MLS number, role, square feet, description). Add a regression test |
| 7 published listings still carry placeholder MLS numbers and the editor cannot change them | Owner to supply real numbers; add the MLS field to the editor when listings work is scheduled |
| Chat conversations and thumbs-up or down feedback are stored but not visible in the admin | In Step 3, write each chat lead to the contact timeline as a `chat` activity |
| No web manifest or service worker on the admin | Step 7 |
| Listing rows show address and price with no space between them | Fix when the admin script is split into modules |

## M1 data model

Add these tables by migration. All timestamps are ISO 8601 UTC text. All ids are integer primary keys unless noted. Do not alter or drop existing tables except to add the `contact_id` column to `leads`.

```sql
CREATE TABLE contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'lead',      -- lead | client | past_client | sphere | vendor
  stage TEXT NOT NULL DEFAULT 'new',      -- new | contacted | qualified | active | closed | lost | spam
  discreet INTEGER NOT NULL DEFAULT 0,    -- 1 = never sent to an AI provider, never auto-suggested
  source TEXT,                            -- first form_type or 'import' or 'manual'
  first_utm_json TEXT,
  interest TEXT, budget TEXT, timeline TEXT, areas_json TEXT,
  notes TEXT,
  score INTEGER NOT NULL DEFAULT 0,
  score_band TEXT NOT NULL DEFAULT 'cold',
  score_reasons_json TEXT,
  score_updated_at TEXT,
  last_inbound_at TEXT,
  last_outbound_at TEXT,
  next_follow_up_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  merged_into INTEGER REFERENCES contacts(id)
);

CREATE TABLE contact_identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  kind TEXT NOT NULL,                     -- email | phone
  value TEXT NOT NULL,                    -- lowercased email, or E.164 phone
  is_primary INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok',      -- ok | bounced | invalid
  UNIQUE (kind, value)
);

CREATE TABLE consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  channel TEXT NOT NULL,                  -- email_marketing | sms_calls
  granted INTEGER NOT NULL,               -- 1 granted, 0 withdrawn
  text_version TEXT,
  source TEXT NOT NULL,                   -- lead:<lead_id> | unsubscribe | admin
  recorded_at TEXT NOT NULL
);
-- The current consent for a channel is the most recent row. Never update or delete rows.

CREATE TABLE activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  kind TEXT NOT NULL,   -- form | chat | note | call | meeting | email_out | email_in | text_out | stage_change | task_done | merge | system
  direction TEXT,       -- in | out | null
  subject TEXT,
  body TEXT,
  meta_json TEXT,       -- lead_id, deal_id, message_id, old/new stage, etc.
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_activities_contact ON activities (contact_id, occurred_at DESC);

CREATE TABLE pipelines (id INTEGER PRIMARY KEY, name TEXT NOT NULL);           -- seed: 1 Buyer, 2 Seller
CREATE TABLE pipeline_stages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pipeline_id INTEGER NOT NULL REFERENCES pipelines(id),
  name TEXT NOT NULL, sort_order INTEGER NOT NULL,
  is_won INTEGER NOT NULL DEFAULT 0, is_lost INTEGER NOT NULL DEFAULT 0
);
-- Seed both pipelines: New, Contacted, Qualified, Showing (Buyer) / Listing prep (Seller),
-- Offer, Under contract, Closed (is_won), Lost (is_lost).

CREATE TABLE deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  pipeline_id INTEGER NOT NULL REFERENCES pipelines(id),
  stage_id INTEGER NOT NULL REFERENCES pipeline_stages(id),
  title TEXT NOT NULL,
  value_usd INTEGER,
  property_address TEXT,
  expected_close TEXT, closed_at TEXT,
  stage_changed_at TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER REFERENCES contacts(id),
  deal_id INTEGER REFERENCES deals(id),
  title TEXT NOT NULL,
  due_at TEXT,
  done_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL);
CREATE TABLE contact_tags (contact_id INTEGER NOT NULL, tag_id INTEGER NOT NULL, PRIMARY KEY (contact_id, tag_id));

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  channel TEXT NOT NULL,                  -- email
  to_value TEXT NOT NULL,
  subject TEXT, body TEXT NOT NULL,
  origin TEXT NOT NULL,                   -- manual | action_plan
  action_item_id INTEGER,
  status TEXT NOT NULL DEFAULT 'queued',  -- queued | sent | failed | bounced
  provider_id TEXT, error TEXT,
  approved_at TEXT NOT NULL,              -- a message row exists only after approval
  sent_at TEXT, created_at TEXT NOT NULL
);

CREATE TABLE action_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_date TEXT NOT NULL,                -- YYYY-MM-DD in America/Los_Angeles
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  rule TEXT NOT NULL,                     -- see the action plan section
  reason TEXT NOT NULL,
  channel TEXT NOT NULL,                  -- email | call | text
  draft_subject TEXT, draft_body TEXT,
  draft_source TEXT,                      -- gemini | template | none
  status TEXT NOT NULL DEFAULT 'open',    -- open | sent | done | snoozed | skipped
  snoozed_until TEXT, skip_reason TEXT,
  edited INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, resolved_at TEXT,
  UNIQUE (plan_date, contact_id, rule)
);

CREATE TABLE ai_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purpose TEXT NOT NULL,                  -- draft
  prompt_version TEXT NOT NULL,
  model TEXT NOT NULL,
  contact_id INTEGER,
  input_json TEXT NOT NULL,               -- exactly what was sent
  output_text TEXT,
  input_tokens INTEGER, output_tokens INTEGER, cost_usd REAL,
  status TEXT NOT NULL,                   -- ok | error | blocked | over_budget
  error TEXT, created_at TEXT NOT NULL
);

CREATE TABLE push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT UNIQUE NOT NULL, keys_json TEXT NOT NULL, created_at TEXT NOT NULL
);

ALTER TABLE leads ADD COLUMN contact_id INTEGER REFERENCES contacts(id);
```

## M1 behaviour

### Lead to contact

Every saved lead produces or updates exactly one contact, inside the same database transaction as the lead insert.

1. Normalise the email (trim, lowercase) and the phone (E.164, US default).
2. Look up `contact_identities` by email, then by phone.
3. No match: create the contact, its identities and a `form` activity. Set `source`, `first_utm_json`, `interest`, `budget`, `timeline`, `areas_json` from the lead. If the lead's segment is `sports_entertainment`, set `discreet = 1`.
4. One match: add any new identity, fill only empty profile fields, append a `form` activity, set `last_inbound_at`.
5. Email and phone match two different contacts: attach to the email match and create a task "Possible duplicate: review" naming both. Never merge automatically.
6. Write a `consents` row for each consent box, granted or not, with the lead's text version and timestamp.
7. Set `leads.contact_id`. Recalculate the score. Send a web push "New lead: \<first name>, \<form type>".

Honeypot submissions never create a contact.

### Backfill

A one-time migration runs the same steps over existing `leads` rows in `received_at` order, carrying `status`, `notes` and `follow_up_at` onto the contact. Rows with obviously test data (`@example.com`) are imported with stage `spam`. The migration is idempotent and logs counts.

### Merge

Steven can merge two contacts from the contact page. The older record survives; identities, consents, activities, deals, tasks and tags move to it; the other gets `merged_into` set and disappears from lists. A `merge` activity records both ids. Consent after a merge is the most recent row per channel.

### Stage and timeline

- Changing `stage` writes a `stage_change` activity with old and new values.
- Logging a call, meeting or note writes an activity and updates `last_outbound_at` (call, meeting) or neither (note).
- An inbound activity on a contact in stage `new` does not change the stage; the first outbound activity moves `new` to `contacted`.

### Pipeline and deals

- A contact can have several deals. Creating a deal is manual, with a one-tap "Start buyer deal" or "Start seller deal" on the contact page.
- Moving a deal between stages writes an activity and sets `stage_changed_at`. Moving to a won stage sets `closed_at` and the contact type to `past_client`.

### Tasks

- A task has a title and optional due time, and belongs to a contact, a deal or neither.
- `contacts.next_follow_up_at` is the earliest open task due time for that contact.

### Email from the contact record

- Sent through the existing email provider via the outbox, from the configured sender, with reply-to set to Steven's address.
- Every email carries a footer with Steven's name, Compass, DRE number, office address and an unsubscribe link.
- The unsubscribe link writes a `consents` row (`email_marketing`, granted 0) and shows a confirmation page.

### Consent rules, checked in code before every send

| Message | Allowed when |
| --- | --- |
| One-to-one email replying to the contact's own inquiry | Primary email status is `ok` and the contact has not unsubscribed |
| Any other email (check-in, market update, anniversary) | The above, and current `email_marketing` consent is granted |
| Text suggestion (copy or `sms:` link) | Current `sms_calls` consent is granted |
| Call suggestion | A phone identity exists |
| Anything to a contact in stage `spam` or `lost` | Never |

These rules are the owner's working policy and should be confirmed by Compass compliance before launch.

### Import and export

- CSV import: upload, map columns, preview with duplicates flagged, then confirm. Imported contacts get no consent rows and type `sphere` unless a column says otherwise.
- CSV export of contacts with current consent per channel. Cells starting with `=`, `+`, `-` or `@` are prefixed with a quote.

### Installable web app

- Web manifest and a service worker that caches the admin shell only. API responses are never cached.
- Web push with VAPID keys from `.env`. Steven turns notifications on from Settings.

### Backups

- A nightly job copies the database with SQLite's online backup to `data/backups/`, keeps 14 days, and writes the result to `audit_log`.

## M1 and M2 API

All routes sit under `/api/admin`, require a valid session, and follow the existing rules: writes need the `X-SL-Admin: 1` header and a same-origin request; responses are JSON `{ ok, ... }` or `{ ok: false, error }` with a message safe to show. Every write adds an `audit_log` row.

| Method and path | Purpose |
| --- | --- |
| `GET /contacts?q=&stage=&type=&band=&tag=&sort=&limit=&offset=` | List with search over name, email, phone and notes |
| `POST /contacts` | Create manually |
| `GET /contacts/:id` | Profile, identities, current consents, tags, deals, open tasks |
| `PATCH /contacts/:id` | Edit profile, stage, type, discreet, notes |
| `DELETE /contacts/:id` | Permanent delete for a privacy request, including identities, consents, activities, messages and linked leads |
| `GET /contacts/:id/timeline?before=&limit=` | Activities, newest first |
| `POST /contacts/:id/activities` | Log a note, call or meeting |
| `POST /contacts/:id/merge` | Body `{ other_id }` |
| `POST /contacts/:id/tags`, `DELETE /contacts/:id/tags/:tagId` | Tagging |
| `POST /contacts/:id/email` | Body `{ subject, body, kind }` where kind is `reply` or `other`; runs the consent check, creates a message, queues it |
| `GET /contacts/:id/export` | All data held on one person, as JSON |
| `GET /contacts.csv`, `POST /contacts/import/preview`, `POST /contacts/import/commit` | Export and import |
| `GET /pipelines` | Pipelines, stages, and deals grouped by stage |
| `POST /deals`, `PATCH /deals/:id`, `DELETE /deals/:id` | Deal create, edit, stage move, delete |
| \`GET /tasks?filter=today | overdue |
| `GET /today` | Today's action items, due tasks, new leads, budget banners |
| `POST /action-plan/generate` | Build today's plan now; idempotent for the day |
| `PATCH /action-items/:id` | Edit the draft; sets `edited = 1` |
| `POST /action-items/:id/approve` | Runs the consent check, creates the message, queues the send, marks the item `sent` |
| `POST /action-items/:id/done` | For calls and copied texts; writes the activity |
| `POST /action-items/:id/snooze` | Body \`{ days: 1 |
| `POST /action-items/:id/skip` | Body `{ reason }` |
| `POST /action-items/:id/redraft` | Asks Gemini again; limited to 3 per item |
| `POST /contacts/:id/rescore` | Recalculate one score |
| `GET /usage` | Month-to-date AI and email spend against the caps |
| `POST /push/subscribe`, `DELETE /push/subscribe` | Web push |

One public route is added: `GET /u/:token`, the unsubscribe page. The token is an HMAC of the contact id with a secret from `.env`; it never exposes the id or email.

## Admin screens

Six screens, reached from a bottom tab bar on phones and a left rail on wide screens. Keep the existing dark theme. Listings, Reviews, Subscribers and Activity stay as they are, under a More menu.

| Screen | Shows | Actions |
| --- | --- | --- |
| Today (default) | Budget or failure banners; new leads not yet contacted; the action plan, up to 10 cards; tasks due today and overdue | Approve and send, edit, copy, mark done, snooze, skip, redraft; tick a task |
| Contacts | Search box, filters for stage, type, score band and tag; rows with name, score chip, stage, last activity | Open, add contact, import, export |
| Contact | Header with name, score and reasons, stage picker, discreet toggle; Email, Call, Text buttons that respect consent; tabs for Timeline, Deals, Tasks, Details | Log note, call or meeting; send email; start deal; add task; tag; merge; export data; delete |
| Pipeline | Buyer and Seller tabs; columns per stage with deal cards showing contact, value and days in stage | Drag between stages on wide screens; a Move menu on phones |
| Tasks | Today, Overdue, Upcoming, Done | Add, complete, reschedule |
| Settings | Notifications on or off; sender name and signature; working hours; month-to-date AI and email spend; last backup time | Save; send a test push |

Action plan card, top to bottom: contact name and score chip; the reason in one line; the suggested channel; the draft in an editable box with its source label ("Drafted by AI" or "Template"); the buttons. A card for a contact without the needed consent shows no send button and says why.

Required states on every screen: loading, empty with a plain sentence, and error with the server's message. Destructive actions need a second tap. No screen may show a number that is not read from the database.

## M2 scoring

The score is a deterministic 0 to 100 number calculated in code from the contact's own data. Gemini is not used for scoring, so it costs nothing and gives the same answer every time. Implement it as one pure function with unit tests: `scoreContact(contact, activities, consents, now) -> { score, band, reasons }`.

Score = Intent + Fit + Engagement + Recency, then overrides, then clamp to 0 to 100.

| Group | Signal | Points |
| --- | --- | --- |
| Intent (max 40) | Timeline 0 to 3 months | 20 |
|  | Timeline 3 to 6 months | 12 |
|  | Timeline 6 to 12 months | 6 |
|  | Timeline exploring or blank | 2 |
|  | Highest-value form submitted: valuation or listing inquiry | 10 |
|  | Highest-value form: private exclusives or concierge | 8 |
|  | Highest-value form: contact | 5 |
|  | Highest-value form: newsletter only | 1 |
|  | Each additional distinct form type | 3, up to 6 |
|  | Interest is buying and selling | 5 |
| Fit (max 20) | Price range given | 5 |
|  | Price range is $1.5M or more | 5 more |
|  | At least one area is in the core list (Pleasanton, Danville, Alamo, Walnut Creek, San Ramon, Dublin, Livermore, Lafayette) | 5 |
|  | Phone number on file | 3 |
|  | Calls-and-texts consent granted | 2 |
| Engagement (max 25) | First inbound reply or message after the first form | 10 |
|  | Each further inbound activity | 3, up to 9 |
|  | Two or more form submissions within 30 days | 5 |
|  | A meeting or showing logged | 8 |
| Recency (max 15) | Last inbound activity within 2 days | 15 |
|  | Within 7 days | 10 |
|  | Within 14 days | 6 |
|  | Within 30 days | 3 |
|  | Older or none | 0 |

Overrides, applied in this order:

1. Stage `spam` or `lost`: score 0.
2. Type `past_client` or stage `closed`: score capped at 30.
3. Primary email status `bounced`: subtract 15.
4. Email marketing consent withdrawn: subtract 10.

Bands: Hot 70 to 100, Warm 40 to 69, Cool 15 to 39, Cold 0 to 14.

Reasons: store the three largest positive contributions and any override as plain sentences built from fixed templates, for example "Wants to move within 3 months", "Asked for a home valuation", "Replied 2 days ago", "Email bounced". The contact page shows them under the score.

When to recalculate: after any new activity, any profile or consent change, and for all contacts in a nightly job, because recency decays with time. Keep the point values in one configuration object so Steven can ask for them to be tuned.

## M2 daily action plan

Each morning the system picks up to 10 people Steven should contact, says why, and drafts the message. It runs at 6:00 AM America/Los\_Angeles and on demand; running it twice in a day adds only new items.

Selection rules, in priority order. A contact appears once per day, under its highest-priority rule.

| Priority | Rule id | Who qualifies | Suggested channel |
| --- | --- | --- | --- |
| 1 | `new_lead` | Stage `new`, no outbound activity yet | Call if a phone exists, else email reply |
| 2 | `awaiting_reply` | Last activity is inbound and older than 4 working hours | Same channel they used |
| 3 | `follow_up_due` | An open task is due today or overdue | Task's context; default email |
| 4 | `hot_no_touch` | Band Hot and no outbound in 3 days | Call, else email |
| 5 | `warm_no_touch` | Band Warm and no outbound in 7 days | Email |
| 6 | `deal_stalled` | An open deal with no activity in 14 days | Call |
| 7 | `past_client_touch` | Type `past_client`, no outbound in 90 days, or within 7 days of a closing anniversary | Email |

Exclusions, applied before ranking: stage `spam` or `lost`; `discreet = 1` (these never appear automatically; Steven handles them by hand); an item for the same contact snoozed until a later date; a contact skipped under the same rule in the last 7 days.

Ranking: by priority, then by score descending, then by oldest waiting. Take the first 10. If more qualify, the Today screen says how many were left out.

Channel and consent: after choosing a channel, run the consent rules from the behaviour section. If email is not allowed, fall back to a call. If nothing is allowed, show the card with the reason and no send action.

Drafts:

- An email draft has a subject and a body of 60 to 120 words. A call item has three talking points instead of a message. A text draft is under 300 characters.
- Drafts come from Gemini as specified in the next section. If the call fails, is blocked or the budget is spent, use a fixed template for that rule and label the card "Template".
- A draft is generated when the plan is built, not when the card is opened, so Today loads instantly.

Approval and sending:

1. Steven edits if he wishes, then taps Approve and send.
2. The server re-runs the consent check, creates the `messages` row with `approved_at`, queues it in the outbox, writes an `email_out` activity and marks the item `sent`.
3. If the send fails after retries, the item reopens with the error shown.
4. Calls and texts: Steven taps Call or Copy text, then Mark done, which writes the activity. The app never sends a text.

Learning signal: store whether each draft was sent unedited, edited, skipped or redrafted. Show the monthly counts in Settings. Do not train or auto-tune anything on this in M2.

## Gemini integration

All model calls go through one module, `site/lib/ai.js`, exposing `draftMessage({ contact, rule, channel, context })`. No other file may call the Gemini API.

Configuration, all in `.env`: `GEMINI_API_KEY`, `GEMINI_MODEL`, `AI_MONTHLY_BUDGET_USD`, `AI_PRICE_INPUT_PER_MTOK`, `AI_PRICE_OUTPUT_PER_MTOK`. Choose the lowest-cost current Gemini model that follows the output format reliably, and set the two price variables from Google's current price list at build time. Do not hard-code a model name or a price.

What may be sent to Gemini, and nothing else:

- First name only.
- Interest, price range, timeline and areas as the contact entered them.
- The rule id and its plain reason.
- The contact's own last message, cut to 500 characters.
- Up to five recent activity summaries: kind, date and Steven's subject line. Never note bodies.

Never send: last name, email, phone, street address, notes, consent records, or anything about a contact with `discreet = 1`. For those, use templates.

System instruction, version `draft-v1`. Store the version with every run.

```text
You draft short, personal follow-up messages for Steven Lenz Jr., a real estate agent with Compass in Pleasanton, California. Steven reviews and sends every message himself.

Write in the first person as Steven: warm, direct, plain words, no hype, no exclamation marks, no emojis.

Rules:
- Use only the facts provided. Do not invent listings, prices, market statistics, dates, or details about the person.
- Do not give legal, tax, lending or price advice. Do not state or imply what a home is worth.
- Do not describe any neighbourhood in terms of safety, schools quality, or the kind of people who live there.
- Do not promise outcomes or use the words guarantee, best, or number one.
- Ask one clear question or propose one next step.
- Do not include a signature, a footer, or a subject line in the body.

Return JSON only: {"subject": string, "body": string} for email, {"body": string} for text, {"points": [string, string, string]} for a call.
```

Output checks, in code, before a draft is stored:

1. Valid JSON in the requested shape and within the length limits.
2. Contains no dollar amounts, percentages or street addresses that were not in the input.
3. Contains none of a blocked-phrase list: safe, safest, crime, good schools, best schools, family-friendly, exclusive, guarantee, and any protected-class term. Keep the list in one file.
4. On any failure, retry once; if it fails again, record status `blocked` and use the template.

Cost control:

- Before each call, sum `ai_runs.cost_usd` for the current month. If the next call could exceed the budget, do not call; record `over_budget` and use the template.
- After each call, compute cost from the token counts the API returns and the two price variables.
- Expected volume is about 10 drafts a day plus redrafts, roughly 400 calls a month.

Failure handling: 15-second timeout, one retry on a network error, then the template. The card must show "Template" whenever the text did not come from the model. Log every call in `ai_runs`, including failures.

Privacy: add Google as a named AI provider to the site's privacy notice before launch, and confirm in the API account settings that submitted data is not used for model training.

## Tests and acceptance criteria

Use Node's built-in test runner against a temporary database file. Mock the Gemini and email providers; no test may call a real service or touch the real database.

| # | Area | Passes when |
| --- | --- | --- |
| 1 | Regression | All forms on the public site still save a lead and show honest errors; existing admin screens still work |
| 2 | Lead to contact | A new lead creates one contact, identities, a form activity and consent rows in one transaction |
| 3 | Dedupe | A second lead with the same email, in different letter case, attaches to the same contact |
| 4 | Conflict | Email matching contact A and phone matching contact B creates a review task and merges nothing |
| 5 | Backfill | Running the migration twice leaves the same row counts; every lead has a `contact_id` |
| 6 | Merge | After a merge, all activities, deals and tasks belong to the survivor and current consent is the latest row |
| 7 | Consent | Each row of the consent table is enforced: disallowed sends return an error and create no message |
| 8 | Unsubscribe | Opening the link withdraws email marketing consent; a tampered token is rejected |
| 9 | Privacy delete | Deleting a contact removes every row that refers to them, and the export endpoint returned all of it beforehand |
| 10 | Scoring | Twelve fixed fixtures produce the expected score, band and reasons, including each override |
| 11 | Decay | The same contact scores lower after the clock advances past each recency boundary |
| 12 | Plan selection | Fixtures for each rule appear under the right rule; exclusions are honoured; at most 10 items; no duplicates on a second run |
| 13 | Approval | No `messages` row exists for an item until Approve; Approve re-checks consent |
| 14 | AI data limits | The payload sent to the mocked model contains no last name, email, phone or notes, and nothing for a discreet contact |
| 15 | AI output checks | A response with an invented price or a blocked phrase is rejected and the template is used, labelled as such |
| 16 | Budget | With spend at the cap, no model call is made and the Today banner appears |
| 17 | Security | Every new route returns 401 without a session and 403 without the header; inputs are length-limited and escaped in the UI |
| 18 | Mobile | Each screen at 375 by 740: no sideways scroll, tap targets at least 44 px, inputs at least 16 px |
| 19 | Performance | Contacts list and Today load in under 500 ms with 5,000 contacts and 50,000 activities seeded in the test database |
| 20 | Backup | The nightly job produces a file that opens and passes SQLite's integrity check |

Done means: all 20 pass, the discrepancy report is closed, and Steven has used Today for one week on real leads.

## Build order and stop gates

Work in this order. At each gate, stop, summarise what changed and what was tested, and wait for approval.

- [ ] **Step 0. Read and report.** Read the repository, run the site locally, and write the discrepancy report. **Gate A.**
- [ ] **Step 1. Safety net.** Database backup job, test harness, regression tests for the existing forms and admin.
- [ ] **Step 2. Schema.** Migrations for all new tables and seeds for pipelines and stages.
- [ ] **Step 3. Lead to contact.** Upsert in the lead pipeline, consent rows, the `/api/leads` fix, and the backfill. **Gate B:** show before and after row counts on a copy of the live database.
- [ ] **Step 4. Contacts API and screens.** List, detail, timeline, notes, calls, tags, stage, merge, export, delete.
- [ ] **Step 5. Tasks and pipeline.** API and both screens.
- [ ] **Step 6. Email.** Send from the contact record, footer, unsubscribe, consent checks. **Gate C:** M1 acceptance tests 1 to 9 and 17 to 20 pass.
- [ ] **Step 7. Installable app.** Manifest, service worker, web push for new leads, Settings screen.
- [ ] **Step 8. Scoring.** The pure function, fixtures, recalculation triggers, score on list and detail.
- [ ] **Step 9. Action plan without AI.** Selection, ranking, templates, Today screen, approve, done, snooze, skip. **Gate D:** Steven uses it with templates for two days.
- [ ] **Step 10. Gemini drafts.** The AI module, data limits, output checks, budget cap, usage screen.
- [ ] **Step 11. Hardening.** Full test pass, mobile pass, privacy notice update. **Gate E:** release.

Out of scope for this build. Do not start any of these:

- SMS sending or receiving, and any automated messaging.
- IDX or MLS data, listing alerts, home value reports, CMAs.
- Gmail or calendar sync; inbound email capture.
- Multiple users, roles or teams.
- Changes to the public site's design, content or statistics.
- The site chat assistant, beyond routing its lead form through the main pipeline.
- Content, social or ad tools.
- Third-party data enrichment or life-event data.
