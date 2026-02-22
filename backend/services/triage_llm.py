import os
import json
import re
from google import genai
from dotenv import load_dotenv

load_dotenv()

# Gemini client — reads GEMINI_API_KEY from env automatically
client = genai.Client()

DEPARTMENTS = ["Cardiology", "Orthopedics", "Dermatology", "Neurology", "Pediatrics", "ICU", "General"]


def classify_department_llm(problem_text: str, age: int = None) -> dict:
    """
    Use Gemini to classify patient problem into a hospital department.
    Returns: { department, reasoning, urgency_level }
    """
    age_context = f"Patient age: {age} years old." if age else ""

    prompt = (
        f"You are a hospital triage assistant.\n"
        f"{age_context}\n"
        f"Classify the following patient problem into EXACTLY ONE of these departments:\n"
        f"Cardiology, Orthopedics, Dermatology, Neurology, Pediatrics, ICU, General.\n\n"
        f"Patient problem: \"{problem_text}\"\n\n"
        f"Respond ONLY with valid JSON (no markdown, no extra text):\n"
        f'{{"department": "<dept>", "reasoning": "<1-2 sentence clinical reasoning>", "urgency_level": "<critical|high|medium|low>"}}'
    )

    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
        )
        text = response.text.strip()
        # Strip markdown code fences Gemini sometimes adds
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$",          "", text)

        match = re.search(r'\{.*?\}', text, re.DOTALL)
        if match:
            result = json.loads(match.group())
            if result.get("department") not in DEPARTMENTS:
                result["department"] = "General"
            return result
    except Exception as e:
        print(f"LLM triage error: {e}")

    # ── Fallback rule-based ────────────────────────────────────────────────
    p = problem_text.lower()
    if any(k in p for k in ["chest pain", "heart", "cardiac", "ecg", "palpitation", "angina"]):
        dept = "Cardiology"
    elif any(k in p for k in ["fracture", "bone", "joint", "ortho", "sprain", "ligament", "spine", "bleed"]):
        dept = "Orthopedics"
    elif any(k in p for k in ["skin", "rash", "eczema", "acne", "psoriasis", "dermatitis"]):
        dept = "Dermatology"
    elif any(k in p for k in ["stroke", "seizure", "neuro", "paralysis", "unconscious", "brain"]):
        dept = "Neurology"
    elif age and age < 15:
        dept = "Pediatrics"
    elif any(k in p for k in ["critical", "icu", "ventilator", "multiple organ", "sepsis"]):
        dept = "ICU"
    else:
        dept = "General"

    urgency = "critical" if any(k in p for k in ["cardiac arrest", "stroke", "unconscious", "sepsis"]) else "high"

    return {
        "department":    dept,
        "reasoning":     "Classified using symptom-keyword fallback (LLM unavailable).",
        "urgency_level": urgency,
    }