"""
services/triage_llm.py
─────────────────────────────────────────────────────────────────────────────
Hyper-Emergency Department Triage  —  Gemini 2.0 Flash  +  Rule-Based Fallback

Flow:
  1. classify_department_llm(problem_text, age)   ← called by main.py
       └─▶  _gemini_triage()          primary  — Google Gemini 2.0 Flash
       └─▶  _rule_based_triage()      fallback — pure Python, zero latency

Both engines return the same dict shape:
  {
      "department":    str,   # e.g. "Cardiology"
      "urgency_level": str,   # "critical" | "high" | "medium" | "low"
      "reasoning":     str,   # human-readable explanation
      "source":        str,   # "gemini" | "rule-based"
  }
─────────────────────────────────────────────────────────────────────────────
"""

import os
import json
import re
import logging
import urllib.request
import urllib.error

logger = logging.getLogger(__name__)

# ─── CONFIG ───────────────────────────────────────────────────────────────────
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"
)

# Valid department names — must match your DB exactly
VALID_DEPARTMENTS = [
    "Cardiology",
    "Neurology",
    "Orthopedics",
    "Pediatrics",
    "Dermatology",
    "General",
    "ICU",
]


# ═══════════════════════════════════════════════════════════════════════════════
# PUBLIC ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════
def classify_department_llm(problem_text: str, age: int | None = None) -> dict:
    """
    Primary entry point called by main.py.
    Tries Gemini first; falls back to rule-based on any failure.
    """
    if not problem_text or not problem_text.strip():
        return _rule_based_triage("unknown complaint", age or 30)

    if GEMINI_API_KEY:
        try:
            result = _gemini_triage(problem_text, age)
            logger.info(f"[Triage] Gemini → {result['department']} ({result['urgency_level']})")
            return result
        except Exception as exc:
            logger.warning(f"[Triage] Gemini failed ({exc}), switching to rule-based.")

    # Fallback
    result = _rule_based_triage(problem_text, age or 30)
    logger.info(f"[Triage] Rule-based → {result['department']} ({result['urgency_level']})")
    return result


# ═══════════════════════════════════════════════════════════════════════════════
# ENGINE 1 — GEMINI 2.0 FLASH
# ═══════════════════════════════════════════════════════════════════════════════
def _gemini_triage(problem_text: str, age: int | None) -> dict:
    """
    Calls Gemini 2.0 Flash with a strict JSON-only prompt.
    Raises on any HTTP / parse error so the caller can fall back.
    """
    age_str = str(age) if age else "unknown"

    prompt = f"""You are a clinical triage AI for an emergency hospital dashboard.
A patient has just been flagged as a hyper-emergency.

Patient age : {age_str}
Chief complaint: {problem_text}

Decide:
1. Which single department should handle this case.
2. The urgency level.
3. A brief clinical reasoning (1-2 sentences).

Valid departments (choose EXACTLY one, spelling must match):
{json.dumps(VALID_DEPARTMENTS)}

Urgency levels: critical | high | medium | low
- critical : life-threatening, seconds matter (cardiac arrest, stroke, severe trauma)
- high     : serious, needs care within minutes (chest pain, acute neurological, fractures)
- medium   : urgent but stable (moderate pain, infections, minor injuries)
- low      : can wait (skin rashes, follow-ups, mild symptoms)

Respond with ONLY a valid JSON object — no markdown, no code fences, no extra text:
{{
  "department":    "<one of the valid departments>",
  "urgency_level": "<critical|high|medium|low>",
  "reasoning":     "<1-2 sentence clinical rationale>"
}}"""

    payload = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 256,
        },
    }).encode("utf-8")

    req = urllib.request.Request(
        GEMINI_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=8) as resp:
        raw_body = resp.read().decode("utf-8")

    data = json.loads(raw_body)
    raw_text = data["candidates"][0]["content"]["parts"][0]["text"]

    # Strip any accidental markdown fences
    cleaned = re.sub(r"```(?:json)?|```", "", raw_text).strip()
    parsed  = json.loads(cleaned)

    # Validate & sanitize
    department    = _sanitize_department(parsed.get("department", "General"))
    urgency_level = _sanitize_urgency(parsed.get("urgency_level", "high"))
    reasoning     = str(parsed.get("reasoning", "")).strip() or "AI triage completed."

    return {
        "department":    department,
        "urgency_level": urgency_level,
        "reasoning":     reasoning,
        "source":        "gemini",
    }


# ═══════════════════════════════════════════════════════════════════════════════
# ENGINE 2 — RULE-BASED FALLBACK
# Zero external calls, deterministic, always available.
# ═══════════════════════════════════════════════════════════════════════════════

# Keyword → (department, base_urgency)
_KEYWORD_RULES: list[tuple[list[str], str, str]] = [
    # ── ICU / Life-threatening ────────────────────────────────────────────────
    (["cardiac arrest", "heart attack", "ventricular", "code blue",
      "unresponsive", "no pulse", "resuscitat"],                    "ICU",          "critical"),
    (["septic shock", "multi-organ", "respiratory failure",
      "ventilat", "intubat", "icu"],                                "ICU",          "critical"),

    # ── Cardiology ────────────────────────────────────────────────────────────
    (["chest pain", "chest pressure", "angina", "myocardial",
      "arrhythmia", "palpitation", "stemi", "nstemi",
      "heart failure", "bradycardia", "tachycardia", "ecg"],        "Cardiology",   "high"),
    (["aortic", "endocarditis", "cardiomyopathy"],                  "Cardiology",   "high"),

    # ── Neurology ─────────────────────────────────────────────────────────────
    (["stroke", "tia", "seizure", "epilep", "facial droop",
      "slurred speech", "sudden numbness", "paralysis",
      "altered consciousness", "confusion", "meningitis",
      "brain", "cerebral", "encephalitis", "migraine severe"],      "Neurology",    "critical"),
    (["headache severe", "vision loss sudden", "vertigo severe"],   "Neurology",    "high"),

    # ── Orthopedics ───────────────────────────────────────────────────────────
    (["fracture", "broken bone", "dislocation", "spinal injury",
      "back injury", "joint pain severe", "ligament",
      "tendon", "orthopedic", "fall injury", "bone"],               "Orthopedics",  "high"),

    # ── Pediatrics ────────────────────────────────────────────────────────────
    (["child", "infant", "baby", "newborn", "pediatric",
      "toddler", "neonatal", "febrile seizure"],                    "Pediatrics",   "high"),

    # ── Dermatology ───────────────────────────────────────────────────────────
    (["rash severe", "allergic reaction", "anaphylaxis",
      "urticaria", "angioedema", "skin infection severe",
      "cellulitis", "burns severe", "toxic epidermal"],             "Dermatology",  "high"),
    (["rash", "skin", "dermatitis", "eczema", "psoriasis",
      "lesion", "wound infection"],                                 "Dermatology",  "medium"),

    # ── General (catch-all high urgency) ─────────────────────────────────────
    (["abdominal pain severe", "appendicitis", "bowel",
      "gastrointestinal bleed", "hematemesis", "melena",
      "pancreatitis", "peritonitis"],                               "General",      "high"),
    (["fever high", "sepsis", "infection severe",
      "diabetic emergency", "hypoglycemia", "hyperglycemia"],       "General",      "high"),
    (["shortness of breath", "dyspnea", "breathing difficulty",
      "asthma severe", "pulmonary embolism"],                       "General",      "critical"),
]

# Age-based department override
def _age_override(age: int, department: str) -> str:
    """Route to Pediatrics if patient is a child and dept supports it."""
    if age <= 14 and department not in ("ICU", "Neurology", "Cardiology"):
        return "Pediatrics"
    return department

# Age-based urgency escalation
def _age_urgency_boost(age: int, urgency: str) -> str:
    """Escalate urgency for very young or very old patients."""
    escalation = {"low": "medium", "medium": "high", "high": "critical"}
    if age <= 5 or age >= 75:
        return escalation.get(urgency, urgency)
    if age <= 12 or age >= 65:
        return escalation.get(urgency, urgency) if urgency == "low" else urgency
    return urgency


def _rule_based_triage(problem_text: str, age: int) -> dict:
    """
    Deterministic keyword + age-factor triage.
    Matches keywords in order of severity (most critical rules first).
    """
    text = problem_text.lower()

    matched_department = "General"
    matched_urgency    = "medium"
    matched_keywords   = []

    for keywords, department, urgency in _KEYWORD_RULES:
        hits = [kw for kw in keywords if kw in text]
        if hits:
            matched_department = department
            matched_urgency    = urgency
            matched_keywords   = hits
            break  # first (highest-priority) match wins

    # Apply age modifiers
    matched_department = _age_override(age, matched_department)
    matched_urgency    = _age_urgency_boost(age, matched_urgency)

    # Build reasoning
    age_note = ""
    if age <= 12:
        age_note = f" Patient is a child ({age}y), priority escalated."
    elif age >= 65:
        age_note = f" Elderly patient ({age}y), priority escalated."

    if matched_keywords:
        kw_str  = ", ".join(f'"{k}"' for k in matched_keywords[:3])
        reasoning = (
            f"Rule-based match on {kw_str} → routed to {matched_department} "
            f"with {matched_urgency} urgency.{age_note}"
        )
    else:
        reasoning = (
            f"No specific keyword matched; defaulting to General department "
            f"with medium urgency.{age_note}"
        )

    return {
        "department":    matched_department,
        "urgency_level": matched_urgency,
        "reasoning":     reasoning,
        "source":        "rule-based",
    }


# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════════
def _sanitize_department(value: str) -> str:
    """Fuzzy-match the LLM's department output to a valid DB value."""
    value = value.strip()
    # Exact match first
    for dept in VALID_DEPARTMENTS:
        if dept.lower() == value.lower():
            return dept
    # Partial / contains match
    for dept in VALID_DEPARTMENTS:
        if dept.lower() in value.lower() or value.lower() in dept.lower():
            return dept
    return "General"


def _sanitize_urgency(value: str) -> str:
    valid = {"critical", "high", "medium", "low"}
    v = value.strip().lower()
    return v if v in valid else "high"