import React, { useState, useEffect, useCallback } from "react";
import "../styles/AIDashboard.css";
import CardiologyDepartment   from "./Cardiologydepartment";
import NeurologyDepartment    from "./NeurologyDepartment";
import OrthopedicsDepartment  from "./OrthopedicsDepartment";
import PediatricsDepartment   from "./PediatricsDepartment";
import DermatologyDepartment  from "./DermatologyDepartment";
import GeneralDepartment      from "./GeneralDepartment";
import ICUDepartment          from "./ICUDepartment";

const API_BASE = "http://localhost:8000";

// ─── SHIFT DETECTION ──────────────────────────────────────────────────────────
const detectShift = () => {
  const hour = new Date().getHours();
  if (hour >= 8  && hour < 13) return "morning";
  if (hour >= 15 && hour < 20) return "evening";
  return "morning";
};

const DEPT_ROUTE_MAP = {
  Cardiology:  "cardiology",
  Neurology:   "neurology",
  Orthopedics: "orthopedics",
  Pediatrics:  "pediatrics",
  Dermatology: "dermatology",
  General:     "general",
  ICU:         "icu",
};

const DEPT_ACCENT = {
  Cardiology:  "#e74c3c",
  Neurology:   "#9b59b6",
  Orthopedics: "#3498db",
  Pediatrics:  "#f39c12",
  Dermatology: "#1abc9c",
  General:     "#10b981",
  ICU:         "#ef4444",
};

const DEPT_ICON = {
  Cardiology:  "❤️",
  Neurology:   "🧠",
  Orthopedics: "🦴",
  Pediatrics:  "👶",
  Dermatology: "🩺",
  General:     "🏥",
  ICU:         "🚨",
};

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const map = {
    scheduled:     { bg: "#2ecc7122", color: "#2ecc71" },
    "in-progress": { bg: "#f39c1222", color: "#f39c12" },
    completed:     { bg: "#55555533", color: "#999"     },
    cancelled:     { bg: "#e74c3c22", color: "#e74c3c"  },
    waiting:       { bg: "#3498db22", color: "#3498db"  },
  };
  const s = map[status] || { bg: "#ffffff11", color: "#ccc" };
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 12,
      fontSize: 11, fontWeight: 700,
      background: s.bg, color: s.color,
      letterSpacing: "0.03em",
    }}>
      {status}
    </span>
  );
};

// ─── URGENCY BADGE ────────────────────────────────────────────────────────────
const UrgencyBadge = ({ level }) => {
  const map = {
    critical: { bg: "#ff000033", color: "#ff4444", label: "🔴 CRITICAL" },
    high:     { bg: "#e74c3c22", color: "#e74c3c", label: "🟠 HIGH"     },
    medium:   { bg: "#f39c1222", color: "#f39c12", label: "🟡 MEDIUM"   },
    low:      { bg: "#2ecc7122", color: "#2ecc71", label: "🟢 LOW"      },
  };
  const s = map[level] || map.high;
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 12,
      fontSize: 11, fontWeight: 700,
      background: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
const AIDashboard = () => {
  const [showDepartmentsPopup, setShowDepartmentsPopup] = useState(false);
  const [currentTime, setCurrentTime]                   = useState(new Date());
  const [selectedShift, setSelectedShift]               = useState(detectShift());
  const [currentPage, setCurrentPage]                   = useState("dashboard");

  const [stats, setStats] = useState({
    total_appointments: 0,
    active_doctors: 0,
    avg_wait_time: 0,
    dept_stats: {},
  });
  const [doctorsByDept, setDoctorsByDept] = useState({});
  const [dbEmergencies, setDbEmergencies] = useState([]);

  // ─── FETCH ────────────────────────────────────────────────────────────────
  const fetchStats = useCallback(() => {
    fetch(`${API_BASE}/dashboard/stats`)
      .then(r => r.json())
      .then(d => setStats(d))
      .catch(e => console.error("Stats:", e));
  }, []);

  const fetchDoctors = useCallback((shift) => {
    fetch(`${API_BASE}/doctors/by-department?shift=${shift}`)
      .then(r => r.json())
      .then(d => setDoctorsByDept(d.doctors_by_department || {}))
      .catch(e => console.error("Doctors:", e));
  }, []);

  const fetchDbEmergencies = useCallback(() => {
    fetch(`${API_BASE}/hyper-emergency/list`)
      .then(r => r.json())
      .then(d => setDbEmergencies(d.emergencies || []))
      .catch(e => console.error("Emergencies:", e));
  }, []);

  useEffect(() => {
    fetchStats();
    fetchDoctors(selectedShift);
    fetchDbEmergencies();
  }, []);

  // Real-time clock + auto shift detection
  useEffect(() => {
    const t = setInterval(() => {
      setCurrentTime(new Date());
      const auto = detectShift();
      setSelectedShift(prev => {
        if (prev !== auto) { fetchDoctors(auto); return auto; }
        return prev;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [fetchDoctors]);

  // Poll every 15 s
  useEffect(() => {
    const id = setInterval(() => {
      fetchStats();
      fetchDoctors(selectedShift);
      fetchDbEmergencies();
    }, 15000);
    return () => clearInterval(id);
  }, [selectedShift, fetchStats, fetchDoctors, fetchDbEmergencies]);

  const handleShiftChange = (shift) => { setSelectedShift(shift); fetchDoctors(shift); };

  const formatTime = (d) =>
    d.toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
    });

  // ── Emergency count: derived LIVE from dbEmergencies, not from stats ────────
  // This way when you mark a case ✅ Done, the counter drops immediately.
  const activeEmergencyCount = dbEmergencies.filter(
    e => e.status !== "completed" && e.status !== "cancelled"
  ).length;

  const departments = Object.keys(doctorsByDept).map(name => ({
    name,
    id:           DEPT_ROUTE_MAP[name] || null,
    appointments: stats.dept_stats[name]?.queue    || 0,
    waitTime:     stats.dept_stats[name]?.wait_time || 0,
    doctors:      (doctorsByDept[name] || []).filter(d => d.status === "active").length,
    accent:       DEPT_ACCENT[name]  || "#6366f1",
    icon:         DEPT_ICON[name]    || "🏥",
  }));

  // ── Mark hyper emergency as done ──────────────────────────────────────────
  const handleComplete = (apptId, department) => {
    fetch(`${API_BASE}/appointments/${apptId}`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appointment_type: "emergency",
        problem_text:     "Emergency",
        department:       department,
        status:           "completed",
      }),
    })
      .then(r => r.json())
      .then(() => {
        // Optimistically update local state so counter drops instantly
        setDbEmergencies(prev =>
          prev.map(e =>
            e.appointment_id === apptId ? { ...e, status: "completed" } : e
          )
        );
        // Then re-fetch for full accuracy
        fetchDbEmergencies();
        fetchStats();
        fetchDoctors(selectedShift);
      })
      .catch(e => console.error("Complete:", e));
  };

  const handleDepartmentClick = (dept) => {
    if (!dept.id) { alert(`No detailed page for ${dept.name} yet.`); return; }
    setShowDepartmentsPopup(false);
    setCurrentPage(dept.id);
  };
  const handleBack = () => setCurrentPage("dashboard");

  // ─── DEPARTMENT PAGE ROUTING ─────────────────────────────────────────────
  if (currentPage === "cardiology")  return <CardiologyDepartment  onBack={handleBack} />;
  if (currentPage === "neurology")   return <NeurologyDepartment   onBack={handleBack} />;
  if (currentPage === "orthopedics") return <OrthopedicsDepartment onBack={handleBack} />;
  if (currentPage === "pediatrics")  return <PediatricsDepartment  onBack={handleBack} />;
  if (currentPage === "dermatology") return <DermatologyDepartment onBack={handleBack} />;
  if (currentPage === "general")     return <GeneralDepartment     onBack={handleBack} />;
  if (currentPage === "icu")         return <ICUDepartment         onBack={handleBack} />;

  return (
    <div className="ai-dashboard">

      {/* ── HEADER ───────────────────────────────────────────────────────── */}
      <header className="dashboard-header">
        <div className="header-content">
          <div className="header-left">
            <h1 className="dashboard-title">Hospital AI Dashboard</h1>
            <span className="dashboard-subtitle">Real-time Hospital Management System</span>
          </div>
          <div className="real-time-clock">
            <span className="clock-icon">🕐</span>
            <span className="clock-time">{formatTime(currentTime)}</span>
          </div>
        </div>
      </header>

      {/* ── METRICS ──────────────────────────────────────────────────────── */}
      <div className="metrics-row">
        <div className="metric-card metric-blue">
          <div className="metric-content">
            <h3 className="metric-value">{stats.total_appointments}</h3>
            <p className="metric-label">Total Appointments</p>
            <span className="metric-sublabel">All Departments</span>
          </div>
        </div>

        {/* ── EMERGENCY CARD — count is live from dbEmergencies, not stats ── */}
        <div className="metric-card metric-emergency">
          <div className="metric-content">
            <h3 className="metric-value highlight-emergency">{activeEmergencyCount}</h3>
            <p className="metric-label">Hyper Emergency Cases</p>
            <span className="metric-sublabel" style={{ opacity: 0.55 }}>
              {activeEmergencyCount === 0
                ? "No active cases"
                : `${activeEmergencyCount} active · ${dbEmergencies.filter(e => e.status === "completed").length} completed today`}
            </span>
          </div>
        </div>

        <div className="metric-card metric-green">
          <div className="metric-content">
            <h3 className="metric-value">{stats.active_doctors}</h3>
            <p className="metric-label">Active Doctors</p>
            <span className="metric-sublabel">Across all departments</span>
          </div>
        </div>

        <div className="metric-card metric-purple">
          <div className="metric-content">
            <h3 className="metric-value highlight-time">
              {stats.avg_wait_time}<span className="unit"> min</span>
            </h3>
            <p className="metric-label">Avg Wait Time</p>
            <span className="metric-sublabel">Real-time average</span>
          </div>
        </div>
      </div>

      {/* ── HYPER EMERGENCY TABLE ─────────────────────────────────────────── */}
      {dbEmergencies.length > 0 && (
        <section className="emergency-assignments-section">
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "center", marginBottom: 14,
          }}>
            <h2 className="section-title" style={{ margin: 0 }}>
              <span className="emergency-badge">🚨</span> Hyper Emergency Assignments
              <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 10, opacity: 0.5 }}>
                {activeEmergencyCount} active
              </span>
            </h2>
            <button
              onClick={() => { fetchDbEmergencies(); fetchStats(); }}
              style={{
                fontSize: 12, background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6,
                padding: "5px 14px", cursor: "pointer", color: "#aaa",
              }}
            >
              🔄 Refresh
            </button>
          </div>

          <div className="assignments-table-container">
            <table className="assignments-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Age</th>
                  <th>Doctor Assigned</th>
                  <th>Department</th>
                  <th>Chief Complaint</th>
                  <th>Urgency</th>
                  <th>Time</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {dbEmergencies.map(em => (
                  <tr
                    key={em.appointment_id}
                    style={{
                      opacity: em.status === "completed" ? 0.45 : 1,
                      transition: "opacity 0.3s",
                    }}
                  >
                    <td style={{ fontWeight: 600 }}>
                      {em.patient_name}
                      <span style={{
                        display: "block", fontSize: 10,
                        opacity: 0.45, fontWeight: 400,
                      }}>
                        #{String(em.appointment_id).padStart(5, "0")}
                      </span>
                    </td>

                    <td style={{ textAlign: "center" }}>{em.age}</td>

                    <td className="doctor-name-cell">👨‍⚕️ {em.doctor_name}</td>

                    <td>
                      <span style={{
                        background: `${DEPT_ACCENT[em.department] || "#6366f1"}22`,
                        color:       DEPT_ACCENT[em.department] || "#818cf8",
                        borderRadius: 6, padding: "2px 8px",
                        fontSize: 12, fontWeight: 600,
                      }}>
                        {DEPT_ICON[em.department] || "🏥"} {em.department}
                      </span>
                    </td>

                    <td
                      style={{
                        maxWidth: 170, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}
                      title={em.problem}
                    >
                      {em.problem}
                    </td>

                    <td><UrgencyBadge level={em.urgency_level || "high"} /></td>

                    <td className="time-cell" style={{ whiteSpace: "nowrap" }}>
                      {em.time || "—"}
                    </td>

                    <td><StatusBadge status={em.status} /></td>

                    <td>
                      {em.status !== "completed" && em.status !== "cancelled" ? (
                        <button
                          onClick={() => handleComplete(em.appointment_id, em.department)}
                          style={{
                            background: "none", border: "1.5px solid #2ecc71",
                            borderRadius: 8, padding: "4px 12px", cursor: "pointer",
                            color: "#2ecc71", fontSize: 13, fontWeight: 700,
                            transition: "all 0.2s",
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = "#2ecc71";
                            e.currentTarget.style.color = "#fff";
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = "none";
                            e.currentTarget.style.color = "#2ecc71";
                          }}
                        >
                          ✅ Done
                        </button>
                      ) : (
                        <span style={{ fontSize: 18 }}>✅</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {dbEmergencies.length === 0 && (
        <section
          className="emergency-assignments-section"
          style={{ textAlign: "center", padding: "2rem 1rem" }}
        >
          <div style={{ opacity: 0.35, fontSize: 36, marginBottom: 8 }}>🚨</div>
          <p style={{ opacity: 0.4, fontSize: 14 }}>
            No hyper emergency cases yet. Use the Hyper Emergency button in the HIS panel to triage a patient.
          </p>
        </section>
      )}

      {/* ── DEPARTMENTS BUTTON ────────────────────────────────────────────── */}
      <div className="departments-btn-container">
        <button className="departments-btn-main" onClick={() => setShowDepartmentsPopup(true)}>
          <span className="btn-text">View All Departments</span>
          <span className="btn-arrow">→</span>
        </button>
      </div>

      {/* ── QUEUE STATUS ─────────────────────────────────────────────────── */}
      <section className="queue-section">
        <h2 className="section-title">Real-time Queue Status</h2>
        <div className="queue-cards">
          {departments.map((dept, i) => (
            <div
              key={i}
              className="queue-card"
              onClick={() => dept.id && handleDepartmentClick(dept)}
              style={{ cursor: dept.id ? "pointer" : "default", transition: "transform 0.2s" }}
              onMouseEnter={e => { if (dept.id) e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ""; }}
            >
              <div className="queue-header">
                <h3 className="queue-dept-name">{dept.icon} {dept.name}</h3>
                {dept.id && (
                  <span style={{ fontSize: 11, color: "#555", marginLeft: "auto" }}>
                    View →
                  </span>
                )}
              </div>
              <div className="queue-stats">
                <div className="queue-stat">
                  <span className="stat-label">Queue</span>
                  <span className="stat-value">{dept.appointments}</span>
                </div>
                <div className="queue-stat">
                  <span className="stat-label">Wait</span>
                  <span className="stat-value wait-highlight">
                    {dept.waitTime}<span className="unit-small"> min</span>
                  </span>
                </div>
              </div>
              <div className="queue-progress">
                <div
                  className="progress-bar"
                  style={{
                    width: `${Math.min((dept.appointments / 25) * 100, 100)}%`,
                    background: dept.accent,
                  }}
                />
              </div>
            </div>
          ))}
          {departments.length === 0 && (
            <p style={{ opacity: 0.5 }}>Loading department data...</p>
          )}
        </div>
      </section>

      {/* ── SHIFT SELECTOR ───────────────────────────────────────────────── */}
      <div className="shift-selector">
        <button
          className={`shift-btn ${selectedShift === "morning" ? "active" : ""}`}
          onClick={() => handleShiftChange("morning")}
        >
          <span className="shift-icon">☀️</span>
          <span className="shift-text">Morning Shift (8 AM - 1 PM)</span>
          {detectShift() === "morning" && (
            <span style={{ marginLeft: 8, fontSize: 11, color: "#2ecc71" }}>● LIVE</span>
          )}
        </button>
        <button
          className={`shift-btn ${selectedShift === "evening" ? "active" : ""}`}
          onClick={() => handleShiftChange("evening")}
        >
          <span className="shift-icon">🌙</span>
          <span className="shift-text">Evening Shift (3 PM - 8 PM)</span>
          {detectShift() === "evening" && (
            <span style={{ marginLeft: 8, fontSize: 11, color: "#2ecc71" }}>● LIVE</span>
          )}
        </button>
      </div>

      {/* ── DOCTOR ACTIVITY ──────────────────────────────────────────────── */}
      <section className="activity-section">
        <h2 className="section-title">
          Doctor Activity —{" "}
          {selectedShift === "morning"
            ? "Morning Shift (8 AM - 1 PM)"
            : "Evening Shift (3 PM - 8 PM)"}
        </h2>
        <div className="activity-grid">
          {Object.entries(doctorsByDept).map(([deptName, doctors]) => (
            <div key={deptName} className="activity-card">
              <h3 className="activity-dept-title">
                {DEPT_ICON[deptName] || "🏥"} {deptName}
              </h3>
              <div className="doctor-list">
                {doctors.map(doctor => (
                  <div key={doctor.id} className={`doctor-item ${doctor.status}`}>
                    <div className="doctor-info">
                      <span className={`status-indicator ${doctor.status}`} />
                      <span className="doctor-name">
                        {doctor.name}
                        {doctor.is_standby && doctor.status === "active" && (
                          <span style={{
                            marginLeft: 6, fontSize: 10,
                            background: "#f39c12", color: "#fff",
                            padding: "1px 5px", borderRadius: 4,
                          }}>
                            STANDBY
                          </span>
                        )}
                      </span>
                      <span className={`status-tag ${doctor.status}`}>{doctor.status}</span>
                    </div>
                    <div className="doctor-load">
                      <div className="load-bar-container">
                        <div
                          className={`load-bar ${doctor.status}`}
                          style={{
                            width: `${Math.min((doctor.patients / doctor.max_patients) * 100, 100)}%`,
                          }}
                        />
                      </div>
                      <span className="load-count">
                        {doctor.patients} / {doctor.max_patients}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {Object.keys(doctorsByDept).length === 0 && (
            <p style={{ opacity: 0.5, padding: "1rem" }}>Loading doctors...</p>
          )}
        </div>
      </section>

      {/* ── DEPARTMENTS POPUP ────────────────────────────────────────────── */}
      {showDepartmentsPopup && (
        <div className="popup-overlay" onClick={() => setShowDepartmentsPopup(false)}>
          <div className="popup-content" onClick={e => e.stopPropagation()}>
            <div className="popup-header">
              <h2>All Departments</h2>
              <button className="close-btn" onClick={() => setShowDepartmentsPopup(false)}>✕</button>
            </div>
            <div className="departments-grid">
              {departments.map((dept, i) => (
                <div
                  key={i}
                  className="department-popup-card"
                  onClick={() => handleDepartmentClick(dept)}
                  style={{
                    cursor: dept.id ? "pointer" : "not-allowed",
                    borderColor: dept.id ? `${dept.accent}44` : "rgba(255,255,255,0.06)",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={e => {
                    if (dept.id) {
                      e.currentTarget.style.borderColor = `${dept.accent}88`;
                      e.currentTarget.style.background  = `${dept.accent}0d`;
                    }
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = dept.id
                      ? `${dept.accent}44`
                      : "rgba(255,255,255,0.06)";
                    e.currentTarget.style.background = "";
                  }}
                >
                  <div style={{
                    fontSize: 28, marginBottom: 8,
                    display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <span>{dept.icon}</span>
                    <h3 className="dept-name" style={{ margin: 0, color: dept.accent }}>
                      {dept.name}
                    </h3>
                  </div>

                  <div className="dept-stats-row">
                    <div className="dept-stat">
                      <span className="stat-label-small">Queue</span>
                      <span className="stat-value-large">{dept.appointments}</span>
                    </div>
                    <div className="dept-stat">
                      <span className="stat-label-small">Doctors</span>
                      <span className="stat-value-large">{dept.doctors}</span>
                    </div>
                    <div className="dept-stat">
                      <span className="stat-label-small">Wait</span>
                      <span className="stat-value-large wait-time-highlight">
                        {dept.waitTime}m
                      </span>
                    </div>
                  </div>

                  <button
                    className="view-details-btn"
                    disabled={!dept.id}
                    style={{
                      borderColor: dept.id ? dept.accent : undefined,
                      color:       dept.id ? dept.accent : undefined,
                    }}
                  >
                    {dept.id ? `View ${dept.name} →` : "Coming Soon"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIDashboard;