def estimate_service_time(row):
    # Base time
    if row["appointment_type"] == "emergency":
        base = 30
    elif row["appointment_type"] == "routine":
        base = 20
    else:
        base = 15

    # Severity impact
    base += row["severity_score"] * 2

    # Age factor
    if row["age"] > 65 or row["age"] < 12:
        base += 5

    # Disability
    if row["disability"]:
        base += 7

    return int(base)