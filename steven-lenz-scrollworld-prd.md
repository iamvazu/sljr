# PRD — "See Real Estate Through a New Lenz" Scroll-World Landing Page

**Client:** Steven Lenz Jr. · Luxury REALTOR® — Sports and Entertainment · Compass · CA DRE# 01989811 · (925) 998-9711
**Offices:** Pleasanton & Walnut Creek, CA · **Markets:** Tri-Valley (Pleasanton, Danville, Alamo, San Ramon, Livermore, Dublin), East Bay (Walnut Creek, Lafayette, Orinda, Oakland, Piedmont)
**Build environment:** Google Antigravity IDE (agent-first) + `oso95/scroll-world` skill
**Companion docs:** `prompts.md` (all generation prompts) · `steven-lenz-ai-team.md` (lead-routing back end) · `steven-lenz-pitch-deck.md`
**Status:** Ready for execution · **Version:** 1.0 · **Date:** 2026-11-12

---

## 0. Read this first: what scroll-world actually is

`oso95/scroll-world` is **not** a live WebGL/Three.js world. It is an agent skill that:

1. Interviews you (subject, brand kit, art direction, camera style, mobile yes/no, budget).
2. Generates **scene stills** (Higgsfield `gpt_image_2`, or Codex `image_gen`).
3. Generates a **chain of camera-flight video clips** (Seedance 2.0, billed through **Monid** by default, with Higgsfield credits as the fallback) whose seams are frame-identical.
4. Encodes the clips for scrubbing (ffmpeg) and wires a **vanilla-JS scrub engine** (`references/scrub-engine.js`, `mountScrollWorld()`), where scroll position drives `video.currentTime`.

The "3D" is pre-rendered cinematic video. That is the right fit here: it looks like an Architectural Digest fly-through, runs on any device, and needs no GPU. All interactive content (headshot, listings, testimonials, form, disclosures) lives in **real HTML layered over the video**. That HTML is what makes the page accurate, accessible, indexable, and compliant.

The skill already provides these, and they don't need rebuilding: blob loading, lazy prefetch of nearby clips, seam crossfades, the `prefers-reduced-motion` fallback to stills, coarse-pointer/≤860px mobile detection, seek coalescing, iOS priming, safe-area CSS, the section nav, and per-section `scroll`/`linger` pacing.

## 1. Goals, non-goals, success metrics

### Goals
1. Replace the template site with a signature, memorable landing experience that positions Steven as *the* Tri-Valley agent for discreet, high-touch, sports & entertainment clientele.
2. Turn visits into qualified conversations: one primary CTA ("Start a private conversation") and one secondary ("Get a home valuation").
3. Route every lead to the AI back office (`steven-lenz-ai-team.md`) within 60 seconds, with consent records.
4. Stay fully compliant with California DRE advertising rules, Compass brand and disclosure rules, TCPA/CAN-SPAM, CCPA/CPRA, fair housing, and WCAG 2.2 AA.

### Non-goals (v1)
- IDX search inside the scroll page. Link out to Steven's Compass agent page and Compass search; add IDX in v2 only through a broker-approved IDX vendor.
- A blog or CMS. Static content in v1; JSON content files make edits easy.
- Live 3D (WebGL) interactivity.
- AI-generated depictions of real listings, of Steven, or of any real person.

### Success metrics (first 90 days after launch)
| Metric | Target |
|---|---|
| Form submit rate (unique visitors → leads) | ≥ 1.5% |
| Lead → personal reply sent | Median ≤ 10 min during 8am–8pm PT |
| Scroll depth to Scene 6 | ≥ 35% of sessions |
| LCP (poster still), mobile 4G | ≤ 2.5 s |
| CLS | ≤ 0.05 |
| INP | ≤ 200 ms |
| Accessibility | 0 axe-core critical/serious violations |
| Bounce rate on mobile | ≤ 55% |

## 2. Facts to confirm with Steven before launch

Public data I found and things the brief asserts that need sign-off. **Do not publish any of these until confirmed in writing:**

| Item | Status | Action |
|---|---|---|
| CA DRE# 01989811 | Matches his Homes.com and Compass profiles | ✅ Display |
| Title "Luxury REALTOR® — Sports and Entertainment" | Using "Sports & Entertainment" implies membership in the **Compass Sports & Entertainment Division**, a defined Compass program | Confirm membership, or use "serving sports & entertainment clients" |
| Athletic background | One public bio says semi-pro; another says he played "up to NBA G League" | Use only the wording Steven approves. Don't use NBA/G League marks or logos |
| "Luxury" positioning | His Homes.com profile shows 15 closed sales over the prior 5 years, $250K–$785K range | Frame as *luxury-level service and access*. Feature only transactions he actually handled, labeled by role (listing/buyer/co-list). See NAR Code Art. 12 |
| Featured properties (Danville, Oakland, Livermore) | Need real photos, addresses or neighborhood labels, his role, and status | Get MLS photo permission or use his own photography. Note the brokerage of record if it was not Compass |
| Testimonials | His Compass profile shows several client reviews (e.g., a 2020 Danville primary-home purchase) | Use verbatim, with the reviewer's written permission and display name as the reviewer chooses. No edits that change meaning |
| Compass broker info for the footer | Required on first-point-of-contact material | Get Compass's current required disclaimer block plus the responsible broker's name and DRE license # from Compass marketing |
| Headshot and personal photos | Needed for Scene 2 overlay | Real photography only, no AI likeness |
| Domain and analytics | TBD | Recommend `stevenlenz.com` or `lenzrealestate.com`; Plausible or GA4 with consent mode |

## 3. Architecture

```
                         ┌───────────────────────────── Static host (Vercel / Cloudflare Pages / Netlify)
Visitor ─► index.html ───┤  /assets/still/*.webp   (posters, reduced-motion fallbacks)
           (semantic     │  /assets/vid/*.mp4      (desktop 1080p legs, -g 8)
            HTML + SEO)  │  /assets/vid/*-m.mp4    (mobile 9:16 legs, 720w, -g 4)
           scrub-engine  │  /js/scroll-world.js    (oso95 engine, unmodified + config)
                         │  /js/overlays.js        (cards, testimonials, form, a11y)
                         └─ /api/lead  ─► serverless function
                                            ├─ validate + Turnstile + honeypot + rate limit
                                            ├─ store lead + consent record (Google Sheet via service account, or KV/DB)
                                            ├─ send pre-approved auto-acknowledgment email (Resend/Postmark/SendGrid)
                                            ├─ notify Steven (email + optional push)
                                            └─ POST to OpenMausBot webhook (Bearer) ─► Follow-Up Concierge
                                                 https://desk.<domain>/hooks/wh_…    (drafts reply → approval card)
```

**Dual chain:** desktop chain (16:9, 1080p) plus mobile chain (native 9:16, 720w). The engine picks the chain automatically by `(hover:none) and (pointer:coarse)` or `max-width: 860px`.
**Lazy loading:** the engine prefetches only nearby clips. Posters are `<img loading="eager" fetchpriority="high">` for Scene 1 and lazy for the rest.
**Reduced motion:** `prefers-reduced-motion: reduce` → stills only, no video, no particles (built in). Also add a visible **"Pause motion / View as page"** toggle that sets a `localStorage` flag (wrapped in try/catch) and re-mounts in still mode.
**No-JS / SEO:** all copy, the listings, testimonials, the form, and the disclosures exist as semantic HTML in the document, so they work without the engine.

## 4. Repository layout (Antigravity workspace)

```
lenz-scrollworld/
├─ .agent/skills/scroll-world/        # copied from oso95/scroll-world/skills/scroll-world (see §12)
├─ brief/
│  ├─ steven-lenz-scrollworld-prd.md  # this file
│  └─ prompts.md
├─ gen/                               # generation workspace (gitignored outputs)
│  ├─ still_1.txt … still_6.txt       # from prompts.md
│  ├─ leg_1.txt … leg_6.txt
│  ├─ still_1m.txt … (mobile canvases)
│  └─ out/                            # raw PNG/MP4, last-frame PNGs, job JSON
├─ site/
│  ├─ index.html
│  ├─ assets/still/  assets/vid/  assets/img/ (real photos)  assets/brand/ (Compass-approved logo files)
│  ├─ js/scroll-world.js  js/world.config.js  js/overlays.js
│  ├─ css/theme.css
│  ├─ content/listings.json  content/testimonials.json  content/compliance.json
│  ├─ privacy.html  accessibility.html  terms.html
│  └─ api/lead.(ts|js)                # serverless function
└─ qa/  (seam frame diffs, Lighthouse reports, axe reports, device videos)
```

## 5. Brand system

| Token | Hex | Use |
|---|---|---|
| `midnight` | `#0D1117` | Page background (`--sw-bg`). Dark reads premium and matches full-bleed photoreal |
| `bone` | `#F3EEE6` | Primary text (`--sw-ink`) |
| `fog` | `#A9B4C2` | Secondary text (`--sw-ink-soft`) |
| `golden-hour` | `#D8A55A` | Primary accent (`--sw-accent`), CTAs, lens ring |
| `hardwood` | `#B07440` | Scene 2 accent |
| `vineyard` | `#6E7F55` | Scene 4 accent (Livermore wine country) |
| `twilight` | `#3B4A6B` | Scene 6 accent |

- **Type:** display = a high-contrast serif (e.g., *Canela*, *Ogg*, or free *Fraunces*); body = a clean grotesk (*Inter*, *Söhne*). Check licensing before use.
- **Compass marks:** use only official Compass logo files and lockups from Compass marketing, per Compass brand guidelines. Never AI-generate or redraw them. Every generation prompt specifies "no text, no logos".
- **Voice:** confident, warm, discreet; coach energy without sports clichés. Short sentences.
- **Motif:** the lens (aperture rings, focus pulls, bokeh). "New Lenz" equals clarity.

## 6. Scroll-world intake: pre-filled answers for the skill's Step 1

Paste this block when the skill interviews you. It saves a round-trip.

```
SUBJECT: Steven Lenz Jr., Compass luxury REALTOR® serving the Tri-Valley & East Bay, specializing in
  discreet service for sports & entertainment clients. Pitch: "See Real Estate Through a New Lenz" —
  a single continuous camera flight through one imagined Tri-Valley estate, room by room.
BRAND_NAME: Steven Lenz Jr. | Compass
PALETTE: midnight #0D1117 (page bg), bone #F3EEE6, golden-hour #D8A55A (accent), hardwood #B07440,
  vineyard #6E7F55, twilight #3B4A6B
TONE: discreet, cinematic, warm
STYLE: Photoreal architectural (full-bleed, no floating islands, no knockout). Preamble in prompts.md.
CAMERA: "One continuous walkthrough" → Architecture A (sequential legs, no connectors), with an
  expressive mid-leg move per scene and the motion-handoff contract verbatim.
MOBILE: Yes — native 9:16 portrait chain (≈2× video spend; approved in budget §14).
VIDEO_TIER: seedance-2.0 via Monid. Previz the full chain at 480p first, approve, then final at 1080p.
STILLS_SOURCE: Higgsfield gpt_image_2 (or Codex image_gen if the CLI is present — one source for all 6).
SECTIONS: 6 — see PRD §7 (ids: lens, roots, concierge, portfolio, lounge, terrace)
```

**Why Architecture A:** the skill recommends it for grounded/photoreal real estate. Architecture B's aerial "pull out and hop" reverses camera direction at every seam, which reads as a stutter in realism. The device that makes A work here: **all six scenes are rooms of one imagined estate**, so the camera can always glide forward through a doorway into the next space, and the light moves from golden hour to dusk to twilight across the film.

## 7. Scene specifications

Copy limits per the engine: eyebrow ≤ 4 words, title ≤ 8 words, body ≤ 1 sentence, ≤ 3 tags.

### Scene 1 — The Lens Portal (Hero) · `id: lens`
- **Visual:** a monumental architectural camera lens (brushed brass and glass, aperture blades) set in a hillside clearing. Through its glass, a golden-hour Tri-Valley estate with oaks, vineyards, and the Mt. Diablo silhouette. The leg pushes through the opening aperture into the estate's motor court.
- **Copy:** eyebrow `Tri-Valley · East Bay` · title `See Real Estate Through a New Lenz.` · body `Discreet, data-sharp representation for the moments that matter most.` · tags `Pleasanton` `Walnut Creek` `Compass`
- **Overlay HTML:** Compass-approved logo lockup (top-left via `brand`), click-to-call `(925) 998-9711` (`tel:+19259989711`), "Start a private conversation" anchor to `#terrace`.
- **Pacing:** `scroll: 1.4`, `linger: 0.35` · **Accent:** golden-hour

### Scene 2 — The Hardwood & Roots (Meet Steven) · `id: roots`
- **Visual:** the estate's private indoor sport court. Warm maple hardwood, clerestory light, a single ball resting at center court, and a vintage gym bench with a folded towel and whistle (coach's ethos). Through the windows, a suburban-Pleasanton-style evening. No team logos, no jersey names, no people.
- **Copy:** eyebrow `Meet Steven` · title `Tri-Valley roots. Coach's discipline.` · body `Raised in Pleasanton, shaped by Bay Area basketball and years coaching high-school players — Steven brings preparation, teamwork, and follow-through to every deal.` · tags `Amador Valley alum` `HS coach` `Tri-Valley native` *(confirm each with Steven)*
- **Overlay HTML:** a **real headshot** in a circular "lens" frame; a 3-line bio; a "Read my story" disclosure (`<details>`) with the longer bio.
- **Pacing:** `scroll: 1.5`, `linger: 0.45` · **Accent:** hardwood

### Scene 3 — The Compass Concierge Studio (Services) · `id: concierge`
- **Visual:** a gallery-like design studio wing. On one side, an unstaged, bare living room; across a glass partition, the same room beautifully staged. Material boards, swatches, a walnut worktable, and a discreet vault-style door (Private Exclusives). A cinematic low lateral track runs along the partition: *before → after*.
- **Copy:** eyebrow `Services` · title `Prepare, position, and sell — privately if you prefer.` · body `Compass Concierge can front the cost of pre-sale improvements, while Private Exclusives and custom search open doors before the public market does.` · tags `Compass Concierge` `Private Exclusives` `Valuations`
- **Overlay HTML:** three service cards (Concierge / Private Exclusives / Home Valuation). Each opens a modal with plain-language detail and the standard note "Program terms and eligibility apply; ask for details." Valuation CTA → `#terrace` with `interest=selling` preselected.
- **Pacing:** `scroll: 1.6`, `linger: 0.5` · **Accent:** golden-hour

### Scene 4 — The Tri-Valley Portfolio Gallery (Featured Sales) · `id: portfolio`
- **Visual:** a long gallery hall with three **empty**, softly lit floating frames angled toward camera (left, center, right), plus museum benches and a polished concrete floor. A slow half-orbit around the center frame, then onward. **The frames are left empty on purpose:** real property photos are placed in HTML over them, so no AI-invented house is presented as a real listing.
- **Copy:** eyebrow `Featured Work` · title `Danville. Oakland. Livermore.` · body `A selection of homes Steven has represented across the Tri-Valley and East Bay.` · tags `Danville` `Oakland` `Livermore`
- **Overlay HTML:** three listing cards from `content/listings.json` with a real photo, city/neighborhood, beds/baths/sqft, status (Sold/Active/Pending), **Steven's role** (Represented Buyer/Seller), the brokerage of record if not Compass, MLS photo credit, and a link to the Compass listing page if active.
- **Pacing:** `scroll: 1.8`, `linger: 0.55` · **Accent:** vineyard

### Scene 5 — The VIP Lounge (Sports & Entertainment + Testimonials) · `id: lounge`
- **Visual:** a private members-style lounge with smoked-oak paneling, low leather seating, a backlit bar shelf, glass trophy-style display niches holding abstract sculptural objects (no trophies with marks), and a view wall to the dusk sky. Camera push-in toward the lounge chair and coffee table, then ease back.
- **Copy:** eyebrow `Sports & Entertainment` · title `Privacy is the first amenity.` · body `Relocations on tight timelines, NDA-friendly process, and a network that moves quietly.` · tags `Relocation` `Discretion` `Off-market access`
- **Overlay HTML:** a testimonials carousel from `content/testimonials.json` (verbatim, permissioned; reviewer display name; date; source "Compass profile"; ARIA live region off; pause button). A "Relocating for a new team or role?" mini-CTA → `#terrace` with `segment=sports_entertainment`. Never name athlete clients without written consent.
- **Pacing:** `scroll: 1.6`, `linger: 0.5` · **Accent:** golden-hour

### Scene 6 — Let's Connect Terrace (Lead Capture & Compliance) · `id: terrace`
- **Visual:** a twilight infinity terrace with a fire table, string of warm lights, and a panorama of the Tri-Valley floor with town lights and the Mt. Diablo ridgeline. The camera rises gently (crane-up) and settles on the horizon, leaving clear negative space center-left for the form.
- **Copy:** eyebrow `Let's Connect` · title `Your next move, in focus.` · body `Tell Steven what you're looking for — he replies personally.` · CTA primary `Start a private conversation` (focuses form) · secondary `Call (925) 998-9711`
- **Overlay HTML:** the lead form (§10) and the full compliance footer (§11).
- **Pacing:** `scroll: 1.2`, `linger: 0.6` (the camera settles while the form is in view) · **Accent:** twilight

## 8. Engine configuration (`site/js/world.config.js`)

```js
mountScrollWorld(document.getElementById('world'), {
  brand: { name: 'Steven Lenz Jr. | Compass', href: '#top' },
  diveScroll: 1.4,
  connScroll: 0.9,        // unused in arch A (no connectors) but harmless
  crossfade: 0.08,        // arch A: small seam dissolve
  hint: 'Scroll to look closer',
  nav: true,
  atmosphere: false,      // photoreal: no particles
  sections: [
    { id:'lens', label:'Home', accent:'#D8A55A', scroll:1.4, linger:0.35,
      still:'assets/still/lens.webp', stillMobile:'assets/still/lens-m.webp',
      clip:'assets/vid/lens.mp4', clipMobile:'assets/vid/lens-m.mp4',
      eyebrow:'Tri-Valley · East Bay', title:'See Real Estate Through a New Lenz.',
      body:'Discreet, data-sharp representation for the moments that matter most.',
      tags:['Pleasanton','Walnut Creek','Compass'] },
    { id:'roots', label:'Meet Steven', accent:'#B07440', scroll:1.5, linger:0.45,
      still:'assets/still/roots.webp', stillMobile:'assets/still/roots-m.webp',
      clip:'assets/vid/roots.mp4', clipMobile:'assets/vid/roots-m.mp4',
      eyebrow:'Meet Steven', title:'Tri-Valley roots. Coach’s discipline.',
      body:'Raised in Pleasanton, shaped by Bay Area basketball and years coaching high-school players.',
      tags:['Tri-Valley native','HS coach'] },
    { id:'concierge', label:'Services', accent:'#D8A55A', scroll:1.6, linger:0.5,
      still:'assets/still/concierge.webp', stillMobile:'assets/still/concierge-m.webp',
      clip:'assets/vid/concierge.mp4', clipMobile:'assets/vid/concierge-m.mp4',
      eyebrow:'Services', title:'Prepare, position, and sell — privately if you prefer.',
      body:'Compass Concierge, Private Exclusives, and custom search, under one roof.',
      tags:['Compass Concierge','Private Exclusives','Valuations'] },
    { id:'portfolio', label:'Featured', accent:'#6E7F55', scroll:1.8, linger:0.55,
      still:'assets/still/portfolio.webp', stillMobile:'assets/still/portfolio-m.webp',
      clip:'assets/vid/portfolio.mp4', clipMobile:'assets/vid/portfolio-m.mp4',
      eyebrow:'Featured Work', title:'Danville. Oakland. Livermore.',
      body:'A selection of homes Steven has represented across the Tri-Valley and East Bay.',
      tags:['Danville','Oakland','Livermore'] },
    { id:'lounge', label:'Sports & Entertainment', accent:'#D8A55A', scroll:1.6, linger:0.5,
      still:'assets/still/lounge.webp', stillMobile:'assets/still/lounge-m.webp',
      clip:'assets/vid/lounge.mp4', clipMobile:'assets/vid/lounge-m.mp4',
      eyebrow:'Sports & Entertainment', title:'Privacy is the first amenity.',
      body:'Relocations on tight timelines, NDA-friendly process, and a network that moves quietly.',
      tags:['Relocation','Discretion','Off-market access'] },
    { id:'terrace', label:'Connect', accent:'#3B4A6B', scroll:1.2, linger:0.6,
      still:'assets/still/terrace.webp', stillMobile:'assets/still/terrace-m.webp',
      clip:'assets/vid/terrace.mp4', clipMobile:'assets/vid/terrace-m.mp4',
      eyebrow:"Let's Connect", title:'Your next move, in focus.',
      body:'Tell Steven what you’re looking for — he replies personally.',
      cta:{ primary:{label:'Start a private conversation', href:'#lead-form'},
            secondary:{label:'Call (925) 998-9711', href:'tel:+19259989711'} } }
  ],
  connectors: [null, null, null, null, null],        // arch A: legs are the journey
  connectorsMobile: [null, null, null, null, null]
});
```

Theme (`css/theme.css`): `--sw-bg:#0D1117; --sw-ink:#F3EEE6; --sw-ink-soft:#A9B4C2; --sw-accent:#D8A55A; --sw-font-display:'Fraunces',serif; --sw-font-body:'Inter',system-ui,sans-serif;`

> Confirm against the engine version you install: check the `USAGE` header in `scrub-engine.js` for the field names (`connectors` length must equal `sections.length - 1`; `null` entries are allowed and crossfade the seam directly).

## 9. Overlay layer requirements (`overlays.js`)

- Overlays are positioned per section using the engine's section ids (`IntersectionObserver` on the engine's section anchors, or the engine's progress events if exposed). Overlays must never block scroll: use `pointer-events:auto` only on the interactive card itself.
- **Accessibility:** every overlay is reachable by keyboard in DOM order. Visible focus rings (golden-hour, 3px). Contrast ≥ 4.5:1 over video, guaranteed with a translucent midnight scrim behind text. The video is `aria-hidden="true"`; the scene copy is real text. Respect `prefers-reduced-motion` in the carousel too.
- **Skip link:** "Skip to contact form" as the first focusable element.
- **"View as page" toggle:** renders all six sections as a conventional stacked page with stills. This is the accessible alternative experience, linked from `accessibility.html`.
- **Listings JSON schema:**

```json
{ "id":"danville-1", "city":"Danville", "neighborhood":"(optional)", "photo":"assets/img/danville-1.jpg",
  "photo_credit":"Photo: (photographer/MLS credit)", "beds":5, "baths":4.5, "sqft":4820,
  "status":"Sold", "role":"Represented Buyer", "brokerage_of_record":"Compass",
  "price_display":"(optional — only if public & approved)", "date":"2025-06", "url":"(Compass listing URL if active)" }
```

- **Testimonials JSON schema:** `{ "quote":"verbatim text", "name":"display name as approved", "context":"Buyer · Danville · 2020", "source":"Compass profile", "permission_on_file":true }`. The build fails if `permission_on_file` is false (a CI check).

## 10. Lead capture and webhook routing

### Form fields (`#lead-form`)
| Field | Type | Required | Notes |
|---|---|---|---|
| Name | text | ✓ | `autocomplete="name"` |
| Email | email | ✓ | |
| Phone | tel | — | Required only if the SMS consent box is checked |
| I'm interested in | select | ✓ | Buying · Selling · Both · Relocating · Investing · Something else |
| Areas | multi-select chips | — | Pleasanton, Danville, Alamo, Livermore, Walnut Creek, Oakland, San Ramon, Other |
| Price range | select | — | <$1.5M · $1.5–2.5M · $2.5–5M · $5M+ |
| Timeline | select | — | 0–3 mo · 3–6 mo · 6–12 mo · Exploring |
| Message | textarea | — | 1,000 chars max |
| Discreet inquiry | checkbox | — | Sets `segment=sports_entertainment` |
| Email consent | checkbox (unchecked) | — | |
| SMS consent | checkbox (unchecked) | — | Separate; **not** a condition of contact |
| Turnstile + honeypot | hidden | ✓ | |

**Consent copy (version `2026-11-v1`; have Compass compliance or counsel approve the final text):**
> ☐ Email me listings, market updates, and follow-ups. Unsubscribe anytime.
> ☐ I agree to receive calls and text messages from Steven Lenz Jr. of Compass at the number provided, including messages sent using automated technology, about my real estate inquiry. Consent is not a condition of any purchase or service. Msg & data rates may apply. Reply STOP to opt out.
> By submitting, you agree to the [Privacy Notice](/privacy.html), including how we use AI tools to help Steven respond.

### `/api/lead` serverless function (spec)
1. Reject if the honeypot is filled, Turnstile fails, or the IP exceeds 5 submissions/hour.
2. Validate and normalize (E.164 phone, lowercase email, length caps). Strip HTML.
3. Build the payload exactly as in `steven-lenz-ai-team.md` §6 (adds `lead_id`, `received_at`, `consent_text_version`, `consent_timestamp`, `source_page`, `scene`, `utm`).
4. **Persist first** (Google Sheet `Lead Log` via service account, or KV/DB). The lead must survive if the bot server is down.
5. Send the **pre-approved auto-acknowledgment** email from Steven's address (transactional provider, SPF/DKIM/DMARC aligned):
   *"Thanks, {first_name} — I got your note and I'll personally follow up shortly. If it's urgent, call or text me at (925) 998-9711. — Steven Lenz Jr., Compass, DRE# 01989811"* plus the broker disclaimer and a physical address.
6. Notify Steven by email (subject `New lead — {interest} — {areas}`).
7. `POST` to `OMB_LEAD_WEBHOOK_URL` with `Authorization: Bearer ${OMB_LEAD_WEBHOOK_TOKEN}`, a 5 s timeout, and 3 retries with exponential backoff. On final failure, flag the Sheet row `bot_delivery=failed` and alert Steven.
8. Return `200 {ok:true}`. The UI swaps the form for a confirmation panel and moves focus to its heading.

Secrets live only in host environment variables. No PII goes to analytics: send only `lead_submitted` with `interest` and `scene`.

## 11. Compliance requirements (launch-blocking)

| Requirement | Implementation |
|---|---|
| **CA DRE — license disclosure** (B&P §10140.6; 10 CCR §2773) | Name + "CA DRE# 01989811" in the hero overlay and footer, on the form panel, and in every email |
| **Responsible broker identification** | Compass name, plus broker license # and Compass's required disclaimer, in the footer (text from Compass) |
| **Equal Housing Opportunity** | EHO logo + text in the footer |
| **Compass brand rules** | Official logo files only; Compass marketing review before launch |
| **Advertising accuracy / NAR Art. 12** | Listing cards show Steven's role and brokerage of record; no claiming others' sales; no unverified superlatives ("#1", "top agent") |
| **AI imagery disclosure** | Footer note: "Scene imagery is AI-generated artistic rendering and does not depict any specific property." Featured-property photos are real and credited |
| **Testimonials** | Verbatim, permissioned, dated, sourced; CI check |
| **Trademarks** | No NBA/team logos, names on jerseys, or league marks in imagery |
| **TCPA** | Separate, unchecked SMS consent; consent version + timestamp stored; STOP honored; bots never text |
| **CAN-SPAM** | Physical address, unsubscribe link in marketing email |
| **CCPA/CPRA** | Privacy Notice with a notice at collection, categories, retention, the AI-tools disclosure, and a deletion/access request path. Cookie banner if non-essential cookies are used |
| **CA bot disclosure** (B&P §17941) | No on-site chatbot in v1. If one is added later, it must disclose that it is a bot |
| **Fair housing** | Copy describes properties and amenities, never people. No "perfect for families"-type phrasing. School info only links to official sources |
| **WCAG 2.2 AA** | §9 requirements; `accessibility.html` with contact for accommodations |

## 12. Antigravity execution plan

### Setup
1. Install Antigravity; open the empty `lenz-scrollworld/` folder as the workspace.
2. Install the skill:
   - Preferred: `npx skills add oso95/scroll-world` (pick Antigravity if listed; the skills CLI targets 20+ agents).
   - Fallback: `git clone https://github.com/oso95/scroll-world` and copy `skills/scroll-world/` into the workspace (e.g., `.agent/skills/scroll-world/`). Tell the agent: "Follow `.agent/skills/scroll-world/SKILL.md` exactly."
3. Install `ffmpeg`/`ffprobe`, the **Higgsfield CLI** (`higgsfield auth login`, then `higgsfield workspace set <id>`), and the **Monid CLI** (`monid keys list`, `monid balance`). Optional: the Codex CLI for subscription-billed stills.
4. Put `steven-lenz-scrollworld-prd.md` and `prompts.md` in `brief/`.

### Agent tasks (paste each into Antigravity's Agent Manager; each has a stop gate)

| # | Task prompt (abridged) | Gate / acceptance |
|---|---|---|
| T1 | "Read `brief/*.md` and `.agent/skills/scroll-world/SKILL.md`. Run Step 0 bootstrap checks and report CLI versions, balances, and the cost estimate for 6 stills + a 6-leg arch-A chain, desktop + mobile, previz 480p then final 1080p, +15% re-roll headroom. **Do not render.**" | Steven/you approve the budget |
| T2 | "Write `gen/still_1..6.txt` and `gen/still_1m..6m.txt` from `prompts.md` with the byte-identical preamble. Render the 6 desktop stills (3:2, 2k, high). Show a contact sheet." | All 6 read as one estate, one light progression; no text or logos; re-roll any off-style still |
| T3 | "Build the 16:9 start canvas for leg 1. Render legs 1→6 **sequentially at 480p previz** per arch A: each leg's start-image = the previous leg's ACTUAL last frame, no end-image, prompts from `prompts.md`. After each leg, show me its last frame before continuing." | Every last frame reads as a calm forward drift; the angle has not flipped; the seams look continuous |
| T4 | "Assemble a previz page with the engine and `world.config.js` (480p clips). Serve locally and record a scroll-through video." | The journey is approved. This is the cheap moment to change scenes |
| T5 | "Re-render legs 1→6 at 1080p with the same prompts and seeds where supported. Then render the native 9:16 mobile chain per pipeline §6b." | Seams pass the skill's Step 8 QA on both chains |
| T6 | "Encode per Step 6: desktop crf≈20, `-g 8`, `+faststart`, no audio; mobile 720w, `-g 4`, crf 23. Export posters (`.webp`) from each clip's first frame." | ffprobe report attached; total desktop video ≤ ~45 MB, mobile ≤ ~20 MB (tune crf if over) |
| T7 | "Build `site/` per PRD §3–§11: semantic HTML first, the engine mount, overlays, content JSON, form, `/api/lead`, privacy, accessibility, terms." | The no-JS page is complete and readable |
| T8 | "Wire `/api/lead` to the Sheet, the email provider, and the OpenMausBot webhook using env vars. Add the CI checks: testimonial permission, required compliance strings present, no secrets in client bundles." | An end-to-end test lead reaches the Concierge approval card in ≤ 5 min |
| T9 | "QA per §13 and produce `qa/report.md`." | All launch gates green |

Antigravity tips: keep a **planning** artifact per task; require the agent to show renders (artifacts) before spending more. Never let it run `higgsfield auth login` itself (interactive OAuth).

## 13. QA plan (launch gates)

- **Seams:** the skill's Step 8. Scrub each seam forward and backward at slow and fast speeds on Chrome, Safari, and Firefox desktop, plus iOS Safari and Android Chrome. Judge by composition; no visible pop.
- **Mobile:** posters match the portrait clips' first frames. No blank first scene on iOS. URL-bar resize causes no jump.
- **Reduced motion:** OS setting on → stills only, all copy and overlays intact. The "View as page" toggle works.
- **Performance:** Lighthouse mobile ≥ 85 Performance, ≥ 95 Accessibility/Best Practices/SEO. LCP image = Scene 1 poster.
- **Accessibility:** axe-core zero critical/serious; keyboard-only run-through to form submission; VoiceOver + NVDA smoke test.
- **Lead flow:** 10 test submissions, including a failure-injected webhook. All rows persist; auto-ack arrives; the Concierge drafts.
- **Compliance:** a checklist sign-off by Steven and Compass marketing/compliance (screenshot each footer and disclosure).
- **Content:** every fact in §2 is confirmed in writing.

## 14. Budget and timeline

**Generation hard costs (estimates from the skill's published measurements; recompute in T1):**
- Stills: 6 desktop + 6 mobile canvases. Higgsfield credits (≈15 credits/still observed), or $0 extra via Codex.
- Video via Monid, Seedance 2.0: the skill measured roughly $2.99 per 8 s 1080p clip and $0.28–0.35 per 480p clip. For 6 legs: previz ≈ $2–3; final desktop ≈ $18; native mobile chain ≈ $18; re-rolls (photoreal interiors trip Seedance's content filter; budget ~1–2 extra per leg) ≈ $15–30. **Plan on $60–90 total for video.**
- Hosting: $0–20/month. Email provider: free tier usually suffices. Turnstile: free.

**Timeline (one builder + Antigravity):**
| Day | Milestone |
|---|---|
| 1 | Discovery call; §2 confirmations requested; assets collected (headshot, listing photos, testimonials, Compass disclaimer) |
| 2 | T1–T2 stills approved |
| 3 | T3–T4 previz journey approved by Steven |
| 4–5 | T5–T6 final chains and encodes |
| 6–7 | T7–T8 site, overlays, form, webhook |
| 8 | T9 QA + compliance review |
| 9–10 | Fixes, Compass marketing sign-off, DNS cutover, launch |

## 15. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Seedance content filter rejects interior legs | Re-roll with the softened variants in `prompts.md`; the sanctioned single-clip fallback is `kling3_0` via Higgsfield |
| A seam "pop" | Strict actual-last-frame handoff; eyeball each last frame; null connector + crossfade as last resort |
| Heavy video on mobile | Native 9:16 720w chain, `-g 4`, lazy prefetch; a stills-only fallback for Save-Data (`navigator.connection.saveData`) |
| SEO thinness | Full semantic HTML copy, JSON-LD `RealEstateAgent` (name, telephone, areaServed, memberOf Compass), descriptive alt text |
| Brand/compliance rejection | Early Compass marketing review of the previz (Day 3) and the footer text |
| Misrepresenting experience | §2 confirmations; role labels on listings; no superlatives |
| Model/provider churn (Monid catalog, Higgsfield models) | T1 re-checks model capability per the skill; previz on the same endpoint as final |
