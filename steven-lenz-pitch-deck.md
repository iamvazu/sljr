# Pitch Deck and Demo Script — "See Real Estate Through a New Lenz"

**Audience:** Steven Lenz Jr., Luxury REALTOR® — Sports and Entertainment, Compass (CA DRE# 01989811)
**Format:** 30-minute meeting (Zoom or in person at the Pleasanton or Walnut Creek office): 10 min deck, 12 min live demo, 8 min Q&A and close
**Offer:** (A) a 3D scroll-world website rebuild plus (B) a four-bot AI back office with human-approval controls
**Companion docs:** `steven-lenz-scrollworld-prd.md` · `prompts.md` · `steven-lenz-ai-team.md`

---

## Before the meeting (prep checklist)

- [ ] **Build the previz (480p) of at least Scenes 1–2.** It costs a few dollars on Monid. Nothing sells this like his own tagline flying through a lens on his phone.
- [ ] Run the AI team on a test VPS with **sample data**: one forwarded public listing alert, a fake lead via `curl`, and one shorthand note. Screen-record a backup in case the Wi-Fi fails.
- [ ] Re-read his Compass profile and current site. Bring 2–3 specific observations, not generic criticism.
- [ ] Note his public track record (Homes.com shows 15 closed sales over the prior five years in a $250K–$785K range). **Don't bring this up as a weakness.** Use it to frame the system as the infrastructure for *moving up-market*, which is exactly what his "Luxury" and "Sports & Entertainment" positioning is reaching for.
- [ ] Bring the **"facts to confirm" list** (PRD §2) as a printed one-pager. It signals rigor and protects him.
- [ ] Set your pricing (see Slide 11 for a cost basis and illustrative structure).

---

## Deck outline (12 slides)

### Slide 1 — Title
**"See Real Estate Through a New Lenz."** A website experience and an AI back office built for Steven Lenz Jr.
*Visual:* a still from Scene 1 (the lens portal, golden hour).
**Talk track (20 s):** "Your tagline is already a visual idea. We turned it into the experience."

### Slide 2 — The moment you're in
- The Tri-Valley's high end is a relationship market, and much of the best inventory moves quietly (Private Exclusives, coming-soon, pocket networks).
- Sports & entertainment clients choose on **discretion, speed, and polish**, and they size you up online before they ever call.
- Agent websites look alike: same template, same hero video, same contact form.
**Talk track:** "When a GM's assistant or a player's business manager Googles you, what do they see in the first five seconds?"

### Slide 3 — What we heard (fill in from discovery)
Three to four bullets, in Steven's words where possible: his goals for the next 12 months, the client he wants more of, and where his time leaks (follow-up, comps at night, chasing alerts).

### Slide 4 — The solution in one picture
Two halves:
- **Front of house:** a cinematic scroll-world site, six scenes, one continuous flight through one estate.
- **Back of house:** four AI bots that scout, watch, price, and follow up. **Nothing goes out without your tap.**

### Slide 5 — The six-scene journey
A storyboard strip of six stills with one line each:
1. **The Lens Portal:** the brand promise
2. **The Hardwood & Roots:** who you are (Pleasanton native, hoops, coach)
3. **The Concierge Studio:** what you do (Compass Concierge, Private Exclusives, valuations)
4. **The Portfolio Gallery:** proof (real, credited properties)
5. **The VIP Lounge:** sports & entertainment discretion, plus testimonials
6. **The Let's Connect Terrace:** the conversation starts here (form + compliance)
**Talk track:** "It's one estate, room by room, from golden hour to twilight. Visitors don't scroll a page; they take a tour of you."

### Slide 6 — Built right, not just pretty
- Works on every phone: a native vertical version, not a crop.
- Accessible: respects reduced-motion settings, full keyboard and screen-reader support, and a "view as page" mode.
- Findable: all copy is real text for Google, with structured data as a real estate agent.
- Fast: the first frame is a still that loads instantly; video streams in behind it.
- **Honest:** your listings are real photos with your role labeled. The AI art is the *setting*, never a fake house.

### Slide 7 — Compliance is designed in
DRE number and broker identification on every touchpoint · Equal Housing · Compass brand-approved marks · TCPA-grade SMS consent (separate, unchecked, versioned) · CCPA privacy notice · permissioned, verbatim testimonials · fair-housing-safe copy · no bots texting or calling anyone.
**Talk track:** "We built this so your managing broker says yes the first time."

### Slide 8 — Meet your AI team
| Bot | What it does for you | When |
|---|---|---|
| **Off-Market Scout** | Turns your MLS and Compass alert emails into a scored $2.5M+ digest matched to your buyers | Every 4 hours, 6am–10pm |
| **Relocation Radar** | Public trades, signings, coaching and executive moves into or out of the Bay Area, each with a warm way in | Daily 6:30am |
| **Comps Analyst** | CMA, absorption, months of supply, and Concierge ROI with the math shown | On demand + Monday pulse |
| **Follow-Up Concierge** | Drafts a personal reply to every web lead in minutes and turns your texts into polished emails | Instantly |

### Slide 9 — You stay in control
Screenshot of an **approval card** on a phone: "Send reply to Jordan R.? [Approve] [Edit] [Discard]".
- Bots never send, invite, share, text, or call on their own.
- Bots never look up athletes' addresses or family details.
- Private Exclusive details never leave the room.
**Talk track:** "Think of it as an assistant coach who preps everything. You still call the play."

### Slide 10 — What changes in your week (illustrative)
| Today | With the Desk |
|---|---|
| Lead sits until you're out of a showing | A draft is waiting in minutes; you tap approve between appointments |
| Evenings pulling comps | Brief ready in minutes from your MLS export |
| Skimming alert emails | One scored digest of what matters to *your* buyers |
| Hearing about a trade after the fact | A morning briefing with a warm path |
*Keep this qualitative. Don't promise lead or revenue numbers.*

### Slide 11 — Investment
**Hard-cost basis (pass-through, approximate):** video generation ≈ $60–90 one-time; stills ≈ Higgsfield credits; VPS ≈ $10–25/month; DeepSeek API ≈ a few dollars to low tens per month at this volume; hosting and email ≈ $0–20/month.

**Illustrative structure (set your own numbers):**
| Package | Includes |
|---|---|
| **Site** (one-time) | Six-scene scroll-world, desktop + mobile chains, overlays, form, compliance build, launch |
| **AI Desk setup** (one-time) | VPS, DeepSeek engine, Composio connections, four bots, webhook, acceptance tests, a 60-minute training |
| **Care plan** (monthly) | Hosting, model/provider updates, quarterly content refresh (new featured homes, testimonials), bot tuning, monitoring |
Offer a **bundle discount** for Site + Desk, and a **90-day check-in**.

### Slide 12 — Next steps
1. 30-minute discovery and asset handoff (headshot, featured properties, testimonials with permission, the Compass disclaimer text)
2. Day 3: you approve the previz flight on your phone
3. Day 10: launch, after Compass marketing sign-off
**Ask:** "Can we book discovery this week and start the previz?"

---

## Live demo walkthrough script (12 minutes)

> Setup: laptop on the previz site (desktop), Steven's or your phone with the mobile previz open, the OpenMausBot app open on a test VPS with the four bots, and a terminal ready with the `curl` lead payload. A backup screen recording is cued.

### Part 1 — The site (5 min)

**0:00 — Hand him the phone first.** "Before I show you anything, scroll this."
*Let him scroll Scene 1 → 2 on his own phone. Stay quiet for about 10 seconds.*

**0:30 — Desktop, Scene 1.** "Your tagline: the camera flies through the lens and the estate comes into focus. That's 'a new Lenz', literally. Notice the first frame loads instantly; the video streams in behind it."

**1:15 — Scene 2.** "Your story is the estate's own sport court. No logos, no jerseys, just the hardwood and a coach's whistle. Your real headshot and bio sit on top as real text, so Google reads it and screen readers read it."

**2:00 — Scene 3.** "Watch the glass: the bare room on one side, staged on the other. That's Compass Concierge without a single paragraph. The steel door at the end is Private Exclusives."

**2:45 — Scene 4.** "These frames are empty on purpose. Your real listings drop in here as real photos, with your role labeled, because we never put an AI house next to your name."

**3:30 — Scene 5.** "The lounge is for your sports and entertainment clients: privacy as an amenity. Your Compass testimonials rotate here verbatim, with permission."

**4:15 — Scene 6.** "Twilight on the terrace. The camera settles right as the form appears. Look at the consent boxes: email and text are separate, both unchecked, and versioned. That's what keeps you safe on texting."
*Scroll back up quickly:* "And it plays in reverse; the whole thing is a scrubber."
*Toggle reduced motion or 'View as page':* "Anyone who prefers no motion gets a clean, fast page."

### Part 2 — The AI Desk (6 min)

**5:00 — Submit a lead live.** Fill the form as "Jordan, buying, $4–6M, Danville/Alamo, discreet inquiry checked, SMS unchecked."
"Jordan just got an instant acknowledgment from you. Meanwhile…"

**5:45 — OpenMausBot, Lenz HQ room.** Show the Concierge picking it up: classification (*sports & entertainment, hot*), a Scout lookup for gated $4–6M matches, and a Lead Log row.
"And here's the draft: under 150 words, about what Jordan actually wrote, two real times from your calendar, your DRE number in the signature."

**7:00 — Approval card on the phone.** "Nothing has been sent. You tap approve, or edit." *Tap Approve on a test inbox.*

**7:45 — Shorthand.** Text the Concierge: `jt - danville 4br - offer due fri 5p - send comps + remind preapproval - call sat am`
"It asks one clarifying question if it's unsure who 'jt' is, then gives you two cards: the email and a Saturday calendar hold."

**9:00 — Comps Analyst.** Drop a sample CSV: "Run comps for a 4,200-sqft Danville home." Show the range (low/mid/high), months of supply, the confidence label, and the "broker price opinion, not an appraisal" line.

**10:15 — Relocation Radar.** Show this morning's briefing (sample): a public signing, the source link, a relevance score, and a warm path ("Compass S&E Division referral / player's agency"). "Notice what it *doesn't* do: no addresses, no cold DMs. It finds the signal and you work your network."

**11:15 — Guardrail moment.** Ask Radar: "Where does [any public athlete] live?" → it refuses and offers the briefing instead. "That's the line we hold for you."

**11:45 — Close the demo.** "Front of house that makes people stop scrolling. Back of house that makes sure nobody waits. And you approve every word."

---

## Objection handling

| Objection | Response |
|---|---|
| "Compass already gives me a website." | "Keep it; your Compass profile is where listings and search live. This is your *personal brand front door* that sends people there and captures the conversations Compass pages don't. We link to it." |
| "Will Compass allow this?" | "We design for their review from day one: official marks only, their disclaimer text, and a previz review on day 3. The AI desk connects only after your managing broker okays it in writing." |
| "AI emails sound robotic." | "They're drafts in your voice that you approve. Edit one or two and it learns your style." |
| "Is my client data safe?" | "It lives in your Google account and a private server we set up for you, not a shared SaaS database. Your bots can't send anything without you." |
| "What if DeepSeek or a tool changes?" | "We've already handled one change: DeepSeek retired its old model names in July 2026 and we built on the current ones. The care plan covers re-checks each quarter." |
| "DeepSeek is a Chinese provider. Is that a concern for client data?" | Take it seriously. "The bots send DeepSeek only the text needed for each task. If you or Compass prefer, the same bots can run on another provider: OpenMausBot supports several engines, so it's a settings change, not a rebuild." |
| "Video sites are slow." | "First frame is an instant still; video streams behind it; phones get a lighter vertical version; reduced-motion users get stills." |
| "I don't have many luxury listings to feature yet." | "Then we feature what you've done well, labeled honestly, and let the experience and your service carry the luxury signal. The Scout and Radar exist to grow that pipeline." |

---

## Discovery questions (use on Slide 3 or the follow-up call)

1. Which client do you want 10 more of next year: price band, profession, area?
2. Are you a member of the Compass Sports & Entertainment Division, or would you like to be? *(This affects how we use the title.)*
3. Which 3 properties are you proudest of, and what was your role in each?
4. Which testimonials can we use, and will the reviewers OK their names?
5. Where do leads come from today, and how fast do you typically reply?
6. Which MLS and Compass alerts do you already get by email?
7. Who else touches your inbox or calendar (TC, assistant)?
8. Any hard "never" rules for outreach to athletes or execs?
9. What has your managing broker said about AI tools and third-party apps?
10. Domain preference, and who controls DNS today?

---

## Follow-up email (send same day)

**Subject:** Your New Lenz previz + next steps

> Steven, thanks for the time today. As promised:
> 1. Previz link (works best on your phone): [link]
> 2. The one-page "facts to confirm" list, so everything we publish is airtight with Compass
> 3. Proposed timeline: discovery this week → previz approval day 3 → launch day 10
>
> If you can send your headshot, three featured properties (with your role), and the reviews you're comfortable featuring, I'll have the full flight ready for your review by [date].
>
> [Your name] · [phone]
