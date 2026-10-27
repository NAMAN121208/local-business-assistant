# Local Business Assistant

> An AI assistant for local businesses (clinics, salons, kirana stores, tuition centres) that handles FAQs, bookings, and orders across customer channels, while enabling the business owner to configure and correct the bot entirely via voice dictation (Wispr Flow).

Built for **"No Hands: The Wispr Challenge"** by WeMakeDevs x Wispr Flow (October 2026).

---

## 📖 Project Context & Single Source of Truth

The complete project specification, goals, non-goals, data models, orchestrator design, and hackathon requirements are documented in [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md).

### Core Highlights
- **Voice-First Configuration & Corrections:** Owners set up business facts, services, hours, and rules—and correct misunderstandings—by dictating naturally through Wispr Flow.
- **Multilingual Customer Chat:** Supports English, Hindi, Kannada, Hinglish, etc., with automatic language detection.
- **Strict Guardrails & Human Escalation:** Answers are grounded strictly in the business knowledge base; sensitive topics (e.g. medical advice) and ambiguities are escalated immediately to the owner.
- **Deterministic Booking & Rules Engine:** Working hours, capacities, and slot filling are managed in code, preventing hallucinations.

---

## 🛠️ Repository Structure

```
local-business-assistant/
├── PROJECT_CONTEXT.md   # Source of truth specification and context
├── README.md            # Project overview and setup guide
└── .gitignore           # Git ignore rules for Node/Python/env
```
