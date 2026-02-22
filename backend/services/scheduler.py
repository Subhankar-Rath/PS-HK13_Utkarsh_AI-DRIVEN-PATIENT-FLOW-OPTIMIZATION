from datetime import datetime, timedelta

PRIORITY_WEIGHT = {
    "CRITICAL": 4,
    "HIGH": 3,
    "MEDIUM": 2,
    "LOW": 1
}

class RuleBasedQueueOptimizer:

    @staticmethod
    def optimize(patients):
        """
        patients: list of dictionaries containing:
        id, name, age, gender, disability,
        appointment_type, severity_score,
        arrival_time
        """

        enriched_patients = []

        # 🔹 Step 1: Apply Your Models
        for p in patients:

            # Priority Calculation
            total_score, level = PatientPriorityModel.calculate_priority(
                p["age"],
                p["gender"],
                p["disability"]
            )

            # Duration Estimation
            duration = estimate_service_time(p)

            enriched_patients.append({
                "id": p["id"],
                "name": p["name"],
                "arrival_time": p["arrival_time"],
                "priority_score": total_score,
                "priority_level": level,
                "priority_weight": PRIORITY_WEIGHT[level],
                "severity_score": p["severity_score"],
                "estimated_duration": duration
            })

        # 🔹 Step 2: Rule-Based Sorting
        enriched_patients.sort(
            key=lambda x: (
                -x["priority_weight"],   # Higher priority first
                -x["severity_score"],    # Higher severity next
                x["arrival_time"]        # Earlier arrival for fairness
            )
        )

        # 🔹 Step 3: Timeline Simulation
        optimized_queue = []
        current_time = datetime.now()

        for patient in enriched_patients:

            start_time = max(current_time, patient["arrival_time"])
            end_time = start_time + timedelta(minutes=patient["estimated_duration"])

            waiting_time = (
                start_time - patient["arrival_time"]
            ).total_seconds() / 60

            optimized_queue.append({
                "id": patient["id"],
                "name": patient["name"],
                "priority_level": patient["priority_level"],
                "priority_score": patient["priority_score"],
                "severity_score": patient["severity_score"],
                "estimated_duration": patient["estimated_duration"],
                "start_time": start_time,
                "end_time": end_time,
                "waiting_time_minutes": round(waiting_time, 2)
            })

            current_time = end_time

        return optimized_queue