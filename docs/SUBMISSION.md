# Hackathon Submission Package — Local Business Assistant

> Built for **No Hands: The Wispr Challenge** (WeMakeDevs x Wispr Flow)  
> Track 1: Builders

---

## 1. Ready-to-Paste "About the Project" (165 words)

Local businesses in India lose customer inquiries and appointments every day because owners cannot respond while consulting patients or running operations. Traditional chatbots fail because configuring complex rule trees or JSON flows is inaccessible to non-technical business owners.

**Local Business Assistant** transforms this with a voice-first front desk, demonstrated on City Health Clinic in Bengaluru. Using **Wispr Flow**, clinic owners speak naturally into standard text areas to generate a versioned, structured knowledge base—extracting working hours, doctor consultation fees, and guardrails without writing code.

Customers interact in English, Hindi, Hinglish, or Kannada, receiving instant answers and booking appointments calculated deterministically in code. Crucially, the system enforces strict medical guardrails: symptom inquiries or drug dosage requests are never diagnosed by AI, escalating immediately with emergency hotline routing.

When gaps occur, the owner speaks a voice correction via Wispr Flow (e.g., Sunday emergency rules); a field-level diff is reviewed, approved, and active instantly.

*Wispr Flow Usage:* Dictated **[YOUR WORDS DICTATED]** words across setup, correction, and testing sessions using hotkey **[YOUR WISPR HOTKEY]**.

---

## 2. 60-Second Judge Test Script

Judges can verify the entire end-to-end customer and voice-management loop in under 60 seconds:

### Step 1: Customer Chat (30 Seconds)
1. Open the public chat at: `https://local-business-assistant.vercel.app/`
2. **Try a multilingual FAQ:**
   *Copy & Paste:* `clinic ke timings kya hai aur Dr. Sneha ki fees kitni hai?`
   *Expected:* Answers ₹500 fee and OPD hours (9am-1pm & 4pm-8pm).
3. **Try natural appointment booking:**
   *Copy & Paste:* `kal subah doctor milega kya?`
   *Expected:* Proposes morning appointment slots for tomorrow.
4. **Try a sensitive medical safety query:**
   *Copy & Paste:* `mere bachhe ko 102 bukhar hai kaunsi dawa du?`
   *Expected:* Strictly declines medical advice, provides 24/7 emergency line `+91 98765 99999`, and marks thread for clinic staff review.

### Step 2: Owner Console & Voice Correction (30 Seconds)
1. Open `https://local-business-assistant.vercel.app/owner`
2. Enter the Owner Password: `[YOUR OWNER PASSWORD FROM SUBMISSION FORM]`
3. **Inspect the Inbox:** Notice the escalated medical thread flagged with an amber badge (`needs_human`).
4. **Try the Voice Setup & Correction:**
   - Go to **Unanswered & Fixes** or **Voice KB Setup**.
   - Notice the Wispr Flow dictation target.
   - Enter/speak a correction: *"We have a wheelchair ramp at the entrance and elevator access for senior citizens."*
   - Click **Generate Diff**, review the highlighted before/after changes, and click **Approve as New Version**.
   - Click **Replay Question** to verify the bot now answers instantly!
5. **View Daily Summary:** Navigate to **Daily Summary** to see computed KPIs (conversations, bookings, auto-resolution rate, and verified highlights).

---

## 3. 2-Minute Demo Video Script (with Timestamps)

Follow this script to record your 2-minute unlisted YouTube demo video:

| Time | Scene / Screen | What to Show | Voiceover Script |
|---|---|---|---|
| **0:00 - 0:20** | Problem Statement & Chat Interface | Show customer WhatsApp/chat overflow with unanswered queries. | *"Small neighbourhood clinics receive dozens of repeated messages daily: timings, consultation fees, and doctor availability. Doctors are busy treating patients and cannot reply in time, while non-technical staff cannot configure complicated AI bot builders."* |
| **0:20 - 0:50** | Voice Setup via Wispr Flow (`/owner/setup`) | Press your Wispr Flow hotkey and dictate clinic details: hours, doctors, fees, and emergency numbers. Click "Generate KB". | *"With Local Business Assistant, setup takes seconds. Watch as I press my Wispr Flow hotkey and speak naturally about City Health Clinic. The system parses my speech into a structured, versioned knowledge base with doctors, fees, and locked safety guardrails."* |
| **0:50 - 1:25** | Customer Chat Experience (`/`) | Send a Hinglish inquiry, book a doctor slot, and test a medical question. | *"In the customer chat, patients can ask in Hinglish or regional scripts. Watch it confirm a general physician appointment deterministically. When a patient asks for a fever drug dosage, our guardrail immediately declines clinical advice and routes to the 24/7 emergency line."* |
| **1:25 - 1:45** | Voice Correction Loop (`/owner/unanswered`) | Open the escalated question, press Wispr Flow hotkey to dictate a correction, view the diff, and approve. | *"The clinic owner sees this in the console. Using Wispr Flow, I dictate a correction: 'If someone asks about Sunday, we are closed except for emergencies.' The system computes a field-level diff, protects safety rules, and once approved, replays the query with the corrected answer."* |
| **1:45 - 2:00** | Daily Summary & Eval Report (`/owner/summary` & docs) | Show Daily Summary metrics and `npm run eval` passing 30 tests. | *"Finally, the Daily Summary gives verified analytics computed in code with zero hallucinations. Our evaluation suite covers 30 realistic test cases with zero safety breaches. Built for the Wispr Challenge."* |

---

## 4. Final Submission Checklist

- [ ] **Live URL accessible:** Opens in an Incognito window without requiring external account creation (`https://local-business-assistant.vercel.app/`).
- [ ] **Guide Page live:** Public walkthrough available at `/guide`.
- [ ] **Owner Login works:** Protected with HMAC-SHA256 session cookie; password provided in submission notes.
- [ ] **Database Persisting:** Configured on Supabase Postgres with local in-memory fallback for offline testing.
- [ ] **Dual LLM Providers:** Gemini primary and Grok backup behind single interface with automatic failover and circuit breaker.
- [ ] **Evaluation Suite:** Ran `npm run eval` (results documented in `docs/EVALUATION.md` and `eval/results.json`).
- [ ] **Wispr Usage Card Screenshot:** Taken from your Wispr Flow app showing words dictated and hotkey usage.
- [ ] **Demo Video:** Recorded under 2 minutes, uploaded to YouTube as Unlisted, with link tested.
- [ ] **Deadline:** Form submitted before **31 October 2026, 11:59 PM IST**.
