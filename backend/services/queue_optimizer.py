"""
services/queue_optimizer.py

KEY FIX:
  waiting_time_minutes = position in queue * avg_service_time
  NOT a stacked timeline from original booking timestamps.

  Old logic: patient #8 booked at 9am, doctor starts at now (2pm),
             stacks 7 patients before them → 9am + (7 * 30min) = shows 210+ min wait.
             Wrong — the booking time is irrelevant to current wait.

  New logic: waiting_time = how many minutes from NOW until this patient is seen.
             Patient #1 → ~0 min wait (next up)
             Patient #2 → service_time_of_patient_1 min wait
             Patient #3 → service_time_of_1 + service_time_of_2, etc.
             This is what a patient actually experiences.
"""

from datetime import datetime, timedelta


# ─── PRIORITY WEIGHTS ─────────────────────────────────────────────────────────
# Keys MUST match PatientPriorityModel.calculate_priority() return values exactly.
PRIORITY_WEIGHT = {
    "HIGH":   3,
    "MEDIUM": 2,
    "LOW":    1,
}


# ─── PRIORITY MODEL ───────────────────────────────────────────────────────────
class PatientPriorityModel:

    @staticmethod
    def calculate_priority(age: int, gender: str, disability: bool):
        """
        Returns (total_score: int, level: str)
        level is strictly one of: "HIGH", "MEDIUM", "LOW"
        """
        age = int(age or 0)

        # Age score
        if age <= 5:
            age_score = 60
        elif age <= 17:
            age_score = 40
        elif age <= 59:
            age_score = 20
        elif age <= 74:
            age_score = 50
        else:
            age_score = 60

        # Disability score
        disability_score = 30 if disability else 0

        # Gender adjustment (pregnancy-age window)
        gender_score = 0
        if isinstance(gender, str) and gender.lower() == "female" and 18 <= age <= 45:
            gender_score = 10

        total_score = age_score + disability_score + gender_score

        # Map to level — keys must be in PRIORITY_WEIGHT
        if total_score >= 80:
            level = "HIGH"
        elif total_score >= 40:
            level = "MEDIUM"
        else:
            level = "LOW"

        return total_score, level


# ─── SERVICE TIME ESTIMATOR ───────────────────────────────────────────────────
def estimate_service_time(row: dict) -> int:
    """
    Returns estimated consultation duration in minutes.
    row must contain: appointment_type, severity_score, age, disability
    """
    appt_type = str(row.get("appointment_type") or "routine").lower().strip()

    if appt_type == "emergency":
        base = 30
    elif appt_type == "routine":
        base = 20
    else:
        base = 15  # follow-up

    severity = int(row.get("severity_score") or 0)
    base += severity * 2

    age = int(row.get("age") or 0)
    if age > 65 or age < 12:
        base += 5

    if row.get("disability"):
        base += 7

    return int(base)


# ─── RULE-BASED QUEUE OPTIMIZER ───────────────────────────────────────────────
class RuleBasedQueueOptimizer:

    @staticmethod
    def optimize(patients: list) -> list:
        """
        patients: list of dicts, each must have:
            id, name, age, gender, disability,
            appointment_type, severity_score, arrival_time

        Returns list of dicts sorted by priority with CORRECT waiting times.

        waiting_time_minutes = cumulative service time of all patients AHEAD
        in the queue — i.e., how long from NOW until this patient is called.
        This is always >= 0 and sensible (typically 0-60 min range per patient).
        """
        if not patients:
            return []

        enriched = []
        for p in patients:
            age        = int(p.get("age") or 0)
            gender     = str(p.get("gender") or "")
            disability = bool(p.get("disability") or False)

            priority_score, priority_level = PatientPriorityModel.calculate_priority(
                age, gender, disability
            )

            weight = PRIORITY_WEIGHT.get(priority_level, 1)

            duration = estimate_service_time({
                "appointment_type": p.get("appointment_type", "routine"),
                "severity_score":   p.get("severity_score", 0),
                "age":              age,
                "disability":       disability,
            })

            # Normalise arrival_time — only used for tie-breaking, NOT for wait calc
            arrival = p.get("arrival_time")
            if isinstance(arrival, str):
                try:
                    arrival = datetime.fromisoformat(arrival)
                except ValueError:
                    arrival = datetime.now()
            if arrival is None:
                arrival = datetime.now()

            enriched.append({
                "id":               p["id"],
                "name":             p.get("name", ""),
                "arrival_time":     arrival,
                "priority_score":   priority_score,
                "priority_level":   priority_level,
                "priority_weight":  weight,
                "severity_score":   int(p.get("severity_score") or 0),
                "estimated_duration": duration,
            })

        # ── Sort: higher weight → higher severity → earlier arrival ──────────
        enriched.sort(
            key=lambda x: (
                -x["priority_weight"],
                -x["severity_score"],
                x["arrival_time"],
            )
        )

        # ── Build queue with CORRECT waiting times ───────────────────────────
        #
        # waiting_time for patient at position i
        #   = sum of estimated_duration of patients at positions 0 … i-1
        #
        # This is what matters to the patient:
        #   "How many minutes until the doctor calls me?"
        #
        # We do NOT use arrival_time in this calculation — it's irrelevant
        # because patients already in the queue are physically present now.

        now = datetime.now()
        optimized_queue = []
        cumulative_wait = 0  # minutes of service ahead of current patient

        for patient in enriched:
            start_time = now + timedelta(minutes=cumulative_wait)
            end_time   = start_time + timedelta(minutes=patient["estimated_duration"])

            optimized_queue.append({
                "id":                   patient["id"],
                "name":                 patient["name"],
                "priority_level":       patient["priority_level"],
                "priority_score":       patient["priority_score"],
                "severity_score":       patient["severity_score"],
                "estimated_duration":   patient["estimated_duration"],
                "start_time":           start_time,
                "end_time":             end_time,
                # ← THE FIX: wait = time ahead in queue, never negative, never 1000+
                "waiting_time_minutes": round(cumulative_wait, 2),
            })

            # Next patient waits for this one to finish
            cumulative_wait += patient["estimated_duration"]

        return optimized_queue