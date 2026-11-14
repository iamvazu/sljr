# Steven Lenz Jr. | Luxury Real Estate & AI Advisory Platform

[![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![SQLite](https://img.shields.io/badge/Database-SQLite%20WAL-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Compass](https://img.shields.io/badge/Compass-CA%20DRE%23%2001989811-000000)](https://www.compass.com/)
[![Test Suite](https://img.shields.io/badge/Tests-68%2F68%20Passing-brightgreen.svg)](#)
[![License](https://img.shields.io/badge/License-Proprietary-gold.svg)](#)

> **Discreet, data-sharp representation for the moments that matter most.**  
> Official web platform, programmatic relocation engine, and interactive AI advisory system for **Steven Lenz Jr.**, luxury real estate advisor with Compass California II, Inc. serving the Tri-Valley, Diablo Valley, Silicon Valley, and the broader San Francisco Bay Area.

---

## Live Deployment & Hostinger VPS

| Parameter | Value |
|---|---|
| **Live Web URL** | [https://sljr.2.25.90.226.sslip.io](https://sljr.2.25.90.226.sslip.io) |
| **Relocation Matrix Hub** | [https://sljr.2.25.90.226.sslip.io/relocation](https://sljr.2.25.90.226.sslip.io/relocation) |
| **Compass Private Exclusives** | [https://sljr.2.25.90.226.sslip.io/private-exclusives](https://sljr.2.25.90.226.sslip.io/private-exclusives) |
| **Concierge Services** | [https://sljr.2.25.90.226.sslip.io/concierge](https://sljr.2.25.90.226.sslip.io/concierge) |
| **Communities Guide** | [https://sljr.2.25.90.226.sslip.io/neighborhoods](https://sljr.2.25.90.226.sslip.io/neighborhoods) |
| **Buy Advisory Hub** | [https://sljr.2.25.90.226.sslip.io/buy](https://sljr.2.25.90.226.sslip.io/buy) |
| **Sell Advisory Hub** | [https://sljr.2.25.90.226.sslip.io/sell](https://sljr.2.25.90.226.sslip.io/sell) |
| **CRM Admin Portal** | [https://sljr.2.25.90.226.sslip.io/admin](https://sljr.2.25.90.226.sslip.io/admin) |
| **API Health Endpoint** | [https://sljr.2.25.90.226.sslip.io/api/health](https://sljr.2.25.90.226.sslip.io/api/health) |
| **Host Server** | Hostinger Cloud VPS (`2.25.90.226` / Ubuntu 24.04.4 LTS) |
| **Docker Container** | `stevenlenzjr-web` (Isolated, Port `4173`, Zero-Disruption Multi-Tenancy) |
| **Reverse Proxy** | Host Nginx (`/etc/nginx/sites-available/stevenlenzjr`) |

---

## 1. Product Requirements Document (PRD)

### 1.1 Executive Summary
Steven Lenz Jr. operates a digital real estate platform merging high-impact brand authority, full Tri-Valley & Diablo Valley market coverage, programmatic relocation route engines (PSEO/GEO), private off-market transaction representation (Compass Private Exclusives), upfront renovation capital (Compass Concierge), and a full-stack native SQLite CRM with AI-assisted lead management.

### 1.2 Core Business Objectives
1. **High-Impact Brand Authority**: Present Steven's track record, local athletic roots (Amador Valley High, De La Salle coaching), and Compass Sports & Entertainment division credibility.
2. **Organic Search Dominance (SEO, AEO, GEO & PSEO)**:
   - Full coverage of 15 Bay Area municipal hubs with dual GPS/ICBM metadata, Schema.org entities (`Place`, `RealEstateAgent`, `BreadcrumbList`, `FAQPage`, `VideoObject`).
   - Relocation Route Matrix capturing inter-regional migration searches between urban/tech hubs and Diablo/Tri-Valley enclaves.
3. **Compass Private Exclusives**: Discretion-first representation allowing luxury homeowners to test pricing and reach vetted Compass buyers off-MLS with zero public footprint.
4. **Compass Concierge Staging & Renovation**: Zero-interest upfront home improvement financing with real video case studies (Julia in Oakland: $38.5K investment &rarr; 12% over asking in 8 days) and 22 custom animated SVG service vectors.
5. **Native Full-Stack CRM (M1 & M2)**: Zero-SaaS-subscription customer relationship management engine featuring identity resolution, lead scoring, deal pipelines, CAN-SPAM compliant outbox, and Gemini AI daily action planning.
6. **24/7 AI Client Advisory (AI Steve)**: Dual-panel intelligent real estate assistant capable of answering inventory questions, calculating monthly mortgage breakdowns, showcasing active listings, and capturing qualified leads.

---

## 2. Relocation Route Matrix (PSEO & GEO Engine)

The platform features a programmatic relocation corridor architecture designed to rank organically for high-intent search queries pairing origin tech/urban centers with East Bay destination communities.

### 2.1 Live Corridors
| Corridor Route | Origin &rarr; Destination | Clean URL | Key Value Propositions |
|---|---|---|---|
| **Corridor 1** | San Francisco &rarr; Pleasanton | `/relocation/san-francisco-to-pleasanton` | 46-min direct BART to FiDi &bull; Top 2% PUSD schools &bull; 3.5x lot size multiplier &bull; 260+ sunny days |
| **Corridor 2** | Silicon Valley &rarr; Danville | `/relocation/silicon-valley-to-danville` | 35-min I-680 commute &bull; SRVUSD Gold Ribbon schools &bull; +60% sq ft advantage &bull; 0.5–1 acre foothill estates |
| **Corridor 3** | Fremont &rarr; San Ramon | `/relocation/fremont-to-san-ramon` | 20-min direct drive &bull; Dougherty Valley High (Top 5 CA) &bull; Contemporary 2005–2022 master-planned estates &bull; City Center |
| **Corridor 4** | San Jose &rarr; Dublin | `/relocation/san-jose-to-dublin` | 25–35 min I-680/ACE transit &bull; Emerald High ($374M campus) &bull; Newer Positano & Dublin Ranch estates &bull; Persimmon Place |
| **Corridor 5** | Oakland &rarr; Walnut Creek | `/relocation/oakland-to-walnut-creek` | 18-min Yellow Line BART to Rockridge &bull; Acalanes District (Las Lomas / Northgate) &bull; Broadway Plaza luxury &bull; Caldecott climate shift |
| **Corridor 6** | Palo Alto &rarr; Alamo | `/relocation/palo-alto-to-alamo` | +150% lot size multiplier &bull; 0.5 to 3+ acre private gated compounds &bull; Round Hill CC golf/tennis &bull; Monte Vista High (SRVUSD) |

### 2.2 Technical Features of Each Corridor
* **Dual GEO Metadata**: Real GPS latitude/longitude coordinates and ICBM tags matching both the origin and destination municipalities.
* **Schema.org Structured Data**: Integrated `WebPage`, `BreadcrumbList`, dual `Place` entities, and `FAQPage` rich snippets answering commute, school, and equity transfer questions.
* **Corridor Matrix Comparison Table**: Multi-vector comparative data (lot sizes, $/sq ft, top high schools, transit lines, and atmosphere).
* **Two-Way Cross-Linking**: Each municipal area hub (`pleasanton.html`, `danville.html`, `san-ramon.html`, `dublin.html`, `walnut-creek.html`, `alamo.html`) includes dedicated relocation callout cards linking into its incoming corridors.
* **Sitemap Integration**: All corridor paths registered in `site/sitemap.xml` with priority `0.85` and `weekly` change frequency.

---

## 3. Technology Stack Architecture

```
                    ┌────────────────────────────────────────────────────────┐
                    │                   BROWSER / CLIENT                     │
                    │   Vanilla ES6+ · HTML5 · CSS3 Custom Properties        │
                    │   Web Speech API · Responsive Grid & Flexbox           │
                    └──────────────────────────┬─────────────────────────────┘
                                               │ HTTP / REST API (Port 80 / 4173)
                                               ▼
                    ┌────────────────────────────────────────────────────────┐
                    │                     NGINX PROXY                        │
                    │   Reverse proxy: sljr.2.25.90.226.sslip.io -> :4173    │
                    └──────────────────────────┬─────────────────────────────┘
                                               │ Forwarded Requests
                                               ▼
┌──────────────────────────────────────────────┴──────────────────────────────────────────────┐
│  DOCKER CONTAINER: stevenlenzjr-web (Node.js 22-Alpine)                                    │
│                                                                                            │
│   ┌────────────────────────────────────────────────────────────────────────────────────┐   │
│   │                              MIDDLEWARE PIPELINE                                   │   │
│   │   • Legacy 301 Redirect Engine              • Security & CORS Headers              │   │
│   │   • Extensionless URL Router                • Request Logger & Rate Limiter        │   │
│   │   • JSON Body & Payload Validator           • Session & Route Guard                │   │
│   └──────────────────────────────────────────┬─────────────────────────────────────────┘   │
│                                              │                                             │
│                     ┌────────────────────────┴────────────────────────┐                    │
│                     ▼                                                 ▼                    │
│   ┌───────────────────────────────────┐             ┌──────────────────────────────────┐   │
│   │         BACKEND HTTP API          │             │       STATIC ASSET ENGINE        │   │
│   │   • /api/chat (AI Steve)          │             │   • /site/*.html (Clean URLs)    │   │
│   │   • /api/lead (CRM Ingestion)     │             │   • /site/relocation/*           │   │
│   │   • /api/admin/* (CRM Endpoints)  │             │   • /site/areas/*                │   │
│   │   • /api/properties & /api/health │             │   • /site/assets/img/*           │   │
│   │   • /api/unsubscribe (CAN-SPAM)   │             │   • /site/css/* & /site/js/*     │   │
│   └─────────────────┬─────────────────┘             └──────────────────────────────────┘   │
│                     │                                                                      │
│         ┌───────────┴───────────┬───────────────────────┐                                  │
│         ▼                       ▼                       ▼                                  │
│   ┌───────────┐           ┌───────────┐           ┌───────────┐                            │
│   │ AI ENGINE │           │ M1/M2 CRM │           │ GEMINI AI │                            │
│   │  (ai.js)  │           │ (crm.js)  │           │(action.js)│                            │
│   └───────────┘           └─────┬─────┘           └───────────┘                            │
│                                 │                                                          │
└─────────────────────────────────┼──────────────────────────────────────────────────────────┘
                                  ▼
                   ┌─────────────────────────────┐
                   │   DOCKER NAMED VOLUME       │
                   │   stevenlenzjr_sqlite_data  │
                   │   /app/server/data/steve.db │
                   └─────────────────────────────┘
```

---

## 4. Full-Stack CRM Engine (Milestones 1 & 2)

A zero-SaaS, high-performance customer relationship management platform embedded directly in the Node.js service using native `node:sqlite`.

### 4.1 Relational Database Architecture (14 Tables)
1. **`contacts`**: Core records with primary name, preferred contact method, lead type (buyer/seller/investor), score, and next follow-up dates.
2. **`contact_identities`**: Multi-identifier deduplication linking multiple emails, phone numbers, and physical addresses to a single person.
3. **`activities`**: Granular interaction audit trail (form submissions, AI chats, property views, outbound emails, calls, notes, stage transitions).
4. **`consents`**: Strict compliance tracking for marketing emails, phone/SMS outreach, and CCPA data requests with opt-in dates and IP logging.
5. **`deals`**: Commercial transactions tracked across custom pipeline stages with contract values, close dates, and commissions.
6. **`pipelines` & `pipeline_stages`**: Fully seeded multi-stage pipelines for **Buyer** (8 stages: Prospect &rarr; Contacted &rarr; Showing &rarr; Offer &rarr; In Escrow &rarr; Contingencies &rarr; Closed &rarr; Lost) and **Seller** (8 stages: Valuation &rarr; Consultation &rarr; Prep/Staging &rarr; Compass Exclusive &rarr; Active MLS &rarr; In Escrow &rarr; Closed &rarr; Lost).
7. **`tasks`**: Action items with automated sync to `contacts.next_follow_up_at`.
8. **`outbox`**: Queued transactional and marketing emails with simulated transport, bounce management, and rate regulation.
9. **`admin_sessions` & `audit_logs`**: Secure session token engine, brute-force throttling, and administrative audit logging.
10. **`crm_meta` & `crm_settings`**: Key-value storage for application configuration, token budget caps, and system state.
11. **`push_subscriptions`**: Web Push subscription registry for instant real-time lead notifications.
12. **`action_plans` & `action_plan_items`**: Gemini AI daily action agenda engine with call/text/email draft suggestions, approval flows, snooze/skip handlers, and 3-attempt redraft limits.

### 4.2 Lead Scoring Engine (M2)
Computes dynamic buyer and seller scores ($0 - 100$) utilizing:
* **Timeline Multipliers**: Immediate moves (+35) vs. 3–6 months (+20).
* **Budget Weighting**: $3M+ (+25), $2M–$3M (+20), $1.5M–$2M (+15).
* **Enclave Alignment**: Targeted interest in core enclaves (Pleasanton, Danville, Alamo, San Ramon, Walnut Creek).
* **Engagement Recency & Decay**: Monotonic score decay as days elapse without inbound interaction.
* **Stage & Consent Overrides**: Lost/Spam stages force score 0; bounced emails penalize (-15); unsubscribed marketing penalize (-10); past clients capped at 30.

### 4.3 Automated Verification
* Full test suite with **68 automated unit & acceptance tests** (`npm test`):
  * Schema migrations & WAL journal integrity.
  * Contact deduplication across split identities.
  * Pipeline progression & automatic task scheduling.
  * Gemini AI output sanitization, phrase blocklists, and anti-hallucination checks.
  * Performance benchmarks: contacts list & daily agenda load in **< 500ms** with 5,000 contacts and 50,000 activities.

---

## 5. Legacy 301 Redirect Engine & Clean URL Routing

The production server (`server/server.js` and `site/server.js`) enforces canonical extensionless URLs and 301 redirects to ensure 100% link equity preservation from Google search and legacy marketing materials:

```javascript
// Sample 301 Redirect Rules
'/home-valuation'       -> '/valuation'
'/testimonials'          -> '/about#testimonials'
'/experiences'           -> '/private-exclusives'
'/home-search/listings'  -> '/properties'
'/home-search/account'   -> '/'
'/terms-and-conditions'  -> '/terms'
'/sitemap'               -> '/sitemap.xml'
'/neighborhoods/:slug'   -> '/areas/:slug.html'
'/properties/:slug'      -> '/listing.html?id=:slug'
'/:page.html'            -> '/:page'  (e.g., /about.html -> /about)
'/relocation/:slug.html' -> '/relocation/:slug'
```

---

## 6. Directory Structure

```
steven-lenz-jr/
├── Dockerfile                      # Production container definition (Node 22-Alpine)
├── docker-compose.yml              # Compose service, port mapping (4173) & volume
├── deploy.sh                       # One-command server update & container refresh
├── package.json                    # Project descriptor & test runner (node --test)
│
├── server/                         # Full-Stack Backend Service
│   ├── server.js                   # HTTP routing, 301 redirect engine & static delivery
│   ├── middleware.js               # Logger, rate-limiter, security & validators
│   ├── db.js                       # SQLite initialization, migrations & seeders
│   ├── crm.js                      # M1/M2 CRM core: contacts, pipelines, scoring, tasks
│   ├── ai.js                       # AI Steve client-facing natural language engine
│   └── action-plan.js              # Gemini AI daily action planner & sanitization
│
├── site/                           # Frontend Web Application
│   ├── index.html                  # 3D world homepage with aperture lens & enclaves
│   ├── about.html                  # Biography, coaching background & testimonials
│   ├── buy.html                    # Buyer advisory pillars, timeline & search integration
│   ├── sell.html                   # Seller advisory, pricing math & market prep
│   ├── concierge.html              # Compass Concierge with video case study & 22 SVG icons
│   ├── private-exclusives.html     # Off-market representation & discretion protocol
│   ├── neighborhoods.html          # Communities hub with 3x3 photo grid layouts
│   ├── properties.html             # Featured listings portfolio & recent sales
│   ├── relocation.html             # Relocation Route Matrix Hub & comparison tables
│   ├── connect.html                # Private consultation scheduling form
│   ├── valuation.html              # Home valuation intake engine
│   ├── resources.html              # Editorial real estate news & market reports
│   ├── sitemap.xml                 # XML sitemap with Image & Video extensions
│   ├── robots.txt                  # Search engine crawl directives & sitemap reference
│   ├── privacy.html                # CCPA & privacy disclosures
│   ├── terms.html                  # Legal terms of service
│   │
│   ├── relocation/                 # Relocation Corridor PSEO Landing Pages
│   │   ├── index.html              # Direct corridor directory index
│   │   ├── san-francisco-to-pleasanton.html
│   │   ├── silicon-valley-to-danville.html
│   │   ├── fremont-to-san-ramon.html
│   │   ├── san-jose-to-dublin.html
│   │   ├── oakland-to-walnut-creek.html
│   │   └── palo-alto-to-alamo.html
│   │
│   ├── areas/                      # Micro-Enclave SEO Landing Pages
│   │   ├── pleasanton.html         # Pleasanton 3x3 photo grid & SF corridor callout
│   │   ├── danville.html           # Danville 3x3 photo grid & SV corridor callout
│   │   ├── alamo.html              # Alamo estate acreage & Palo Alto corridor callout
│   │   ├── san-ramon.html          # San Ramon master-planned & Fremont corridor callout
│   │   ├── dublin.html             # Dublin tech expansion & San Jose corridor callout
│   │   ├── livermore.html          # Livermore wine country guide
│   │   ├── walnut-creek.html       # Walnut Creek foothill & Oakland corridor callout
│   │   ├── lafayette.html          # Lamorinda semi-rural luxury
│   │   ├── oakland.html            # Oakland architectural enclaves
│   │   ├── berkeley.html           # Berkeley hills architecture
│   │   ├── hayward.html            # Hayward foothills
│   │   ├── fremont.html            # Mission San Jose & tech gateways
│   │   ├── san-francisco.html      # Pacific Heights & Marina enclaves
│   │   ├── palo-alto.html          # Old Palo Alto & Stanford corridor
│   │   └── san-jose.html           # Silver Creek & Willow Glen estates
│   │
│   ├── assets/                     # Optimized Media & Brand Assets
│   │   ├── brand/                  # Vector logos, favicon, Compass banner marks
│   │   └── img/                    # High-res photography (neighborhoods, enclaves, headshots)
│   │
│   ├── css/                        # Modular Style System
│   │   ├── theme.css               # Design tokens, color system, typography highlights
│   │   ├── editorial.css           # Editorial typography, grids, corridor styling
│   │   ├── mobile.css              # Responsive layout breakpoints (<900px, <600px)
│   │   └── ai-steve.css            # AI Steve dual-panel drawer & voice visualizer
│   │
│   └── js/                         # Client-Side Application Scripts
│       ├── editorial-nav.js        # Universal dynamic header, mega-menu & mobile drawer
│       ├── ai-steve.js             # AI Steve chat widget & speech recognition runtime
│       ├── scroll-world.js         # 3D canvas world transitions & viewport controller
│       ├── world.config.js         # Scene coordinates, copy text & media bindings
│       └── cookie-banner.js        # GDPR/CCPA cookie consent management
│
└── test/                           # Automated Verification Suite
    └── crm.test.js                 # 68 acceptance tests for CRM, security & AI engine
```

---

## 7. Local Development & Deployment

### 7.1 Running Locally
```bash
# 1. Clone repository
git clone https://github.com/iamvazu/sljr.git
cd sljr

# 2. Run automated verification suite
npm test

# 3. Start local server
node server/server.js
```
Open `http://localhost:4173` in your browser.

### 7.2 Running with Docker Locally
```bash
docker compose up --build -d
```

### 7.3 Deploying to Hostinger VPS
The application is deployed on the Hostinger VPS at `/opt/stevenlenzjr`. To update production:

```bash
ssh root@2.25.90.226 "cd /opt/stevenlenzjr && git pull origin main && docker compose build && docker compose up -d"
```

---

## 8. Multi-Tenant Server Safety

The Hostinger Cloud VPS hosts several isolated applications concurrently. The `stevenlenzjr-web` container runs on port `4173` inside its own Docker network with persistent SQLite data stored in `stevenlenzjr_sqlite_data`, maintaining zero port or resource conflict with neighboring services:

```
CONTAINER ID   IMAGE                       STATUS                   PORTS                               NAMES
cae7474cdf35   stevenlenzjr-stevenlenzjr   Up (healthy)             0.0.0.0:4173->4173/tcp              stevenlenzjr-web
1d8716615961   dcc-dcc-frontend            Up 5 days (healthy)      0.0.0.0:3040->3000/tcp              dcc-frontend
f80abd0a53e3   dcc-dcc-backend             Up 5 days (healthy)      0.0.0.0:4040->4000/tcp              dcc-backend
1d42f0edeb7c   tacit-tacit-web             Up 4 weeks (healthy)     127.0.0.1:3030->3000/tcp            tacit-web
ea1049788a17   hermes-webui-vhyd-agent     Up 5 weeks               127.0.0.1:9119->9119/tcp            hermes-agent
6f9a34a03439   hermes-webui-vhyd-webui     Up 2 months (healthy)    0.0.0.0:32770->8787/tcp             hermes-webui
```

---

## 9. License & Representation

* **Real Estate Advisor**: Steven Lenz Jr. (Compass California II, Inc., CA DRE# 01989811)
* **Brokerage**: Compass (DRE# 01527235)
* **Equal Housing Opportunity**: Strict adherence to the Federal Fair Housing Act and California Fair Employment and Housing Act (FEHA).
* **Code & Architecture**: Proprietary &bull; All rights reserved.
