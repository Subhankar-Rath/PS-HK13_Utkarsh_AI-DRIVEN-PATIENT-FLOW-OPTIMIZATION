def sort_patients(patients):
    for patient in patients:
        priority = patient["priority_score"]
        service_time = patient["predicted_time"]
        patient["adjusted_score"] = priority / service_time

    sorted_patients = sorted(patients, key=lambda x: x["adjusted_score"], reverse=True)
    return sorted_patients