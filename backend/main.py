from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import get_connection
from services.triage_llm import classify_department_llm
from services.queue_optimizer import RuleBasedQueueOptimizer, estimate_service_time, PatientPriorityModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "Backend Running"}


# ═══════════════════════════════════════════════════════════════════════════════
# RECALCULATE ALL — run once after deploy to fix existing rows
# POST /appointments/recalculate-all
# ═══════════════════════════════════════════════════════════════════════════════
@app.post("/appointments/recalculate-all")
def recalculate_all_waiting_times():
    conn   = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT DISTINCT doctor_id FROM appointments "
            "WHERE status IN ('scheduled', 'waiting', 'in-progress')"
        )
        doctor_ids = [row[0] for row in cursor.fetchall()]
        updated    = sum(_refresh_queue_waiting_times(cursor, did) for did in doctor_ids)
        conn.commit()
        conn.close()
        return {
            "message":              "Recalculated successfully",
            "doctors_processed":    len(doctor_ids),
            "appointments_updated": updated,
        }
    except Exception as e:
        conn.rollback()
        conn.close()
        return {"error": str(e)}


# ═══════════════════════════════════════════════════════════════════════════════
# HYPER EMERGENCY — STEP 1: LLM Triage
# ═══════════════════════════════════════════════════════════════════════════════
@app.post("/hyper-emergency/triage")
def hyper_emergency_triage(data: dict):
    age          = data.get("age")
    problem_text = data.get("problem_text", "")

    triage     = classify_department_llm(problem_text, age)
    department = triage.get("department", "General")

    conn   = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT department_id FROM departments WHERE name = %s", (department,))
    dept_row = cursor.fetchone()
    if not dept_row:
        cursor.execute("SELECT department_id FROM departments WHERE name = 'General'")
        dept_row = cursor.fetchone()
    department_id = dept_row[0]

    cursor.execute("""
        SELECT d.doctor_id, d.name, dep.name, COALESCE(COUNT(a.appointment_id),0), d.experience_years
        FROM doctors d
        JOIN departments dep ON d.department_id = dep.department_id
        LEFT JOIN appointments a
            ON d.doctor_id = a.doctor_id AND a.status IN ('scheduled','waiting','in-progress')
        WHERE d.department_id = %s AND d.status = 'active'
        GROUP BY d.doctor_id, d.name, dep.name, d.experience_years
        ORDER BY 4 ASC, d.experience_years DESC
    """, (department_id,))

    rows    = cursor.fetchall()
    conn.close()
    doctors = [{"doctor_id":r[0],"name":r[1],"department":r[2],"patients":r[3],"experience_years":r[4],"rank":i+1}
               for i, r in enumerate(rows)]

    return {
        "department":         department,
        "department_id":      department_id,
        "reasoning":          triage.get("reasoning", ""),
        "urgency_level":      triage.get("urgency_level", "high"),
        "doctors":            doctors,
        "recommended_doctor": doctors[0] if doctors else None,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# HYPER EMERGENCY — STEP 2: Confirm
# ═══════════════════════════════════════════════════════════════════════════════
@app.post("/hyper-emergency/confirm")
def hyper_emergency_confirm(data: dict):
    conn   = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS is_hyper_emergency BOOLEAN DEFAULT FALSE")

        cursor.execute("""
            INSERT INTO patients (name, age, gender, disability, contact_number)
            VALUES (%s,%s,%s,%s,%s) RETURNING patient_id
        """, (data.get("name"), data.get("age",0), data.get("gender","Unknown"),
              bool(data.get("disability",False)), data.get("contact","")))
        patient_id = cursor.fetchone()[0]

        priority_score, priority_level = PatientPriorityModel.calculate_priority(
            age=data.get("age",0), gender=data.get("gender",""),
            disability=bool(data.get("disability",False)),
        )
        predicted_service_time = estimate_service_time({
            "appointment_type":"emergency","severity_score":10,
            "age":data.get("age",0),"disability":bool(data.get("disability",False)),
        })

        cursor.execute("""
            INSERT INTO appointments
                (patient_id,doctor_id,department_id,appointment_time,appointment_type,
                 problem_text,severity_score,priority_score,predicted_service_time,status,is_hyper_emergency)
            VALUES (%s,%s,%s,NOW(),'emergency',%s,10,%s,%s,'scheduled',TRUE)
            RETURNING appointment_id
        """, (patient_id, data["doctor_id"], data["department_id"],
              data.get("problem_text"), priority_score, predicted_service_time))
        appointment_id = cursor.fetchone()[0]

        _refresh_queue_waiting_times(cursor, data["doctor_id"])
        conn.commit()
        conn.close()
        return {"message":"Hyper emergency created","appointment_id":appointment_id,
                "priority_level":priority_level,"priority_score":priority_score,
                "predicted_service_time":predicted_service_time}
    except Exception as e:
        conn.rollback(); conn.close(); return {"error": str(e)}


# ═══════════════════════════════════════════════════════════════════════════════
# HYPER EMERGENCY — LIST (only is_hyper_emergency = TRUE)
# ═══════════════════════════════════════════════════════════════════════════════
@app.get("/hyper-emergency/list")
def hyper_emergency_list():
    conn   = get_connection()
    cursor = conn.cursor()
    cursor.execute("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS is_hyper_emergency BOOLEAN DEFAULT FALSE")
    conn.commit()

    cursor.execute("""
        SELECT a.appointment_id, p.name, p.age, d.name, d.doctor_id,
               dep.name, a.problem_text, a.severity_score, a.status, a.appointment_time
        FROM appointments a
        JOIN patients p    ON a.patient_id    = p.patient_id
        JOIN doctors d     ON a.doctor_id     = d.doctor_id
        JOIN departments dep ON a.department_id = dep.department_id
        WHERE a.is_hyper_emergency = TRUE
          AND (
            a.status NOT IN ('completed','cancelled')
            OR (a.status IN ('completed','cancelled')
                AND a.appointment_time::date = CURRENT_DATE
                AND (
                  (EXTRACT(HOUR FROM NOW()) >= 8  AND EXTRACT(HOUR FROM NOW()) < 13
                   AND EXTRACT(HOUR FROM a.appointment_time) >= 8  AND EXTRACT(HOUR FROM a.appointment_time) < 13)
                  OR
                  (EXTRACT(HOUR FROM NOW()) >= 15 AND EXTRACT(HOUR FROM NOW()) < 20
                   AND EXTRACT(HOUR FROM a.appointment_time) >= 15 AND EXTRACT(HOUR FROM a.appointment_time) < 20)
                  OR
                  (EXTRACT(HOUR FROM NOW()) NOT BETWEEN 8 AND 20
                   AND a.appointment_time >= NOW() - INTERVAL '3 hours')
                ))
          )
        ORDER BY a.appointment_time DESC LIMIT 30
    """)
    rows = cursor.fetchall()
    conn.close()

    return {"emergencies": [
        {"appointment_id":row[0],"patient_name":row[1],"age":row[2],
         "doctor_name":row[3],"doctor_id":row[4],"department":row[5],
         "problem":row[6],"severity_score":row[7],
         "urgency_level":"critical" if (row[7] or 0)>=8 else "high",
         "status":row[8],"time":str(row[9])[11:16] if row[9] else ""}
        for row in rows
    ]}


# ─── GET ALL APPOINTMENTS ─────────────────────────────────────────────────────
@app.get("/appointments")
def get_appointments():
    conn   = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT a.appointment_id, p.name, p.age, p.gender, p.disability, p.contact_number,
               d.name, d.doctor_id, dep.name, a.appointment_type, a.problem_text,
               a.waiting_time, a.severity_score, a.priority_score, a.predicted_service_time,
               a.status, a.appointment_time
        FROM appointments a
        JOIN patients p    ON a.patient_id    = p.patient_id
        JOIN doctors d     ON a.doctor_id     = d.doctor_id
        JOIN departments dep ON a.department_id = dep.department_id
        ORDER BY a.priority_score DESC, a.appointment_time ASC
    """)
    rows = cursor.fetchall()
    conn.close()
    return {"appointments": [
        {"appointment_id":r[0],"patient_name":r[1],"age":r[2],"gender":r[3],
         "disability":r[4],"contact":r[5],"doctor_name":r[6],"doctor_id":r[7],
         "department":r[8],"appointment_type":r[9],"problem":r[10],
         "waiting_time":    r[11] if r[11] is not None else 0,
         "severity_score":  r[12] if r[12] is not None else 0,
         "priority_score":  r[13] if r[13] is not None else 0,
         "predicted_service_time": r[14] if r[14] is not None else 0,
         "status":r[15],"appointment_time":str(r[16])}
        for r in rows
    ]}


# ─── ADD NEW APPOINTMENT ──────────────────────────────────────────────────────
@app.post("/appointments")
def add_appointment(data: dict):
    conn   = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO patients (name,age,gender,disability,contact_number)
            VALUES (%s,%s,%s,%s,%s) RETURNING patient_id
        """, (data["name"],data["age"],data["gender"],data["disability"],data["contact"]))
        patient_id = cursor.fetchone()[0]

        cursor.execute("SELECT department_id FROM departments WHERE name=%s",(data["department"],))
        dept_row = cursor.fetchone()
        if not dept_row: conn.close(); return {"error":"Department not found"}
        department_id = dept_row[0]

        cursor.execute("""
            SELECT d.doctor_id FROM doctors d
            LEFT JOIN appointments a ON d.doctor_id=a.doctor_id AND a.status IN ('scheduled','waiting','in-progress')
            WHERE d.department_id=%s AND d.status='active'
            GROUP BY d.doctor_id ORDER BY COUNT(a.appointment_id) ASC, d.experience_years DESC LIMIT 1
        """, (department_id,))
        doctor_row = cursor.fetchone()
        if not doctor_row: conn.close(); return {"error":"No active doctor found"}
        doctor_id = doctor_row[0]

        age = int(data["age"]); gender = str(data["gender"]); disability = bool(data["disability"])
        severity_score = int(data.get("severity_score",5))

        priority_score, priority_level = PatientPriorityModel.calculate_priority(age, gender, disability)
        predicted_service_time = estimate_service_time({
            "appointment_type": data.get("appointment_type","routine"),
            "severity_score": severity_score, "age": age, "disability": disability,
        })

        # Get current queue to compute new patient's position-based wait time
        cursor.execute("""
            SELECT a.appointment_id, p.name, p.age, p.gender, p.disability,
                   a.appointment_type, a.severity_score, a.appointment_time
            FROM appointments a JOIN patients p ON a.patient_id=p.patient_id
            WHERE a.doctor_id=%s AND a.status IN ('scheduled','waiting','in-progress')
        """, (doctor_id,))
        queue_rows = cursor.fetchall()

        from datetime import datetime as dt
        appt_time_raw = data["appointment_time"]
        new_arrival = dt.fromisoformat(appt_time_raw) if isinstance(appt_time_raw,str) else appt_time_raw

        queue_patients = [{"id":r[0],"name":r[1],"age":r[2],"gender":r[3],"disability":r[4],
                           "appointment_type":r[5],"severity_score":r[6],"arrival_time":r[7]}
                          for r in queue_rows] + [{
            "id":-1,"name":data["name"],"age":age,"gender":gender,"disability":disability,
            "appointment_type":data.get("appointment_type","routine"),
            "severity_score":severity_score,"arrival_time":new_arrival,
        }]

        optimized    = RuleBasedQueueOptimizer.optimize(queue_patients)
        slot         = next((q for q in optimized if q["id"]==-1), None)
        waiting_time = slot["waiting_time_minutes"] if slot else 0

        cursor.execute("""
            INSERT INTO appointments
                (patient_id,doctor_id,department_id,appointment_time,appointment_type,
                 problem_text,severity_score,priority_score,predicted_service_time,waiting_time,status)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'scheduled') RETURNING appointment_id
        """, (patient_id,doctor_id,department_id,appt_time_raw,
              data.get("appointment_type","routine"),data["problem_text"],
              severity_score,priority_score,predicted_service_time,waiting_time))
        appointment_id = cursor.fetchone()[0]

        _refresh_queue_waiting_times(cursor, doctor_id)
        conn.commit(); conn.close()
        return {"message":"Patient added","appointment_id":appointment_id,
                "priority_level":priority_level,"priority_score":priority_score,
                "predicted_service_time":predicted_service_time,"waiting_time":waiting_time}
    except Exception as e:
        conn.rollback(); conn.close(); return {"error":str(e)}


# ─── UPDATE APPOINTMENT ───────────────────────────────────────────────────────
@app.put("/appointments/{appointment_id}")
def update_appointment(appointment_id: int, data: dict):
    conn   = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT department_id FROM departments WHERE name=%s",(data["department"],))
        dept_row = cursor.fetchone()
        if not dept_row: conn.close(); return {"error":"Department not found"}

        cursor.execute("""
            UPDATE appointments SET appointment_type=%s,problem_text=%s,department_id=%s,status=%s
            WHERE appointment_id=%s
        """, (data["appointment_type"],data["problem_text"],dept_row[0],data["status"],appointment_id))

        cursor.execute("SELECT doctor_id FROM appointments WHERE appointment_id=%s",(appointment_id,))
        dr = cursor.fetchone()
        if dr: _refresh_queue_waiting_times(cursor, dr[0])

        conn.commit(); conn.close(); return {"message":"Updated"}
    except Exception as e:
        conn.rollback(); conn.close(); return {"error":str(e)}


# ─── DELETE APPOINTMENT ───────────────────────────────────────────────────────
@app.delete("/appointments/{appointment_id}")
def delete_appointment(appointment_id: int):
    conn   = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT doctor_id FROM appointments WHERE appointment_id=%s",(appointment_id,))
        dr = cursor.fetchone()
        cursor.execute("DELETE FROM appointments WHERE appointment_id=%s",(appointment_id,))
        if dr: _refresh_queue_waiting_times(cursor, dr[0])
        conn.commit(); conn.close(); return {"message":"Deleted"}
    except Exception as e:
        conn.rollback(); conn.close(); return {"error":str(e)}


# ─── COMPLETE APPOINTMENT ─────────────────────────────────────────────────────
@app.put("/appointments/{appointment_id}/complete")
def complete_appointment(appointment_id: int):
    conn   = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT doctor_id FROM appointments WHERE appointment_id=%s",(appointment_id,))
        dr = cursor.fetchone()
        cursor.execute("UPDATE appointments SET status='completed' WHERE appointment_id=%s",(appointment_id,))
        if dr: _refresh_queue_waiting_times(cursor, dr[0])
        conn.commit(); conn.close(); return {"message":"Completed"}
    except Exception as e:
        conn.rollback(); conn.close(); return {"error":str(e)}


# ─── OPTIMIZED QUEUE FOR A DOCTOR ────────────────────────────────────────────
@app.get("/appointments/optimized-queue")
def get_optimized_queue(doctor_id: int):
    conn   = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT a.appointment_id, p.name, p.age, p.gender, p.disability,
               a.appointment_type, a.severity_score, a.appointment_time
        FROM appointments a JOIN patients p ON a.patient_id=p.patient_id
        WHERE a.doctor_id=%s AND a.status IN ('scheduled','waiting','in-progress')
    """, (doctor_id,))
    rows = cursor.fetchall()
    conn.close()
    if not rows: return {"optimized_queue":[]}

    patients = [{"id":r[0],"name":r[1],"age":r[2],"gender":r[3],"disability":r[4],
                 "appointment_type":r[5],"severity_score":r[6],"arrival_time":r[7]}
                for r in rows]
    optimized = RuleBasedQueueOptimizer.optimize(patients)
    return {"optimized_queue":[{**e,"start_time":str(e["start_time"]),"end_time":str(e["end_time"])}
                                for e in optimized]}


# ─── GET ALL DOCTORS ──────────────────────────────────────────────────────────
@app.get("/doctors")
def get_all_doctors():
    conn   = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT d.doctor_id, d.name, d.experience_years, d.status, dep.name
        FROM doctors d JOIN departments dep ON d.department_id=dep.department_id
        ORDER BY dep.name, d.name
    """)
    rows = cursor.fetchall()
    conn.close()
    return {"doctors":[{"doctor_id":r[0],"name":r[1],"experience_years":r[2],"status":r[3],"department":r[4]}
                       for r in rows]}


# ─── DOCTORS BY DEPARTMENT ────────────────────────────────────────────────────
@app.get("/doctors/by-department")
def get_doctors_by_department(shift: str = "morning"):
    conn   = get_connection()
    cursor = conn.cursor()
    shift_filter = ("morning",) if shift=="morning" else ("afternoon","night")
    in_clause    = ",".join(["%s"]*len(shift_filter))

    cursor.execute(f"""
        SELECT d.doctor_id, d.name, d.experience_years, d.status, dep.name,
               ds.shift, ds.availability_status, COALESCE(COUNT(a.appointment_id),0)
        FROM doctors d
        JOIN departments dep ON d.department_id=dep.department_id
        LEFT JOIN doctor_schedule ds ON d.doctor_id=ds.doctor_id AND ds.date=CURRENT_DATE AND ds.shift IN ({in_clause})
        LEFT JOIN appointments a ON d.doctor_id=a.doctor_id AND a.status IN ('scheduled','waiting','in-progress')
        GROUP BY d.doctor_id,d.name,d.experience_years,d.status,dep.name,ds.shift,ds.availability_status
        ORDER BY dep.name, d.experience_years DESC
    """, shift_filter)

    rows = cursor.fetchall()
    conn.close()

    dept_doctors: dict = {}
    for r in rows:
        (doctor_id,name,experience,db_status,department,db_shift,availability,patient_count) = r
        if department not in dept_doctors: dept_doctors[department] = []
        is_active = (availability is True) if db_shift is not None else (db_status=="active")
        dept_doctors[department].append({
            "id":doctor_id,"name":name,"experience_years":experience,"patients":patient_count,
            "max_patients":15,"status":"active" if is_active else "inactive",
            "shift":db_shift or shift,"is_standby":False,
        })

    for dept, docs in dept_doctors.items():
        active = [d for d in docs if d["status"]=="active"]
        if len(active)>=2:
            standby = sorted(active, key=lambda x:x["experience_years"])[0]
            for doc in docs:
                if doc["id"]==standby["id"]:
                    doc["is_standby"]=True; doc["max_patients"]=5

    return {"doctors_by_department": dept_doctors}


# ─── EMERGENCY DOCTORS ────────────────────────────────────────────────────────
@app.get("/doctors/emergency")
def get_emergency_doctors():
    conn   = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT d.doctor_id, d.name, dep.name, COALESCE(COUNT(a.appointment_id),0)
        FROM doctors d JOIN departments dep ON d.department_id=dep.department_id
        LEFT JOIN appointments a ON d.doctor_id=a.doctor_id AND a.status IN ('scheduled','waiting','in-progress')
        WHERE d.status='active' GROUP BY d.doctor_id,d.name,dep.name ORDER BY 4 ASC LIMIT 5
    """)
    rows = cursor.fetchall()
    conn.close()
    return {"emergency_doctors":[{"id":r[0],"name":r[1],"department":r[2],"patients":r[3],"rank":i+1}
                                  for i,r in enumerate(rows)]}


# ─── ADD NEW DOCTOR ───────────────────────────────────────────────────────────
@app.post("/doctors")
def add_doctor(data: dict):
    conn   = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT department_id FROM departments WHERE name=%s",(data["department"],))
        dept_row = cursor.fetchone()
        if not dept_row: conn.close(); return {"error":"Department not found"}

        cursor.execute("""
            INSERT INTO doctors (name,department_id,experience_years,status)
            VALUES (%s,%s,%s,%s) RETURNING doctor_id
        """, (data["name"],dept_row[0],data["experience_years"],data.get("status","active")))
        doctor_id = cursor.fetchone()[0]

        shift = data.get("shift","morning")
        cursor.execute("""
            INSERT INTO doctor_schedule (doctor_id,shift,date,availability_status)
            VALUES (%s,%s,CURRENT_DATE,%s)
        """, (doctor_id, shift, data.get("status","active")=="active"))

        conn.commit(); conn.close()
        return {"message":"Doctor added","doctor_id":doctor_id}
    except Exception as e:
        conn.rollback(); conn.close(); return {"error":str(e)}


# ─── TOGGLE DOCTOR STATUS ─────────────────────────────────────────────────────
@app.put("/doctors/{doctor_id}/status")
def toggle_doctor_status(doctor_id: int, data: dict):
    conn   = get_connection()
    cursor = conn.cursor()
    try:
        ns = data["status"]
        cursor.execute("UPDATE doctors SET status=%s WHERE doctor_id=%s",(ns,doctor_id))
        cursor.execute("UPDATE doctor_schedule SET availability_status=%s WHERE doctor_id=%s AND date=CURRENT_DATE",
                       (ns=="active",doctor_id))
        conn.commit(); conn.close(); return {"message":f"Status updated to {ns}"}
    except Exception as e:
        conn.rollback(); conn.close(); return {"error":str(e)}


# ─── DASHBOARD STATS ──────────────────────────────────────────────────────────
@app.get("/dashboard/stats")
def get_dashboard_stats():
    conn   = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM appointments")
    total = cursor.fetchone()[0]

    cursor.execute("""
        SELECT COUNT(*) FROM appointments
        WHERE LOWER(appointment_type)='emergency'
          AND status NOT IN ('completed','cancelled')
          AND (is_hyper_emergency IS NULL OR is_hyper_emergency=FALSE)
    """)
    emergency_cases = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM doctors WHERE status='active'")
    active_doctors = cursor.fetchone()[0]

    # ── Avg wait time ─────────────────────────────────────────────────────────
    # Use MEDIAN-like approach: get the wait time for the middle patient in each
    # doctor's queue. This avoids the "last patient in a 20-person queue has
    # 600 min wait" from inflating the average.
    # Practical formula: AVG(waiting_time) across all ACTIVE queue patients,
    # but capped at a sensible max (120 min) to handle any stale data.

    cursor.execute("""
        SELECT ROUND(AVG(LEAST(waiting_time, 120))::numeric, 0)
        FROM appointments
        WHERE status IN ('scheduled','waiting','in-progress')
          AND waiting_time IS NOT NULL
          AND waiting_time > 0
    """)
    avg_row = cursor.fetchone()[0]

    # Fallback: compute live from optimizer if DB has no waiting_time yet
    if not avg_row:
        # Get active queue sizes per doctor and estimate
        cursor.execute("""
            SELECT doctor_id, COUNT(*) as queue_size
            FROM appointments
            WHERE status IN ('scheduled','waiting','in-progress')
            GROUP BY doctor_id
        """)
        queue_data = cursor.fetchall()
        if queue_data:
            # Avg patient position is queue_size/2, avg service time ~25 min
            avg_queue_size = sum(r[1] for r in queue_data) / len(queue_data)
            avg_row = round((avg_queue_size / 2) * 25)
        else:
            avg_row = 0

    avg_wait_time = int(avg_row) if avg_row else 0

    # ── Per-department stats ─────────────────────────────────────────────────
    cursor.execute("""
        SELECT dep.name, COUNT(a.appointment_id),
               COALESCE(ROUND(AVG(LEAST(CASE WHEN a.waiting_time > 0 THEN a.waiting_time END, 120))::numeric,0), 0)
        FROM appointments a
        JOIN departments dep ON a.department_id=dep.department_id
        WHERE a.status IN ('scheduled','waiting','in-progress')
        GROUP BY dep.name
    """)
    dept_stats = {r[0]:{"queue":int(r[1]),"wait_time":int(r[2])} for r in cursor.fetchall()}

    conn.close()
    return {
        "total_appointments": total,
        "emergency_cases":    emergency_cases,
        "active_doctors":     active_doctors,
        "avg_wait_time":      avg_wait_time,
        "dept_stats":         dept_stats,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# INTERNAL HELPER
# Returns count of appointments updated.
# ═══════════════════════════════════════════════════════════════════════════════
def _refresh_queue_waiting_times(cursor, doctor_id: int) -> int:
    cursor.execute("""
        SELECT a.appointment_id, p.name, p.age, p.gender, p.disability,
               a.appointment_type, a.severity_score, a.appointment_time
        FROM appointments a JOIN patients p ON a.patient_id=p.patient_id
        WHERE a.doctor_id=%s AND a.status IN ('scheduled','waiting','in-progress')
    """, (doctor_id,))
    rows = cursor.fetchall()
    if not rows: return 0

    patients = [{"id":r[0],"name":r[1],"age":r[2],"gender":r[3],"disability":r[4],
                 "appointment_type":r[5],"severity_score":r[6],"arrival_time":r[7]}
                for r in rows]

    optimized = RuleBasedQueueOptimizer.optimize(patients)

    for entry in optimized:
        p = next((x for x in patients if x["id"]==entry["id"]), {})
        priority_score, _ = PatientPriorityModel.calculate_priority(
            age=int(p.get("age") or 0),
            gender=str(p.get("gender") or ""),
            disability=bool(p.get("disability") or False),
        )
        cursor.execute("""
            UPDATE appointments
            SET waiting_time=%s, predicted_service_time=%s, priority_score=%s
            WHERE appointment_id=%s
        """, (entry["waiting_time_minutes"], entry["estimated_duration"], priority_score, entry["id"]))

    return len(optimized)