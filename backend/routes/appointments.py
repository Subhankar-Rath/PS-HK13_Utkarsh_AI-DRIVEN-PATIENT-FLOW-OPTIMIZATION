from fastapi import APIRouter
from database import get_connection
from services.priority import calculate_priority
from services.service_time import predict_service_time
from services.scheduler import sort_patients
from graph.department_graph import check_capacity

router = APIRouter()

@router.get("/appointments")
def get_appointments():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM appointments")
    rows = cursor.fetchall()
    conn.close()

    appointments = []
    for row in rows:
        appointments.append({
            "id": row[0],
            "patient_name": row[1],
            "severity": row[2],
            "urgency": row[3],
            "waiting_time": row[4],
            "age_group": row[5],
            "disability": row[6],
            "experience": row[7],
            "department": row[8],
            "status": row[9]
        })
    return appointments


@router.post("/optimize")
def optimize():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM appointments")
    rows = cursor.fetchall()
    conn.close()

    patients = []
    for row in rows:
        patient = {
            "id": row[0],
            "patient_name": row[1],
            "severity": row[2],
            "urgency": row[3],
            "waiting_time": row[4],
            "age_group": row[5],
            "disability": row[6],
            "experience": row[7],
            "department": row[8]
        }

        # Step 2: Calculate priority
        patient["priority_score"] = calculate_priority(
            patient["severity"],
            patient["urgency"],
            patient["waiting_time"],
            patient["age_group"],
            patient["disability"]
        )

        # Step 3: Predict service time
        patient["predicted_time"] = predict_service_time(
            patient["severity"],
            patient["experience"]
        )

        patients.append(patient)

    # Step 4: Sort patients
    sorted_patients = sort_patients(patients)

    # Step 5: Check department capacity
    department_load = {}
    for patient in sorted_patients:
        dept = patient["department"]
        department_load[dept] = department_load.get(dept, 0) + 1
        patient["capacity_status"] = check_capacity(dept, department_load[dept])

    return {"optimized_schedule": sorted_patients}