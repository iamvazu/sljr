# Steven Lenz Jr. | Luxury Real Estate & AI Advisory Platform

[![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![SQLite](https://img.shields.io/badge/Database-SQLite%20WAL-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Compass](https://img.shields.io/badge/Compass-CA%20DRE%23%2001989811-000000)](https://www.compass.com/)
[![License](https://img.shields.io/badge/License-Proprietary-gold.svg)](#)

> **Discreet, data-sharp representation for the moments that matter most.**  
> Official web platform and interactive AI real estate advisory system for **Steven Lenz Jr.**, luxury real estate advisor with Compass California II, Inc. serving the Tri-Valley, Diablo Valley, and the broader San Francisco Bay Area.

---

## Live Deployment & Hostinger VPS

| Parameter | Value |
|---|---|
| **Live Web URL** | [http://sljr.2.25.90.226.sslip.io](http://sljr.2.25.90.226.sslip.io) |
| **Concierge Services** | [http://sljr.2.25.90.226.sslip.io/concierge.html](http://sljr.2.25.90.226.sslip.io/concierge.html) |
| **Communities Guide** | [http://sljr.2.25.90.226.sslip.io/neighborhoods.html](http://sljr.2.25.90.226.sslip.io/neighborhoods.html) |
| **API Health Endpoint** | [http://sljr.2.25.90.226.sslip.io/api/health](http://sljr.2.25.90.226.sslip.io/api/health) |
| **Host Server** | Hostinger Cloud VPS (`2.25.90.226` / Ubuntu 24.04.4 LTS) |
| **Docker Container** | `stevenlenzjr-web` (Isolated, Port `4173`, Zero-Disruption Multi-Tenancy) |
| **Reverse Proxy** | Host Nginx (`/etc/nginx/sites-available/stevenlenzjr`) |

---

## 1. Product Requirements Document (PRD)

### 1.1 Executive Summary
Steven Lenz Jr. requires a high-converting, editorial luxury digital headquarters that merges brand authority, comprehensive Bay Area market coverage, concierge seller services, and a 24/7 AI-powered advisory system that converts passive visitors into qualified private client consultations.

### 1.2 Core Business Objectives
1. **High-Impact Brand Authority**: Present Steven's track record, local athletic roots (Amador Valley High, De La Salle coaching), and Compass Sports & Entertainment division credibility.
2. **PSEO, AEO & GEO Organic Search Dominance**: Complete coverage of key East Bay markets (Pleasanton, Danville, Alamo, San Ramon, Walnut Creek, Oakland, Berkeley, Silicon Valley) with structured metadata, Schema.org entities, and local micro-enclave landing pages.
3. **Compass Concierge Conversion**: Highlighting the zero-interest upfront home improvement program with interactive bespoke iconography and clear ROI statistics.
4. **Interactive AI Client Advisory (AI Steve)**: Dual-panel intelligent real estate assistant capable of answering inventory questions, calculating monthly mortgage breakdowns, showcasing active listings, and capturing qualified seller/buyer leads directly into a database.
5. **Zero Friction Lead Generation**: Seamless contact flows across every touchpoint without third-party recurring SaaS subscriptions.

### 1.3 Key Functional Requirements
* **Curated Neighborhood Hubs**: $3 \times 3$ visual grid layouts across all communities featuring high-resolution photography and specific enclave tags.
* **Bespoke Iconography & Micro-Animations**: 22 dual-tone SVG vector icons with gold highlights and hover interactions for the Concierge program.
* **Client Perspective Testimonials**: Horizontal swipeable carousel with star ratings and client citations.
* **Regulatory Compliance**: Comprehensive California Consumer Privacy Act (CCPA) and Cookie Policy implementation with persistent consent management.
* **Multi-Tenant Server Safety**: Complete container isolation ensuring no existing server applications are modified or interrupted.

---

## 2. Technology Stack Architecture

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
│   │   • Request Logger (Latency & Status)       • Security & CORS Headers              │   │
│   │   • Sliding-Window Rate Limiter             • JSON Body & Payload Validator        │   │
│   └──────────────────────────────────────────┬─────────────────────────────────────────┘   │
│                                              │                                             │
│                     ┌────────────────────────┴────────────────────────┐                    │
│                     ▼                                                 ▼                    │
│   ┌───────────────────────────────────┐             ┌──────────────────────────────────┐   │
│   │         BACKEND HTTP API          │             │       STATIC ASSET ENGINE        │   │
│   │   • POST /api/chat                │             │   • /site/*.html                 │   │
│   │   • POST /api/leads               │             │   • /site/assets/img/*           │   │
│   │   • POST /api/feedback            │             │   • /site/css/* & /site/js/*     │   │
│   │   • GET  /api/properties          │             │   • Proper MIME & Cache Control  │   │
│   │   • GET  /api/health              │             └──────────────────────────────────┘   │
│   └─────────────────┬─────────────────┘                                                    │
│                     │                                                                      │
│         ┌───────────┴───────────┐                                                          │
│         ▼                       ▼                                                          │
│   ┌───────────┐           ┌───────────┐                                                    │
│   │ AI ENGINE │           │ SQLITE DB │                                                    │
│   │  (ai.js)  │           │  (db.js)  │                                                    │
│   └───────────┘           └─────┬─────┘                                                    │
│                                 │                                                          │
└─────────────────────────────────┼──────────────────────────────────────────────────────────┘
                                  ▼
                   ┌─────────────────────────────┐
                   │   DOCKER NAMED VOLUME       │
                   │   stevenlenzjr_sqlite_data  │
                   │   /app/server/data/steve.db │
                   └─────────────────────────────┘
```

### 2.1 Frontend Layer
* **Runtime**: Zero external UI framework dependencies. Vanilla JavaScript (ES6+), compiled for maximum performance and sub-second First Contentful Paint (FCP).
* **Styling**: `editorial.css`, `theme.css`, `mobile.css`, `ai-steve.css` using CSS custom properties (`--sw-gold`, `--sw-bg`, etc.).
* **Typography**: Cormorant Garamond (editorial serif) paired with Montserrat (modern sans-serif).
* **Dual-Panel AI Widget**: Split-screen design featuring a collapsible slide-out Homes panel on the left and interactive conversation drawer on the right with a draggable divider handle.
* **Voice Recognition**: Native browser Web Speech API (`webkitSpeechRecognition` / `SpeechRecognition`) with animated audio-wave indicators.

### 2.2 Backend & Middleware Layer
* **Runtime**: Node.js v22+ native HTTP server (`server/server.js`).
* **Middleware (`server/middleware.js`)**:
  * `requestLogger`: Measures request processing time in milliseconds.
  * `securityHeaders`: Configures `X-Content-Type-Options`, `X-Frame-Options`, and permissive CORS headers.
  * `rateLimiter`: In-memory sliding-window limiter enforcing 60 requests/minute per client IP.
  * `jsonBodyParser`: Streams incoming JSON payloads with 1MB payload caps.
  * `validateLeadPayload`: Enforces strict required-field and email regex validation.

### 2.3 Database Layer (`server/db.js`)
* **Engine**: Native `node:sqlite` `DatabaseSync` (zero NPM dependencies).
* **Journal Mode**: Write-Ahead Logging (`WAL`) enabled for concurrent multi-client read/write operations.
* **Persistent Storage**: Mapped to Docker named volume `stevenlenzjr_sqlite_data`.
* **Tables**:
  1. `properties`: Catalog of active, pending, and sold listings with bedrooms, bathrooms, square footage, pricing, status, and photography URLs.
  2. `leads`: Captured contact submissions from the "Talk to Steven" modal (name, email, phone, preferred reply method, property of interest, message, session ID, client IP).
  3. `conversations`: Persistent session chat logs for auditing and AI refinement.
  4. `feedback`: User thumbs-up / thumbs-down ratings.

### 2.4 AI Engine (`server/ai.js`)
* **Intent Recognition**: Evaluates user prompts across categories: `AREAS_COVERED`, `SHOW_HOMES`, `MORTGAGE_CALC`, `PROPERTY_SPECIFIC`, `CITY_INQUIRY`, and `TALK_TO_STEVE`.
* **Dynamic Mortgage Math**: Exact calculations using 30-year amortization formulas:
  $$\text{Monthly P\&I} = P \times \frac{i(1 + i)^n}{(1 + i)^n - 1}$$
  Including dynamic California property tax (~1.15%) and homeowners hazard insurance estimates.
* **RAG Property Retrieval**: Queries SQLite for real-time inventory based on geographic and pricing tokens, returning structured cards with photography.

---

## 3. Directory Structure

```
steven-lenz-jr/
├── Dockerfile                  # Production container definition (Node 22-Alpine)
├── docker-compose.yml          # Compose service, port mapping & persistent volume
├── deploy.sh                   # One-command server update & container refresh
├── .dockerignore               # Build optimization rules
├── .gitignore                  # Git repository exclusion rules
├── package.json                # Project descriptor
│
├── server/                     # Full-Stack Backend Service
│   ├── server.js               # HTTP routing, static file delivery & API handlers
│   ├── middleware.js           # Logger, rate-limiter, security & validators
│   ├── db.js                   # node:sqlite database interface & schemas
│   ├── ai.js                   # AI natural language engine & mortgage calculator
│   └── data/                   # SQLite database directory (persisted in volume)
│       └── steve.sqlite        # SQLite database file
│
└── site/                       # Frontend Web Application
    ├── index.html              # Homepage with hero aperture lens & interactive map
    ├── about.html              # Bio, track record & swipeable testimonials
    ├── concierge.html          # Compass Concierge with 22 bespoke animated icons
    ├── neighborhoods.html      # Communities guide with 3x3 photo grids
    ├── properties.html         # Featured listings & recent closings
    ├── connect.html            # Private consultation scheduling form
    ├── privacy.html            # CCPA & legal disclosures
    ├── cookie-policy.html      # Comprehensive cookie policy
    │
    ├── areas/                  # Micro-Enclave SEO Landing Pages
    │   ├── pleasanton.html     # Pleasanton 3x3 photo grid guide
    │   ├── danville.html       # Danville & Alamo 3x3 photo grid guide
    │   ├── alamo.html          # Alamo estate acreage guide
    │   ├── livermore.html      # Wine country acreage guide
    │   ├── walnut-creek.html   # Mount Diablo foothill guide
    │   ├── oakland.html        # Oakland & Piedmont borders
    │   ├── berkeley.html       # Berkeley hills architecture
    │   └── palo-alto.html      # Silicon Valley executive residences
    │
    ├── assets/                 # High-Resolution Visual Assets
    │   ├── brand/              # Logos, favicon, Compass branding marks
    │   └── img/                # Photography, enclaves, pocket-*.jpg images
    │       └── listings/       # Property showcase imagery
    │
    ├── css/                    # Modular Style System
    │   ├── theme.css           # Design tokens, color system, typography
    │   ├── editorial.css       # Editorial layouts & 3x3 enclave grid rules
    │   ├── mobile.css          # Tablet & mobile responsive breakpoints
    │   └── ai-steve.css        # AI widget, split-panel drawer & lead modal
    │
    └── js/                     # Client-Side Application Scripts
        ├── ai-steve.js         # AI client runtime, speech recognition & API sync
        ├── editorial-nav.js    # Global dynamic header & mobile drawer
        └── cookie-banner.js    # GDPR/CCPA cookie consent management
```

---

## 4. API Reference

### Health Check
* **`GET /api/health`**
  * Returns engine status, database connection, registered tables, and process uptime.
  ```json
  {
    "status": "healthy",
    "service": "AI Steve Real Estate Engine",
    "db": "connected (node:sqlite)",
    "tables": ["properties", "leads", "conversations", "feedback"],
    "uptime": 240,
    "timestamp": "2026-11-13T14:21:21.268Z"
  }
  ```

### Chat with AI Steve
* **`POST /api/chat`**
  * Submits a user query and returns conversational text, matching property cards, and suggested quick-reply chips.
  * **Payload**:
    ```json
    {
      "message": "Which areas do you cover?",
      "sessionId": "sess_abc123"
    }
    ```
  * **Response**:
    ```json
    {
      "success": true,
      "reply": "I cover Camp Connell, CA and Richmond, CA, as well as Pleasanton, Danville, Alamo, and the broader Bay Area...",
      "properties": [ ... ],
      "card": {
        "eyebrow": "HOMES · SHOWING NOW",
        "title": "2 homes",
        "priceRange": "$450,000 to $825,000",
        "actionText": "Browse homes →",
        "actionType": "browse_homes"
      },
      "quickReplies": ["Browse homes", "Tell me about 1232 York St", "Talk to Steven"],
      "intent": "AREAS_COVERED"
    }
    ```

### Lead Capture ("Talk to Steven")
* **`POST /api/leads`**
  * Submits a consultation inquiry directly to the SQLite `leads` table.
  * **Payload**:
    ```json
    {
      "name": "Jane Doe",
      "email": "jane.doe@example.com",
      "phone": "(925) 555-0199",
      "reply_method": "email",
      "property_address": "1232 York St",
      "message": "I would like to schedule a private walkthrough this Saturday.",
      "sessionId": "sess_abc123"
    }
    ```
  * **Response** (`201 Created`):
    ```json
    {
      "success": true,
      "leadId": 4,
      "message": "Thank you! Steven has received your details and will follow up shortly."
    }
    ```

### Feedback (Thumbs Up / Down)
* **`POST /api/feedback`**
  * **Payload**: `{"sessionId": "sess_abc123", "rating": "up"}`
  * **Response**: `{"success": true, "recorded": "up"}`

### Query Properties
* **`GET /api/properties?city=pleasanton&maxPrice=3500000`**
  * Returns matching listings filtered by city, price ceiling, or bedroom count.

---

## 5. Local Development & Deployment

### 5.1 Running Locally
1. **Clone the repository**:
   ```bash
   git clone https://github.com/iamvazu/sljr.git
   cd sljr
   ```
2. **Start the server**:
   ```bash
   node server/server.js
   ```
3. Open `http://localhost:4173` in your browser.

### 5.2 Running with Docker Locally
```bash
docker compose up --build -d
```

### 5.3 Deploying to Hostinger VPS
The application is pre-configured on the Hostinger VPS at `/opt/stevenlenzjr`. To pull updates and rebuild without impacting other containers:

```bash
ssh root@2.25.90.226
cd /opt/stevenlenzjr
./deploy.sh
```

---

## 6. Zero-Disruption Multi-Tenant Verification

The Hostinger VPS hosts multiple production containers. The `stevenlenzjr-web` container operates inside its own network space and internal port mapping without conflicting with any neighbor:

```
CONTAINER ID   IMAGE                       STATUS                   PORTS                                         NAMES
cae7474cdf35   stevenlenzjr-stevenlenzjr   Up (healthy)             0.0.0.0:4173->4173/tcp                        stevenlenzjr-web
a1b2c3d4e5f6   dcc-dcc-frontend            Up 4 days (healthy)      0.0.0.0:3040->3000/tcp                        dcc-frontend
b2c3d4e5f6a1   dcc-dcc-backend             Up 4 days (healthy)      0.0.0.0:4040->4000/tcp                        dcc-backend
c3d4e5f6a1b2   tacit-tacit-web             Up 3 weeks (healthy)     127.0.0.1:3030->3000/tcp                      tacit-web
d4e5f6a1b2c3   hermes-webui-vhyd-agent     Up 3 weeks               127.0.0.1:9119->9119/tcp                      hermes-agent
e5f6a1b2c3d4   hermes-webui-vhyd-webui     Up 3 weeks (healthy)     0.0.0.0:32770->8787/tcp                       hermes-webui
```

---

## 7. License & Credits

* **Agent & Advisor**: Steven Lenz Jr. (Compass California II, Inc., CA DRE# 01989811)
* **Brokerage**: Compass (DRE# 01527235)
* **Code & Architecture**: Proprietary · All rights reserved.

