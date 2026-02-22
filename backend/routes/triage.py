from fastapi import APIRouter
from database import get_connection

router = APIRouter()

@router.post("/emergency-triage")
def emergency_triage(data: dict):

    problem_text = data["problem"]

    conn = get_connection()
    cursor = conn.cursor()

    # Step 1: Get all department names
    cursor.execute("SELECT department_id, name FROM departments")
    departments = cursor.fetchall()

    department_names = [d[1] for d in departments]

    # Step 2: Temporary rule-based classification (replace with LLM later)
    # For now simple logic
    suggested_department = "General"

    if "chest" in problem_text.lower():
        suggested_department = "Cardiology"
    elif "fracture" in problem_text.lower():
        suggested_department = "Orthopedics"

    # Step 3: Get department_id
    department_id = None
    for d in departments:
        if d[1] == suggested_department:
            department_id = d[0]
            break

    if department_id is None:
        conn.close()
        return {"error": "Department not found"}

    # Step 4: Find least-loaded ACTIVE & AVAILABLE doctor
    cursor.execute("""
        SELECT d.doctor_id,
               COUNT(a.appointment_id) AS load
        FROM doctors d
        LEFT JOIN appointments a
          ON d.doctor_id = a.doctor_id
          AND a.status = 'scheduled'
        LEFT JOIN doctor_schedule ds
          ON d.doctor_id = ds.doctor_id
        WHERE d.department_id = %s
          AND d.status = 'active'
          AND ds.availability_status = true
        GROUP BY d.doctor_id
        ORDER BY load ASC
        LIMIT 1;
    """, (department_id,))

    doctor = cursor.fetchone()

    conn.close()

    if doctor is None:
        return {"error": "No available doctor"}

    return {
        "suggested_department": suggested_department,
        "doctor_id": doctor[0]
    }