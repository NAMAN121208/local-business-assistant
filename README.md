# Local Business Assistant 🏥

> An AI assistant for small local businesses (neighbourhood clinics, salons, shops) that handles customer inquiries, books appointments, and escalates sensitive or unknown topics to human staff. Configured and tuned voice-first using **Wispr Flow**.

Built for **"No Hands: The Wispr Challenge"** by WeMakeDevs x Wispr Flow (October 2026) — Track 1 (Builders).

---

## 🚀 Live Demo & Repository
- **GitHub Repository:** [https://github.com/NAMAN121208/local-business-assistant](https://github.com/NAMAN121208/local-business-assistant)
- **Deployment:** Ready for one-click Vercel deployment. Import `NAMAN121208/local-business-assistant` on [vercel.com/new](https://vercel.com/new).

---

## 🎯 Phase 1 Completed Features
- **Demo Business:** "City Health Clinic" (Indiranagar, Bengaluru) — family medicine & paediatric clinic.
- **Customer Web Chat:** Mobile-first, responsive chat interface at `/` with quick-reply action chips and emergency hotline badge.
- **Strict Grounding & Guardrails:**
  - **Zero Medical Hallucinations:** Immediate deterministic escalation when a customer asks for medical prescriptions, symptom diagnosis, or drug dosages.
  - Answers only from the structured knowledge base (timings, doctors, fees, location, parking).
- **Deterministic Booking Engine:**
  - Relative date parsing ("tomorrow morning", "this Friday") in `Asia/Kolkata` timezone.
  - Working hours (09:00–13:00 & 16:00–20:00), Sunday closure, holiday exclusion, and 30-min slot capacity tracking computed purely in code.
  - Slot proposals (up to 3 candidate slots) and instant booking confirmation with unique booking IDs.
- **Dual-Provider LLM Engine with Failover:**
  - Supports **Gemini** (Primary) and **Grok / xAI** (Backup) through an OpenAI-compatible interface.
  - Automatic retry once on 429 / 5xx / timeout / schema validation error with backoff.
  - Provider failover and 60-second circuit breaker after 3 consecutive errors.
  - Logs provider used (`gemini`, `grok`, `kb_direct`, `deterministic_booking_engine`, or `fallback`) for auditability.
- **Database Layer:**
  - Supabase Postgres schema migration (`src/lib/db/migrations/001_initial_schema.sql`).
  - Typed data-access layer with fallback in-memory store so it runs instantly without setup friction.

---

## 🛠️ Tech Stack
- **Framework:** Next.js 15 (App Router), React 19, TypeScript
- **Styling:** Tailwind CSS, Lucide React
- **Database:** Supabase Postgres / Typed DAL
- **LLM Providers:** Google Gemini (`gemini-1.5-flash`), xAI Grok (`grok-2-latest`) via OpenAI-compatible endpoints
- **Validation:** Zod schemas

---

## ⚙️ Environment Variables

Create a `.env.local` file based on `.env.example`:

```bash
# Primary & Secondary LLM Provider API Keys
GEMINI_API_KEY=your_gemini_api_key_here
XAI_API_KEY=your_xai_api_key_here

# Provider Configuration
PRIMARY_PROVIDER=gemini # 'gemini' or 'grok'
GEMINI_MODEL=gemini-1.5-flash
XAI_MODEL=grok-2-latest

# Supabase Postgres (Optional for initial demo, in-memory DAL used when absent)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

---

## 🏃 Local Setup & Running

```bash
# 1. Clone repository
git clone https://github.com/NAMAN121208/local-business-assistant.git
cd local-business-assistant

# 2. Install dependencies
npm install

# 3. (Optional) Run direct LLM provider health check
npm run test:llm

# 4. Run automated test suite (5/5 core flows: FAQ, Booking step 1, Booking confirmation, Medical guardrail escalation, Unknown question escalation)
npm run test:bot

# 5. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Evaluation Test Suite

Run `npm run test:bot` to verify:
1. **FAQ:** Answers clinic hours and location from the knowledge base (`decision: answer`).
2. **Booking Availability Check:** Parses relative date ("tomorrow morning") and returns free 30-min slots (`decision: act`).
3. **Booking Confirmation:** Finalizes slot and generates confirmed `BK_...` ID (`decision: act`).
4. **Medical Guardrail Safety (Zero Medical Advice):** Asking for medicine dosage triggers immediate escalation (`decision: escalate`).
5. **Unknown Question:** Asking out-of-scope question triggers safe escalation (`decision: escalate`).

---

## 🌐 Deploy to Vercel

1. Push your repository to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) and select `local-business-assistant`.
3. Add `GEMINI_API_KEY` (and optionally `XAI_API_KEY` and Supabase keys) under **Environment Variables**.
4. Click **Deploy**.
