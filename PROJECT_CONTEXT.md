# Project Context: Local Business Assistant

> Purpose of this file: give an AI coding assistant (Antigravity) the full background, scope, features and working of the project so that later prompts can build on it without re-explaining. Treat this as the source of truth. Where something is marked "suggested", it is a default that can be changed. Where something is marked "required", it comes from the hackathon rules.

---

## 1. One-line summary

A chatbot for small local businesses (shop, clinic, salon, tuition centre, etc.) that answers customer questions, takes bookings and orders, and escalates anything it cannot handle to the owner. The owner sets it up and corrects it by speaking (voice dictation via Wispr Flow), not typing.

---

## 2. Hackathon context (required constraints)

- **Event:** "No Hands: The Wispr Challenge" by WeMakeDevs x Wispr Flow. Online, solo, open to people in India.
- **Dates:** 16 to 31 October 2026. **Submission deadline: Saturday 31 October 2026, 11:59 pm IST.**
- **Track:** Track 1, Builders (for developers): a working software product that solves a problem in the builder's own work. Dictate requirements and follow-ups into coding tools and let them do the coding.
- **Core theme:** build the tool using voice. Prompts, specs, docs, messages and commit notes should be dictated through Wispr Flow. Keyboard is allowed for shortcuts and small fixes.
- **Submission must include:**
  1. A link to the working project (judges must be able to open and try it without paying or asking for access; if a sign-in is needed, provide a test login and sample input in the description).
  2. A demo video of up to 2 minutes.
  3. A screenshot of the Wispr usage card (Insights in the Wispr Flow desktop app).
  4. A few lines on the problem, who it is for, and how Wispr was used.
- **Judging emphasis (from the page):** a working tool, one real result it produced, and how much of the writing went through Flow.
- **Implication for design:** the project must be easy for a judge to open and try in about a minute. Prefer a public web demo or a Telegram bot with sample data over anything that needs approvals or paid accounts.

---

## 3. Problem

Small local businesses get the same ten or so messages every day: opening hours, prices, location, availability, "can I book tomorrow evening", "do you deliver to my area". The owner answers them manually between other work. Consequences:

- Owner time is wasted on repetitive replies.
- Slow replies (late evening, busy hours) lose customers.
- Bookings and orders get scattered across chats and are missed or double-booked.
- Answers are inconsistent depending on who replies.
- Existing chatbot products are too expensive, too complex, or not available in regional languages.

Customers already use WhatsApp, so a solution must meet them where they are with nothing new to learn.

---

## 4. Target users

1. **Business owner (primary configurer):** non-technical, busy, may be more comfortable speaking than typing, may use a regional language. Sets up and corrects the bot by voice.
2. **Customer (primary chatter):** messages the business in English, Hindi, Kannada or another Indian language, usually on a phone.
3. **Staff member (optional):** receives escalations and booking summaries.

Example businesses to support: neighbourhood clinic, kirana or general store, salon, tuition centre, small restaurant or tiffin service, repair shop.

---

## 5. Goals and non-goals

### Goals
- Answer common customer questions correctly from a business-specific knowledge base.
- Take bookings and simple orders end to end, with availability checking.
- Escalate to the human owner whenever unsure or when the topic is sensitive.
- Let the owner create and correct the knowledge base by speaking.
- Reply in the customer's language.
- Give the owner a clear daily summary.
- Be demoable in under two minutes and testable by a judge in about a minute.

### Non-goals (for the hackathon version)
- No payments processing.
- No medical, legal or financial advice. For a clinic the bot handles logistics only (timings, location, booking, doctor availability).
- No multi-business SaaS billing or tenant management beyond a simple per-business config.
- No custom speech-to-text engine. Voice input for setup comes from Wispr Flow dictating into text fields.
- No dependency on WhatsApp Business API approval for the submission (see channels).

---

## 6. System overview

```
Customer (Telegram / web chat / WhatsApp)
        |
        v
 Channel adapter  --->  Message normaliser (text, language, user id)
        |
        v
 Orchestrator (LLM with tools)
   |-- reads: Business knowledge base (FAQ, hours, services, prices, policies)
   |-- reads/writes: Bookings / Orders store (availability check, create, cancel)
   |-- decides one of: ANSWER | ACT | ESCALATE
   |-- logs: conversation + decision + confidence + reason
        |
        +--> Reply to customer (in customer's language)
        +--> Notification to owner (on escalation or new booking)
        |
        v
 Owner console (web UI)
   |-- Voice-dictated setup of knowledge base
   |-- Review of conversations, escalations, unanswered questions
   |-- Correction loop (dictate a fix, knowledge base updates)
   |-- Daily summary
```

### Channels
- **Primary for demo and judging (suggested):** a public web chat page for customers and a web console for the owner, with sample business data preloaded. Optionally also a Telegram bot, which is quick to set up and free.
- **Real-world deployment path (documented, not required to be live):** WhatsApp Business via Meta Cloud API or a provider such as Twilio. Approval can take time, so do not make the submission depend on it. The channel adapter should be a thin layer so adding WhatsApp later only means writing one more adapter.

---

## 7. Detailed working (end to end)

### 7.1 Owner setup (voice-first)
1. Owner opens the console and creates a business profile: name, type, address, phone, languages supported, timezone.
2. Owner speaks (via Wispr Flow dictation into the setup text area) everything about the business in free form, for example: opening hours, services and prices, delivery area, booking rules, holidays, what the bot must never answer.
3. The system sends this raw text to the LLM, which converts it into a **structured knowledge base**:
   - Business facts (hours, address, contact)
   - Services or products with prices and durations
   - FAQs (question, answer, language variants)
   - Booking rules (slot length, capacity per slot, working days, lead time, cancellation policy)
   - Escalation rules (topics or keywords that must go to a human)
   - Tone settings (formal or friendly, sign-off line)
4. The owner sees the structured result in an editable view, can approve it, and can dictate changes ("we are closed on Sundays except emergencies").
5. The knowledge base is saved and versioned so changes can be reviewed and rolled back.

### 7.2 Customer conversation
For every incoming customer message the orchestrator does the following:

1. **Normalise:** extract text, detect language, identify the customer (session id or phone number), load recent conversation history.
2. **Understand intent:** classify into one of: `faq`, `booking_create`, `booking_change_or_cancel`, `order_create`, `availability_check`, `greeting_or_smalltalk`, `complaint`, `sensitive_or_out_of_scope`, `unknown`.
3. **Ground the answer:** retrieve only the relevant parts of the knowledge base. The bot must answer from the knowledge base and must not invent facts such as prices or hours.
4. **Decide one of three paths:**
   - **ANSWER:** the knowledge base clearly covers it. Reply directly.
   - **ACT:** the customer wants a booking, change, cancellation or order. Run the slot-filling flow (below).
   - **ESCALATE:** complaint, sensitive topic, price exception, anything not covered, or low confidence. Tell the customer a person will follow up, and notify the owner with a short summary.
5. **Reply** in the customer's language, in the configured tone, keeping messages short and mobile-friendly.
6. **Log** the message, intent, decision, confidence, knowledge-base entries used, and any tool calls.

### 7.3 Booking flow (slot filling)
Required details: service, date, time, customer name, contact number (if not already known).

1. Bot detects booking intent and asks only for the missing details, one or two at a time.
2. Bot normalises relative dates ("tomorrow evening", "this Saturday") using the business timezone.
3. Bot calls the availability tool with service, date and time window.
4. If a slot is free, bot proposes up to 3 options. If none, it offers the nearest alternatives.
5. Customer picks one. Bot asks for a final confirmation ("Confirm Dr. consultation on Wed 29 Oct at 6:00 pm?").
6. On confirmation the bot creates the booking, replies with a summary and booking id, and notifies the owner.
7. Cancel and reschedule: customer provides booking id or the bot finds the booking by contact number, then confirms the change and updates the store. Cancellation policy from the knowledge base is quoted when relevant.
8. Safeguards: no double booking of the same slot beyond capacity, no bookings outside working hours or on holidays, no bookings in the past.

### 7.4 Order flow (for shops, restaurants, tiffin services)
1. Customer sends items and quantities in free text ("2 kg rice, 1 oil packet, 6 eggs").
2. Bot matches items against the catalogue in the knowledge base, confirms ambiguous matches, flags unavailable items.
3. Bot computes the total from catalogue prices, asks for delivery or pickup, and delivery address if needed (checking the delivery area rule).
4. Bot shows the order summary and asks for confirmation.
5. On confirmation it creates the order and notifies the owner. Payment is out of scope; the summary states the payment method (for example "cash on delivery").

### 7.5 Escalation flow
Escalate (do not answer) when any of these is true:
- Intent is `complaint` or `sensitive_or_out_of_scope`.
- The question is not covered by the knowledge base.
- Model confidence is below a threshold.
- The message matches an owner-defined "never answer" rule (for a clinic: medical advice, medicine dosage, diagnosis, emergencies).
- The customer asks for a human, or is angry or repeats themselves.
- A requested action would break a rule (for example, a discount the owner has not authorised).

Escalation behaviour:
- Customer receives a polite holding message with an expected follow-up time if configured. For emergencies the bot shares the emergency number from the knowledge base.
- Owner receives a notification with the customer message, a one-line AI summary, the reason for escalation, and a suggested reply.
- The conversation is marked "needs human" in the console until the owner resolves it. The owner can reply from the console, and the thread continues.

### 7.6 Correction and learning loop (key demo moment)
1. Owner opens a conversation or an "unanswered questions" list in the console.
2. Owner sees where the bot was wrong or had to escalate.
3. Owner dictates a fix by voice, for example: "If someone asks about Sunday, we are closed except for emergencies, and the emergency number is the same as the clinic number."
4. The system turns the dictation into a knowledge-base update, shows a diff (before and after), and the owner approves.
5. The bot uses the updated knowledge immediately. The question can be replayed to show the corrected answer.

### 7.7 Daily summary for the owner
Generated once per day (or on demand) and shown in the console, optionally pushed to Telegram or email:
- New bookings and orders with times.
- Cancelled or changed bookings.
- Escalations still open.
- Top questions asked today.
- Questions the bot could not answer (candidates to add to the knowledge base).
- Simple counts: conversations, auto-resolved percentage, escalated percentage.

### 7.8 Multilingual behaviour
- Detect the customer's language per message (English, Hindi, Kannada first; others via the LLM).
- Reply in the same language, including Romanised or mixed text such as Hinglish or Kanglish.
- The knowledge base is stored in the owner's language(s); the LLM translates at answer time, and numbers, prices, dates and names must be preserved exactly.
- If the language cannot be understood confidently, reply in English and offer to connect to the owner.

---

## 8. Feature list (complete)

### Customer-facing
1. Chat via web page (and Telegram optionally); WhatsApp adapter documented as future path.
2. FAQ answering from the knowledge base (hours, location, services, prices, policies).
3. Availability checking.
4. Booking create, reschedule and cancel with slot filling and confirmation.
5. Order taking with catalogue matching, totals, delivery or pickup, and confirmation.
6. Multilingual replies with automatic language detection.
7. Short, friendly, mobile-appropriate responses in the owner's chosen tone.
8. Polite handover to a human on escalation.
9. Emergency information routing (shares the emergency contact, no advice).
10. Quick-reply buttons or suggestions where the channel supports them (for example slot options).

### Owner-facing (console)
1. Business profile setup.
2. Voice-dictated knowledge base creation (free-form speech turned into structured data).
3. Editable, versioned knowledge base with approve and rollback.
4. Booking and order list with filters and status.
5. Conversation inbox with intents, decisions and "needs human" flag.
6. Reply to escalated conversations from the console.
7. Unanswered-questions list.
8. Voice-dictated correction loop with before and after diff.
9. Daily summary and basic analytics.
10. Escalation rules and "never answer" topics editor.
11. Notifications for new bookings and escalations.

### Safety and quality
1. Answers grounded only in the knowledge base; no invented facts.
2. Confidence threshold with safe fallback to escalation.
3. Sensitive-topic guardrails (medical, legal, financial).
4. Minimal personal data stored (name, contact, booking details) with a clear retention note.
5. Full audit log of messages, decisions and knowledge used.
6. Basic abuse and spam handling (rate limiting, ignore empty or repeated spam).

### Hackathon-specific
1. Preloaded demo business with sample data so judges can try it immediately.
2. A built-in evaluation set and a script that reports accuracy (see section 11).
3. Demo mode that makes the voice-setup and correction loop easy to show.

---

## 9. Data model (suggested)

- **Business:** id, name, type, address, phone, emergency_phone, timezone, languages, tone, created_at.
- **KnowledgeBaseVersion:** id, business_id, version, content (structured JSON), raw_source_text, created_at, approved_by_owner.
  - content includes: facts, services[], catalogue[], faqs[], booking_rules, escalation_rules, never_answer[], holidays[].
- **Customer:** id, business_id, name, contact, preferred_language, first_seen_at.
- **Conversation:** id, business_id, customer_id, channel, status (`open` | `resolved` | `needs_human`), created_at, updated_at.
- **Message:** id, conversation_id, sender (`customer` | `bot` | `owner`), text, language, intent, decision (`answer` | `act` | `escalate`), confidence, kb_refs[], tool_calls[], created_at.
- **Booking:** id, business_id, customer_id, service, start_time, end_time, status (`confirmed` | `cancelled` | `completed`), notes, created_at.
- **Order:** id, business_id, customer_id, items[] (name, qty, unit_price), total, fulfilment (`pickup` | `delivery`), address, status, created_at.
- **Escalation:** id, conversation_id, reason, ai_summary, suggested_reply, status (`open` | `resolved`), resolved_at.
- **DailySummary:** id, business_id, date, metrics, highlights, unanswered_questions[].

---

## 10. Orchestrator design (suggested)

- **Single LLM-with-tools loop** per incoming message, with a strict system prompt containing: business profile, tone, current date and time in the business timezone, relevant knowledge-base slices, safety rules, and the output contract.
- **Tools the LLM can call:**
  - `search_knowledge_base(query)` returns top matching entries.
  - `check_availability(service, date, time_window)` returns free slots.
  - `create_booking(...)`, `update_booking(...)`, `cancel_booking(...)`, `find_booking(contact)`.
  - `match_catalogue_items(text)`, `create_order(...)`.
  - `escalate(reason, summary, suggested_reply)`.
- **Structured output** for every turn: `{ intent, decision, reply_text, language, confidence, kb_refs, tool_calls }`. The decision field drives routing; if confidence is below the threshold the system forces `escalate`.
- **Retrieval:** for small knowledge bases, passing the whole structured knowledge base in context is acceptable. For larger ones, use embedding search over FAQ and catalogue entries.
- **Deterministic code owns the rules.** Availability, capacity, working hours, holidays and totals are computed in code, not by the LLM. The LLM only chooses which tool to call and phrases the reply.
- **Statelessness:** load the last N messages of the conversation each turn so the service can scale and restart safely.

### Conversation examples to support

1. FAQ: "Aaj shop khula hai kya?" -> bot answers today's hours in Hinglish.
2. Booking: "Tomorrow evening doctor available?" -> bot asks which service or doctor if needed, checks slots, offers 3 options, confirms, books.
3. Order: "2 kg rice, 1 oil, 6 eggs, deliver to Vidyanagar" -> bot matches items, checks delivery area, shows total, confirms.
4. Escalation: "My child has fever, what medicine should I give?" -> bot declines medical advice, shares clinic booking and emergency number, notifies owner.
5. Unknown: "Do you do bridal makeup?" (not in knowledge base) -> bot says it will check, escalates, adds to unanswered list.
6. Complaint: "Your staff was rude yesterday" -> apologises politely, escalates with summary.
7. Cancellation: "Cancel my appointment tomorrow" -> finds booking by contact, confirms, cancels, quotes policy.

---

## 11. Evaluation plan (a differentiator for judging)

- Build a small test set of **20 to 30 real or realistic customer messages** covering: FAQ, booking, cancel, order, out-of-scope, complaint, sensitive, multilingual.
- Each test case has: input message(s), expected decision (`answer` | `act` | `escalate`), and expected key facts or outcome.
- A script runs all cases against the bot and prints: overall accuracy, accuracy per category, list of failures, and percentage correctly escalated.
- Report the numbers in the README and demo video. Re-run after a voice-dictated correction to show improvement.
- Key safety metric: **zero cases where the bot answered a sensitive or out-of-scope question instead of escalating.**

---

## 12. Demo plan (max 2 minutes)

1. (0:00 to 0:20) Show the problem: a messy chat of repeated customer questions for a real or realistic business.
2. (0:20 to 0:50) Owner speaks the business details using Wispr Flow; structured knowledge base appears.
3. (0:50 to 1:25) Customer chats: FAQ in a regional language, then a booking confirmed, then a sensitive question escalated.
4. (1:25 to 1:45) Owner sees the unanswered question, dictates a correction, bot now answers it correctly.
5. (1:45 to 2:00) Show daily summary and the evaluation accuracy result.

---

## 13. Suggested tech stack (flexible)

- **Frontend:** React or Next.js (or plain HTML and JS) for the customer chat page and owner console, mobile-first.
- **Backend:** Node.js (Express or Next.js API routes) or Python (FastAPI).
- **Database:** SQLite or Postgres (Supabase is fine). Keep the schema in section 9.
- **LLM:** any capable model via API (for example Claude or Gemini) with tool calling and JSON output. Keep the model behind one interface so it can be swapped.
- **Channels:** web chat (required for demo), Telegram Bot API (optional, free and quick), WhatsApp Cloud API adapter (documented path).
- **Notifications:** Telegram message or email to the owner.
- **Hosting:** any free tier that gives a public URL (Vercel, Render, Railway, Cloudflare). Judges must be able to open it without signing up, so preload demo data and include a test login if the console is protected.

---

## 14. Build priorities for the remaining time

The deadline is close, so build in this order and stop adding features when time runs out:

1. **Must have (core demo):** customer web chat, knowledge base (structured JSON), FAQ answering, booking flow with availability, escalation with owner notification, owner console with voice-dictated setup, preloaded demo business.
2. **Should have:** correction loop with diff, multilingual replies (English, Hindi, Kannada), daily summary, evaluation script with accuracy report.
3. **Nice to have:** order flow with catalogue matching, Telegram channel, version history and rollback, analytics, WhatsApp adapter stub.

---

## 15. Risks and mitigations

| Risk | Mitigation |
|---|---|
| WhatsApp API approval takes too long | Demo on web chat or Telegram; keep adapter pattern and document the WhatsApp path |
| LLM invents prices or hours | Ground strictly in the knowledge base, require `kb_refs`, force escalation when nothing matches |
| Sensitive medical or legal questions | Never-answer rules, guardrail prompt, escalation, evaluation test cases for these |
| Double bookings or wrong dates | Availability and date logic in deterministic code, timezone-aware, confirmation step |
| Judges cannot access the app | Public URL, preloaded demo data, test login in the submission text |
| Personal data concerns | Store only what is needed, state retention and handling in README |
| Time shortage | Follow the priority order in section 14 |

---

## 16. Success criteria

- A judge can open the link and have a working conversation within one minute.
- The bot correctly answers, books, or escalates on at least the large majority of the evaluation set, and never answers a sensitive question it should have escalated.
- The demo clearly shows the owner configuring and correcting the bot by voice.
- The submission package is complete: project link, demo video up to 2 minutes, Wispr usage card screenshot, and the short write-up on problem, user and Wispr usage.

---

## 17. Open decisions (to settle in later prompts)

- Which business type is the primary demo (clinic, kirana store, salon, or tuition centre)?
- Which LLM and hosting provider to use?
- Web chat only, or web chat plus Telegram?
- Languages to support at launch (English, Hindi and Kannada suggested)?
- Whether the order flow is included or only bookings and FAQs?

---

## 18. Instructions for the AI assistant reading this file

- Treat sections 2, 5 and 8 as the scope. Do not add features outside them without being asked.
- Keep the design simple and demo-first; prefer working end to end over breadth.
- Keep deterministic logic (availability, totals, dates, capacity) in code, not in the model.
- Keep every integration behind a small interface (LLM, channel, notifier, store) so parts can be swapped.
- Write clear commit messages and a README that explains setup, the demo business, test login, and the evaluation results.
- Ask before making changes that affect the data model or the escalation rules.
