# Local Business Assistant 🏥

> An AI assistant for small local businesses (neighbourhood clinics, salons, shops) that answers customer inquiries, books appointments, and escalates sensitive questions to human staff. Configured and corrected voice-first using **Wispr Flow**.

Built for **"No Hands: The Wispr Challenge"** by WeMakeDevs x Wispr Flow (October 2026) — Track 1 (Builders).

---

## 🚀 Live Links & Repository
- **GitHub Repository:** [https://github.com/NAMAN121208/local-business-assistant](https://github.com/NAMAN121208/local-business-assistant)
- **Public Customer Chat:** `/` (Publicly accessible, no login required)
- **Clinic Owner Console:** `/owner` (Protected by `OWNER_PASSWORD`)
- **Default Owner Dev Password:** `clinic-owner-2026`

---

## 🎙️ How the Voice-Dictated Correction Loop Works

The voice correction loop is the core differentiator for local business owners who are busy and prefer speaking over typing:

```
[Customer Chat]
       │
       ▼ Customer asks an unhandled question (e.g., "Are you open on Sundays?")
[Bot Handover]
       │
       ▼ Bot detects lack of coverage, safely escalates to staff & notifies owner
[Owner Console: /owner/unanswered]
       │
       ▼ Owner presses Wispr Flow hotkey and dictates the correction:
         "If someone asks about Sunday, we are closed except for emergencies,
          and the emergency number is the same as the clinic number."
[Diff Engine]
       │
       ▼ System compares Before vs After, highlights Added/Changed/Removed fields,
         and locks safety rules (cannot accidentally weaken medical guardrails).
[Owner Approval]
       │
       ▼ Owner clicks "Approve & Activate Version", creating an immutable v(N+1).
[Instant Replay]
       │
       ▼ Owner clicks "Replay Question", running the original message through
         the orchestrator to immediately verify the corrected live response.
```

---

## 🌟 Features Completed (Phase 1 + Phase 2)

### Customer-Facing Experience (`/`)
- **Mobile-First Chat:** Sleek, responsive web chat for patient inquiries and doctor bookings.
- **Strict Grounding:** Answers are generated strictly from the active, approved clinic knowledge base.
- **Zero Medical Advice Guardrail:** Automatic deterministic escalation whenever medicine dosages, prescriptions, or clinical diagnosis are requested.
- **Deterministic Booking Engine:** Resolves relative dates ("kal subah", "tomorrow evening") in `Asia/Kolkata` timezone, checks working hours (9am-1pm & 4pm-8pm), excludes Sundays/holidays, prevents double-booking, and returns up to 3 candidate slots.
- **Live Staff Reply Polling:** Chat polls every 4 seconds so that when the clinic owner sends a reply from `/owner/inbox/[id]`, it appears in real-time labelled as **Clinic Team (Staff)**.

### Owner Console (`/owner`)
- **Signed Cookie Authentication:** Protected by `OWNER_PASSWORD` via signed httpOnly session cookies. Unauthenticated requests are rejected with 401 / redirect.
- **Voice-Dictated Setup (`/owner/setup`):** Dictate your entire clinic profile in free-form speech with Wispr Flow. The LLM extracts facts, hours, services, FAQs, booking rules, and highlights missing information without hallucinating.
- **Correction Loop (`/owner/unanswered`):** View escalated questions, dictate corrections by voice, inspect the field-level diff, approve new versions, and replay questions.
- **Conversation Inbox (`/owner/inbox`):** Filter by `Needs Human`, `Open`, or `Resolved`. Inspect full message threads, intent classification, decision routing, confidence scores, provider used, and KB references.
- **Escalation Management & Replies:** Edit AI-suggested replies or dictate custom responses directly into the customer thread, and mark conversations resolved.
- **Appointment Calendar (`/owner/bookings`):** View all booked appointments. Cancelling an appointment instantly frees the 30-min slot in the availability engine.

---

## 🛠️ Architecture & LLM Dual-Provider Failover

- **Primary Provider:** Google Gemini (`gemini-1.5-flash` or `gemini-2.0-flash`)
- **Secondary Provider:** xAI Grok (`grok-2-latest` or `grok-beta`)
- **Failover Wrapper:** Retries once on 429 / 5xx / timeout / schema validation error with backoff. If it still fails, automatically switches to the backup provider. A 60-second circuit breaker trips after 3 consecutive errors.
- **Database:** Supabase Postgres (`src/lib/db/migrations/001_initial_schema.sql` and `002_phase2_schema.sql`) with in-memory fallback for local offline testing.

---

## ⚙️ Environment Variables

Create `.env.local` based on `.env.example`:

```bash
# Primary & Secondary LLM Provider API Keys
GEMINI_API_KEY=your_gemini_api_key_here
XAI_API_KEY=your_xai_api_key_here

# Provider Configuration
PRIMARY_PROVIDER=gemini # 'gemini' or 'grok'
GEMINI_MODEL=gemini-1.5-flash
XAI_MODEL=grok-2-latest

# Owner Authentication
OWNER_PASSWORD=clinic-owner-2026

# Supabase Postgres Configuration
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
USE_MEMORY_DB=false # Set to true for offline in-memory development
```

---

## 🏃 Local Setup & Verification

```bash
# 1. Clone repository
git clone https://github.com/NAMAN121208/local-business-assistant.git
cd local-business-assistant

# 2. Install dependencies
npm install

# 3. Test LLM provider connection
npm run test:llm

# 4. Run Phase 1 Bot Evaluation Test Suite (5/5 passed)
npm run test:bot

# 5. Run Phase 2 Owner Console Test Suite (7/7 passed)
npm run test:owner

# 6. Start development server
npm run dev
```

Visit:
- Public Chat: [http://localhost:3000](http://localhost:3000)
- Owner Console: [http://localhost:3000/owner](http://localhost:3000/owner) (Password: `clinic-owner-2026`)

---

## 🧪 Automated Test Results

### Phase 1: Bot Core Tests (`npm run test:bot`)
- ✅ **FAQ:** Clinic timings and location answered accurately from KB (`decision: answer`).
- ✅ **Booking Availability:** Relative date parsed, candidate slots returned (`decision: act`).
- ✅ **Booking Confirmation:** Slot confirmed and unique booking ID issued (`decision: act`).
- ✅ **Medical Safety Guardrail:** Zero medical advice given; medicine dosage query immediately escalated (`decision: escalate`).
- ✅ **Unknown Query:** Out-of-scope question safely escalated (`decision: escalate`).

### Phase 2: Owner Console Tests (`npm run test:owner`)
- ✅ **Owner Auth:** Unauthenticated access rejected; signed cookie token verified.
- ✅ **Real LLM / Natural Language Path:** Tested with "kal subah doctor milega kya?".
- ✅ **Voice KB Setup:** Extracted structured entities and flagged omitted details.
- ✅ **Correction Loop & Replay:** Computed field-level diff, approved new version, and replayed question.
- ✅ **Safety Invariance:** Enforced code-level locks preventing removal of `never_answer` rules.
- ✅ **Owner Reply & Resolve:** Verified staff reply in customer thread and status transition to `resolved`.
- ✅ **Slot Freeing:** Cancelled booking immediately restored slot availability in the calendar engine.
