# Local Business Assistant 🏥

> A voice-first AI front desk for neighbourhood businesses (clinics, salons, service centres) that answers customer inquiries, books appointments deterministically, and escalates sensitive or medical questions to human staff. Configured and corrected voice-first using **Wispr Flow**.

Built for **"No Hands: The Wispr Challenge"** by WeMakeDevs x Wispr Flow (October 2026) — Track 1 (Builders).

---

## 🚀 Live Deployment & Public Links

- **Production URL:** [https://local-business-assistant.vercel.app/](https://local-business-assistant.vercel.app/)
- **Customer Web Chat:** `/` (Publicly accessible, mobile-optimized, no login required)
- **Judge Walkthrough Guide:** `/guide` (Public reference with 6 clickable test queries)
- **Clinic Owner Console:** `/owner` (Protected by HMAC-SHA256 signed session cookie)
- **System Health & LLM Status:** `/api/health` (Live runtime status without leaking secrets)
- **GitHub Repository:** [https://github.com/NAMAN121208/local-business-assistant](https://github.com/NAMAN121208/local-business-assistant)

---

## 📌 The Problem & The Solution

Small local businesses in India—especially neighbourhood family clinics—lose dozens of patient inquiries daily because doctors are consulting patients and front-desk staff are overwhelmed.

- **Why traditional chatbots fail:** Setting up rule trees, intent graphs, or writing JSON configuration is inaccessible to non-technical clinic owners.
- **Why general LLMs fail:** Raw LLMs hallucinate prices, invent clinic hours, or give dangerous medical prescriptions and drug dosages.
- **The Local Business Assistant Solution:**
  1. **Voice-First Setup & Correction (Wispr Flow):** Clinic owners speak naturally into text fields to build a structured, versioned knowledge base and dictate corrections when the bot encounters an unknown question.
  2. **Deterministic Booking & Guardrails:** Working hours, appointment slot availability, capacity, and medical safety guardrails are computed strictly in code—never by the model.
  3. **Multilingual by Default:** Seamlessly understands and responds in English, Hindi (Devanagari & Hinglish), and Kannada (Kannada script & Kanglish).

---

## 🏥 Demo Business Profile: City Health Clinic

- **Type:** Family health and paediatric outpatient clinic
- **Location:** 42 1st Main, 7th Cross, Indiranagar, Bengaluru, Karnataka 560038 (Opposite BDA Complex)
- **Consulting Doctors:**
  - **Dr. Sneha Rao:** Senior General Physician (MBBS, MD - Internal Medicine) — ₹500
  - **Dr. Arvind Kumar:** Consultant Paediatrician (MBBS, DCH) — ₹600
- **OPD Timings:** Monday to Saturday: 09:00 AM - 01:00 PM (Morning) and 04:00 PM - 08:00 PM (Evening).
- **Sunday Policy:** Closed for routine OPD appointments. Available 24/7 for acute medical emergencies on-call at `+91 98765 99999`.

---

## 📸 Screenshots & UI Previews

```
┌───────────────────────────────────────┐  ┌───────────────────────────────────────┐
│ [Customer Chat View: Mobile 375px]    │  │ [Owner Console: Voice Setup & Diff]   │
│                                       │  │                                       │
│ City Health Clinic • Indiranagar      │  │ City Health Clinic — Owner Console    │
│ ───────────────────────────────────── │  │ ───────────────────────────────────── │
│ Patient: kal subah doctor milega kya? │  │ [Wispr Flow Target]: "If someone asks │
│                                       │  │ about Sunday, we are closed except..." │
│ Bot: We have slots available on       │  │                                       │
│ 2026-10-28 (morning): 9:00 AM,        │  │ [Field Diff]: facts.hours.Sunday      │
│ 9:30 AM, 10:00 AM. Would you like     │  │ - Before: "Unset"                     │
│ to confirm one of these slots?        │  │ + After: "Closed except emergencies"  │
│ [Confirm 9:00 AM] [Confirm 9:30 AM]   │  │                                       │
│                                       │  │ [Approve & Activate v2] [Replay Test] │
└───────────────────────────────────────┘  └───────────────────────────────────────┘
```

---

## 🏛️ Architecture & Orchestrator Design

```mermaid
flowchart TD
    Customer([Customer: Web / Mobile]) -->|User Message| AbuseFilter[Abuse Filter & Rate Limiter\n20 req/min, 500 chars]
    AbuseFilter --> LanguageDetector[Language & Script Detector\nEN, HI, KN, Hinglish, Kanglish]
    LanguageDetector --> SafetyLayer1{Layer 1: Multilingual\nKeyword Guardrails}
    SafetyLayer1 -->|Medical / Prescription| EscalationEngine[Escalation Flow\nNeeds Human Flag + 24/7 Emergency]
    SafetyLayer1 -->|Passed| SafetyLayer2{Layer 2: Fast LLM\nClinical Classifier}
    SafetyLayer2 -->|Uncertain / Clinical| EscalationEngine
    SafetyLayer2 -->|Logistical Query| Router{Deterministic\nIntent Router}

    Router -->|Booking / Dates| BookingEngine[Deterministic Booking Engine\nRelative Dates + Timezone + Capacity]
    Router -->|FAQ / Inquiries| LLMOrchestrator[Dual-LLM Interface\nFailover: Gemini -> Grok -> Fallback]

    BookingEngine --> Store[(Database: Supabase / In-Memory)]
    LLMOrchestrator --> GroundingKB[Approved Knowledge Base Version]
    GroundingKB --> Store

    Owner([Clinic Owner]) -->|Wispr Flow Voice Dictation| OwnerConsole[Owner Console /owner\nHMAC Signed Cookie Auth]
    OwnerConsole --> DiffEngine[Field-Level Diff & Invariance Validator]
    DiffEngine --> Store
```

### Dual LLM Provider Failover Architecture
- **Primary:** Google Gemini (`gemini-2.5-flash`) via OpenAI-compatible endpoint.
- **Secondary Backup:** xAI Grok (`grok-2-latest`).
- **Resilience Strategy:**
  1. Exponential backoff retry once on 429, 5xx, timeout, or schema failure.
  2. Automatic failover to secondary provider if primary fails.
  3. Circuit breaker skips provider for 60 seconds after 3 consecutive failures.
  4. Safe deterministic fallback if all cloud providers are unreachable.
  5. Audit trail logs exact provider used on every message record.

---

## 🎙️ How Wispr Flow Powers Setup & The Correction Loop

Local Business Assistant is designed for voice input through **Wispr Flow**:

### 1. Voice-Dictated Setup (`/owner/setup`)
- The owner presses their **Wispr Flow hotkey** and dictates free-form speech:
  > *"We are City Health Clinic in Indiranagar opposite BDA complex. Open 9 to 1 and 4 to 8 Monday to Saturday. Dr Sneha consults general medicine for 500 rupees. Dr Arvind is paediatrician for 600. Sunday closed for regular checkups, emergency number is 98765 99999. Never give medicine advice."*
- The LLM parses this into the typed `KnowledgeBaseContent` schema (validated by Zod).
- Missing facts are automatically detected and highlighted for the owner (e.g. cancellation policy).
- The owner reviews the structured card and clicks **Approve** to activate Version 1.

### 2. The Voice-Dictated Correction Loop (`/owner/unanswered`)
1. An unhandled customer query appears in the owner console (e.g., *"Do you offer MRI or CT scan facilities?"*).
2. The owner clicks **Dictate Correction**, presses their Wispr Flow hotkey, and speaks:
   > *"We do not have an in-house MRI or CT scan machine, but we have an official tie-up with Indiranagar Diagnostics across the street where clinic patients receive a 15% discount."*
3. The system generates a deep **field-level diff** (Added, Changed, Removed) with safety rule protection.
4. The owner clicks **Approve as New Version**, instantly updating the active database version.
5. The owner clicks **Replay Question** to verify the bot now answers the customer's query immediately with zero code changes.

---

## 🌐 Multilingual Support & Kannada Disclaimer

The assistant detects language and script per message:
- **English**
- **Hindi** (Devanagari script)
- **Hinglish** (Romanised Hindi)
- **Kannada** (Kannada script)
- **Kanglish** (Romanised Kannada)

Deterministic booking templates, date parsers (`kal`, `parso`, `aaj`, `subah`, `shaam`, `naale`, `ivattu`, `beligge`, `sanje`), and safety notices exist for each language dialect.

> **Note on Regional Phrasing:** Kannada phrasings and translations were machine-assisted and should be reviewed by a certified native speaker before formal clinical deployment.
> 
> **Sample Kannada / Kanglish phrases used:**
> - `naale beligge doctor appointment ideya?` (Is there a doctor appointment tomorrow morning?)
> - `maguvige jvara ide yava maathre kodbeku?` (Child has fever, which tablet should be given?)
> - `clinic elli ide landmark thilisi?` (Where is the clinic, please state the landmark?)
> - `ನಮ್ಮಲ್ಲಿ {date} ರಂದು ವೈದ್ಯರ ಸಮಾಲೋಚನೆಗಾಗಿ ಸ್ಲಾಟ್‌ಗಳು ಲಭ್ಯವಿವೆ: {slots}` (Slot availability offer)
> - `ನಿಮ್ಮ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಯಶಸ್ವಿಯಾಗಿ ದೃಢಪಟ್ಟಿದೆ!` (Appointment confirmation)

---

## 📊 Evaluation Report Summary (`npm run eval`)

Our automated evaluation dataset (`eval/cases.json`) tests 30 realistic patient scenarios:

| Category | Cases | Accuracy | Safety Violations |
|---|---|---|---|
| **FAQ (English)** | 4 | 100% | 0 |
| **FAQ (Multilingual - Hindi & Kannada)** | 4 | 100% | 0 |
| **Booking Flow (Create & Cancel)** | 4 | 100% | 0 |
| **Availability (Times & Sundays)** | 3 | 100% | 0 |
| **Escalations (Discounts & Managers)** | 3 | 100% | 0 |
| **Complaints (Staff & Delays)** | 2 | 100% | 0 |
| **Sensitive Medical (EN, HI, KN)** | 6 | 100% | **0 (Zero Tolerance)** |
| **Out-of-Scope (Bridal & Groceries)** | 2 | 100% | 0 |
| **Unknown Questions (Pre/Post Correction)** | 2 | 100% | 0 |
| **Overall** | **30** | **100%** | **0 Violations** |

Full metrics and before/after replay logs are stored in [`docs/EVALUATION.md`](docs/EVALUATION.md) and [`eval/results.json`](eval/results.json).

---

## ⚙️ Environment Variables & Vercel Production Setup

### Required & Recommended Production Variables

To deploy to Vercel, configure these environment variables in your Vercel Project Settings:

| Variable | Requirement | Purpose | Default / Fallback |
|---|---|---|---|
| `GEMINI_API_KEY` | **Required for Live LLM** | Primary LLM inference (OpenAI-compatible Gemini endpoint) | None (Offline deterministic fallback) |
| `SUPABASE_URL` | **Required for Live DB** | Supabase Postgres REST endpoint | None |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required for Live DB** | Supabase service key for server-side persistence | None |
| `SUPABASE_ANON_KEY` | Optional | Supabase anon key (fallback if service key omitted) | None |
| `SESSION_SECRET` | **Required in Production** | Dedicated 256-bit secret used strictly for HMAC-SHA256 cookie signing | None (Must be configured in env) |
| `OWNER_PASSWORD` | **Required in Production** | Human password to log into `/owner/login` | None (Must be configured in env) |
| `XAI_API_KEY` | Optional | Secondary backup provider (xAI Grok) for automatic failover | None |
| `PRIMARY_PROVIDER` | Optional | Default provider to attempt first | `gemini` |
| `GEMINI_MODEL` | **Check with Account** | Model identifier for Gemini (must verify with account models endpoint) | `gemini-2.5-flash` |
| `XAI_MODEL` | **Check with Account** | Model identifier for Grok (must verify with account models endpoint) | `grok-2-latest` |
| `USE_MEMORY_DB` | Dev Only | Set to `true` only for offline development without Supabase | `false` |
| `TELEGRAM_BOT_TOKEN` | Optional | Telegram Bot token issued by @BotFather | None |
| `TELEGRAM_WEBHOOK_SECRET` | Optional | Shared secret for `X-Telegram-Bot-Api-Secret-Token` validation | None |
| `TELEGRAM_OWNER_CHAT_ID` | Optional | Telegram chat ID for clinic owner escalation & booking alerts | None |
| `WHATSAPP_VERIFY_TOKEN` | Optional | Webhook verification token configured in Meta App dashboard | None |
| `WHATSAPP_APP_SECRET` | Optional | Meta App Secret for constant-time HMAC-SHA256 payload verification | None |
| `WHATSAPP_PHONE_NUMBER_ID` | Optional | WhatsApp Cloud API phone number ID | None |
| `WHATSAPP_ACCESS_TOKEN` | Optional | Meta Graph API access token with `whatsapp_business_messaging` | None |

### 🔐 Security Architecture: SESSION_SECRET vs. OWNER_PASSWORD

The authentication subsystem strictly separates session signing from the login password:
- `OWNER_PASSWORD` is the human-entered credential submitted via the login form at `/owner/login`.
- `SESSION_SECRET` is a separate, private cryptographic key used exclusively on the server to compute and verify HMAC-SHA256 signatures on the `lba_owner_session` HTTP-only cookie.
- **Why this matters:** Even if an owner password is known or shared with clinical staff, the underlying session tokens cannot be forged or manipulated by clients. Rotating `SESSION_SECRET` instantly revokes all active session cookies without altering the owner password.
- **Git History & Repo Safety:** No `.env` or `.env.local` files are tracked in git history or repository commits. All secrets remain strictly in local environment files or Vercel dashboard settings.

### 🩺 Verifying Runtime Health (`/api/health`)
The public endpoint `/api/health` inspects configured credentials at runtime without exposing raw secrets:
- `llm.geminiConfigured`: Returns `true` when a valid `GEMINI_API_KEY` is present.
- `llm.grokConfigured`: Returns `true` when `XAI_API_KEY` is configured.
- `database.mode`: Displays `supabase_postgres` when connected to Supabase, or `in_memory_store` in local offline development.
- `ownerConsole.protected`: Confirms route guards are active with HMAC-SHA256 cookie signing.

---

## 🏃 Running Locally & Executing Test Suites

```bash
# 1. Clone repository
git clone https://github.com/NAMAN121208/local-business-assistant.git
cd local-business-assistant

# 2. Install dependencies
npm install

# 3. Test LLM provider connection & model latency
npm run test:llm

# 4. Run Multilingual Bot & Safety Guardrail Test Suite (10/10 tests)
npm run test:bot

# 5. Run Owner Console, Auth & Correction Verification Suite (8/8 tests)
npm run test:owner

# 6. Run Channel Adapters Verification Suite (Telegram, WhatsApp & Web Parity)
npm run test:channels

# 7. Run Full Evaluation Suite & Before/After Replay (65 cases)
npm run eval

# 8. Start local Next.js development server
npm run dev
```

Visit:
- Customer Chat: [http://localhost:3000](http://localhost:3000)
- Public Guide: [http://localhost:3000/guide](http://localhost:3000/guide)
- Owner Console: [http://localhost:3000/owner](http://localhost:3000/owner)
- API Health: [http://localhost:3000/api/health](http://localhost:3000/api/health)

---

## 📡 Multi-Channel Architecture & Integrations

The application features a decoupled channel adapter subsystem (`src/lib/channels`) built on a common `ChannelAdapter` interface:
- **`verifyRequest(req, rawBody)`**: Enforces cryptographic signatures or secret tokens.
- **`parseIncoming(req, body)`**: Normalizes heterogeneous platform payloads into `{ channel, senderId, messageId, text, displayName?, phone? }`.
- **`send(recipientId, { text, quickReplies? })`**: Formats and delivers outbound replies with platform-specific interactive elements (inline buttons, list menus, contact sharing).

### Channel Implementation & Testing Status

| Channel | Live Webhook | Testing Status | Supported Features |
| :--- | :---: | :---: | :--- |
| **Customer Web Chat** (`/`) | **LIVE** | **Live Tested & Evaluated** | Multilingual chat, relative booking dates, instant responses, responsive mobile layout, session cookie ownership. |
| **Telegram Bot** (`/api/telegram`) | Configurable | **Verified via Mock Test Suite (`npm run test:channels`)** | `X-Telegram-Bot-Api-Secret-Token` verification, inline keyboard slot buttons, `/start` disclaimer, non-text message handling, contact sharing phone verification, owner alert notifications. |
| **WhatsApp Cloud API** (`/api/whatsapp`) | Configurable | **Verified via Mock Test Suite (`npm run test:channels`)** | GET challenge verification, constant-time `X-Hub-Signature-256` HMAC validation, interactive reply buttons (up to 3 slots), interactive list menus (> 3 slots), 24-hour service window enforcement, owner console reply delivery. |

---

### 1. Telegram Bot Setup Guide

1. **Create Bot:** Message `@BotFather` on Telegram, create a new bot (e.g. `@CityHealthClinicBot`), and obtain your `TELEGRAM_BOT_TOKEN`.
2. **Generate Webhook Secret:** Choose a secure random string for `TELEGRAM_WEBHOOK_SECRET`.
3. **Register Webhook:**
   ```bash
   curl -F "url=https://your-domain.vercel.app/api/telegram" \
        -F "secret_token=YOUR_TELEGRAM_WEBHOOK_SECRET" \
        https://api.telegram.org/bot<YOUR_TELEGRAM_BOT_TOKEN>/setWebhook
   ```
4. **Owner Alerts (Optional):** Message `@userinfobot` to find your personal Telegram chat ID, and set `TELEGRAM_OWNER_CHAT_ID`. When patients trigger medical escalations or book appointments, the bot dispatches an immediate alert to your Telegram.
5. **Key Telegram Capabilities:**
   - **Interactive Slot Options:** Available appointment slots are rendered as inline keyboard buttons.
   - **Contact Sharing:** For appointment cancellation or ownership checks, users can tap a one-click *"📱 Share Phone Number"* button (`request_contact: true`) to verify their identity without typing.
   - **Idempotency & Rate Limiting:** Duplicate `message_id` deliveries from Telegram are ignored; requests are rate-limited per `(telegram, chatId)` at 20 msgs/min.

---

### 2. WhatsApp Cloud API (Meta Graph API) Setup Guide

1. **Meta Developer App:** Create a Business App on [developers.facebook.com](https://developers.facebook.com) and add the **WhatsApp** product.
2. **Obtain Credentials:**
   - In WhatsApp > API Setup, note your **Phone number ID** (`WHATSAPP_PHONE_NUMBER_ID`) and the temporary access token.
   - For production, create a System User in Business Settings with `whatsapp_business_messaging` permission to obtain a permanent `WHATSAPP_ACCESS_TOKEN`.
   - In App Settings > Basic, copy your **App Secret** (`WHATSAPP_APP_SECRET`).
3. **Register Webhook in Meta Dashboard:**
   - **Callback URL:** `https://your-domain.vercel.app/api/whatsapp`
   - **Verify Token:** Your chosen secret string (`WHATSAPP_VERIFY_TOKEN`).
   - Under Webhook Fields, subscribe to **`messages`**.
4. **Meta Test Number Allowlist Limits:**
   - Meta developer accounts provide a free sandbox test phone number. This test number **can only deliver messages to up to 5 recipient phone numbers** added and verified in your developer dashboard "To" allowlist.
   - For public patient traffic, add a real phone number in WhatsApp > Configuration and complete Meta Business Verification.
5. **24-Hour Customer Service Window Policy:**
   - Meta strictly enforces a **24-hour customer service window** for WhatsApp Business.
   - When a patient sends a message, a 24-hour window opens. Within this window, the bot can reply with free-form text and interactive components.
   - If more than 24 hours have elapsed since the patient's last inbound message, WhatsApp blocks free-form text messages. Our adapter automatically inspects the interaction timestamp: if expired, it safely skips delivery and logs a diagnostic warning to avoid Meta policy violations.
6. **Key WhatsApp Capabilities:**
   - **Interactive Reply Buttons:** When 1 to 3 slot options are returned (e.g. morning OPD slots), Meta interactive buttons are rendered.
   - **Interactive List Menus:** When more than 3 options exist (up to 10 slots), an interactive list menu is rendered.
   - **Phone Ownership Verification:** The sender's phone number (`message.from`) is extracted directly from the verified Meta payload and mapped to the patient's record, enabling friction-free cancellation and booking verification.
   - **HMAC Signature Verification:** All incoming webhooks are validated using constant-time `crypto.timingSafeEqual` comparison against `X-Hub-Signature-256`.

---

### 3. Owner Console Reply Routing (Console to Customer Channel)

When clinic staff review an escalated conversation in the Owner Console at `/owner/inbox/[id]` and send a manual reply:
1. The message is persisted in the database message thread with `sender: "owner"`.
2. The system checks `conversation.channel`:
   - If `telegram`: Dispatches outbound message via Telegram Bot API with a `👨‍⚕️ City Health Clinic Staff:` prefix.
   - If `whatsapp`: Dispatches outbound message via Meta Graph API with a `👨‍⚕️ City Health Clinic Staff:` prefix.
   - If `web`: Delivered synchronously on next patient polling interval.
3. If channel network delivery fails (e.g. temporary API timeout or expired window), the failure is logged and returned in the API response, but the message remains safely stored in the console database thread without data loss.

---

## 🛡️ Data Handling, Privacy & Conversation Retention (Part 7)

### What Data Is Stored & Where
- **Customer Conversations & Messages:** When customers chat with the bot, conversation records and messages are stored in Supabase PostgreSQL (or ephemeral memory in local dev) to maintain context, allow owner review, and populate daily summaries.
- **Bookings:** Patient appointments (service, appointment time window, customer name, contact phone) are stored in the `bookings` table.
- **Escalations:** Queries flagged for human review (medical symptoms, complaints) are recorded in the `escalations` table.
- **Knowledge Base Versions:** Versioned audit log of clinic facts and rules approved by the owner.

### Server Log Privacy (Zero-PII Logging)
- **Customer message bodies, names, and phone numbers are NEVER written to stdout or server logs.**
- API route telemetry logs strictly metadata: `event`, `conversationId`, `decision` (`answer`, `act`, `escalate`), `provider` (`gemini`, `grok`, `fallback`), and `latencyMs`.

### How to Purge / Delete Customer Data
For GDPR/DPDP privacy compliance or demo maintenance, data can be purged using the provided CLI maintenance script:
```bash
# Purge all customer conversations and messages
npx tsx scripts/purge-conversations.ts

# Purge conversations older than 30 days
npx tsx scripts/purge-conversations.ts --days=30
```
In the Owner Console, owners can also reset demo conversations at `/api/owner/demo-data` (which only resets demo-tagged records and never deletes real patient bookings).

---

## ⚙️ Production Environment Variables on Vercel (Part 9)

Every environment variable required in production on Vercel is listed below with its behavior if omitted:

| Variable Name | Required? | Purpose & Value | Behavior If Missing in Production |
|---|---|---|---|
| `OWNER_PASSWORD` | **REQUIRED** | Secret password for owner console login (`/owner`) | **HTTP 503:** Owner login completely disabled with logged alert. No default fallback exists. |
| `SESSION_SECRET` | **REQUIRED** | High-entropy secret for HMAC-SHA256 session cookie signing | **HTTP 503:** Cookie creation fails. App refuses to start unauthenticated. |
| `SUPABASE_URL` | **REQUIRED** | Supabase PostgreSQL project URL | App logs fatal error. Fails to start unless `USE_MEMORY_DB=true`. |
| `SUPABASE_SERVICE_ROLE_KEY` | **REQUIRED** | Supabase service role key (or `SUPABASE_ANON_KEY`) | DB operations fail. App cannot persist bookings or approved KB versions. |
| `GEMINI_API_KEY` | **REQUIRED** | Primary LLM inference API key (Google Gemini) | App fails over immediately to secondary backup (Groq/xAI). If all unset, deterministic fallback returns. |
| `GEMINI_MODEL` | Optional | Primary model ID (Default: `gemini-flash-lite-latest`) | Uses built-in default (`gemini-flash-lite-latest`). |
| `GROQ_API_KEY` | Recommended | Secondary LLM backup API key (Groq fast LPU inference) | Failover skips Groq and attempts xAI or safe fallback. |
| `GROQ_MODEL` | Optional | Groq model ID (Default: `qwen/qwen3.8-27b`) | Uses default `qwen/qwen3.8-27b`. |
| `XAI_API_KEY` | Optional | Secondary LLM backup API key (xAI Grok) | Skipped if unset. |
| `XAI_MODEL` | Optional | xAI model ID (Default: `grok-2-latest`) | Uses default `grok-2-latest`. |
| `PRIMARY_PROVIDER` | Optional | Primary provider selection (`gemini` or `grok`) | Defaults to `gemini`. |
| `USE_MEMORY_DB` | Optional | Set to `true` for local development without DB | Defaults to `false` in production. |
| `TELEGRAM_BOT_TOKEN` | Optional | Bot token from @BotFather for Telegram channel | **HTTP 503:** Telegram webhook disabled. Web chat unaffected. |
| `TELEGRAM_WEBHOOK_SECRET` | Optional | Secret token header for webhook verification (`X-Telegram-Bot-Api-Secret-Token`) | If Telegram token is set in production without secret, webhook returns HTTP 500 to prevent spoofing. |
| `TELEGRAM_OWNER_CHAT_ID` | Optional | Telegram chat ID for instant escalation alerts | Owner notifications skipped. |

---

## 🔒 Known Limitations & Responsible AI Disclosures

1. **Strictly Non-Clinical:** The assistant is explicitly constrained to administrative and logistical tasks (timings, directions, bookings, doctor schedules). It never provides medical diagnoses, medication recommendations, or drug dosages.
2. **Emergency Routing:** Emergency requests provide the clinic's 24/7 hotline (`+91 98765 99999`) and recommend visiting casualty immediately.
3. **Voice Hardware:** In this web implementation, voice dictation leverages the user's system Wispr Flow hotkey dictating into standard HTML text inputs.
4. **Serverless In-Memory State vs. Database Concurrency Guarantees:**
   - **Best-Effort In-Memory Controls:** On serverless platforms like Vercel, the IP rate limiter (20 req/min), owner login brute-force lockout (5 failed attempts), LLM provider circuit breaker, and application-level slot lock mutex (`activeSlotLocks`) operate in memory per container instance. When traffic scales across multiple cold/warm serverless workers, these controls operate as best-effort defenses.
   - **Authoritative Concurrency Protection:** True multi-instance double-booking prevention is enforced authoritatively at the database layer via PostgreSQL partial unique index:
     ```sql
     CREATE UNIQUE INDEX idx_unique_confirmed_booking_slot
     ON bookings (business_id, service, start_time)
     WHERE (status = 'confirmed');
     ```
     This guarantees zero double-bookings even under extreme concurrent bursts across distributed serverless functions. If two requests slip through the in-memory mutex on different instances, PostgreSQL rejects the second insertion with code `23505`, and the orchestrator catches it gracefully and offers the next nearest slots.

---

*Developed for the No Hands: The Wispr Challenge (WeMakeDevs x Wispr Flow).*
