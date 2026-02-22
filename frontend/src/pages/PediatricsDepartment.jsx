import React, { useState, useEffect, useCallback } from 'react';
import '../styles/CardiologyDepartment.css';

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const BASE_URL = 'http://localhost:8000';

// ─── API HELPER ───────────────────────────────────────────────────────────────
const api = {
  get:    (path)       => fetch(`${BASE_URL}${path}`).then(r => r.json()),
  post:   (path, body) => fetch(`${BASE_URL}${path}`, { method: 'POST',   headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  put:    (path, body) => fetch(`${BASE_URL}${path}`, { method: 'PUT',    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  delete: (path)       => fetch(`${BASE_URL}${path}`, { method: 'DELETE' }).then(r => r.json()),
};

// ─── AI EXPLANATION ───────────────────────────────────────────────────────────
async function getAIExplanation(eventType, context) {
  try {
    const res = await api.post('/ai/explain', { event_type: eventType, context });
    return res.explanation ?? 'No explanation available.';
  } catch {
    return 'AI service unavailable. Please check backend connection.';
  }
}

// ═════════════════════════════════════════════════════════════════════════════
const PediatricsDepartment = ({ onBack }) => {

  // ── State ─────────────────────────────────────────────────────────────────
  const [currentTime,          setCurrentTime]          = useState(new Date());
  const [selectedShift,        setSelectedShift]        = useState('first');
  const [doctors,              setDoctors]              = useState([]);
  const [patients,             setPatients]             = useState([]);
  const [loading,              setLoading]              = useState(true);
  const [error,                setError]                = useState(null);

  const [stats, setStats] = useState({
    totalAppointments: 0, emergencyCases: 0, avgWaitTime: 0, activeDoctors: 0,
  });
  const [todayStats, setTodayStats] = useState({
    completed: 0, inProgress: 0, waiting: 0, cancelled: 0,
  });

  // Modals
  const [showAllAppointments,  setShowAllAppointments]  = useState(false);
  const [showActiveDoctors,    setShowActiveDoctors]    = useState(false);
  const [showAddDoctorForm,    setShowAddDoctorForm]    = useState(false);
  const [selectedPatient,      setSelectedPatient]      = useState(null);
  const [editingAppointment,   setEditingAppointment]   = useState(null);
  const [selectedStatusChange, setSelectedStatusChange] = useState(null);
  const [showReasonField,      setShowReasonField]      = useState(false);
  const [changeReason,         setChangeReason]         = useState('');
  const [statusChanges,        setStatusChanges]        = useState([]);

  // AI Panel
  const [aiPanel,   setAiPanel]   = useState(null);
  const [aiHistory, setAiHistory] = useState([]);

  // New Doctor Form
  const [newDoctor, setNewDoctor] = useState({
    name: '', degree: '', department: 'Pediatrics',
    experience: '', status: 'active', shift: 'first',
  });

  // Equipment (Pediatrics-specific)
  const equipment = [
    { id: 1, name: 'Infant Incubator',      room: 'Room 401', status: 'available' },
    { id: 2, name: 'Pediatric Ventilator',  room: 'Room 402', status: 'in-use'   },
    { id: 3, name: 'Baby Monitor',          room: 'Room 403', status: 'available' },
    { id: 4, name: 'Nebulizer',             room: 'Room 404', status: 'available' },
    { id: 5, name: 'Phototherapy Unit',     room: 'Room 405', status: 'available' },
    { id: 6, name: 'Pediatric Crash Cart',  room: 'Room 406', status: 'available' },
  ];

  // ── Clock ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Hide toggle ───────────────────────────────────────────────────────────
  useEffect(() => {
    const toggle = document.querySelector('.toggleContainer');
    if (toggle) toggle.style.display = 'none';
    return () => { if (toggle) toggle.style.display = 'flex'; };
  }, []);

  // ── FETCH DATA FROM BACKEND ───────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const shiftParam = selectedShift === 'first' ? 'morning' : 'afternoon';

      const [apptRes, doctorsRes, statsRes] = await Promise.all([
        api.get('/appointments'),
        api.get(`/doctors/by-department?shift=${shiftParam}`),
        api.get('/dashboard/stats'),
      ]);

      // Filter for Pediatrics only
      const allAppts  = apptRes.appointments ?? [];
      const deptAppts = allAppts.filter(
        a => a.department?.toLowerCase() === 'pediatrics'
      );

      const deptDoctors = doctorsRes.doctors_by_department?.['Pediatrics'] ?? [];

      // ── Map doctors ──
      const mappedDoctors = deptDoctors.map(d => ({
        id:                d.id,
        name:              d.name,
        degree:            `${d.experience_years} yrs experience`,
        department:        'Pediatrics',
        experience:        d.experience_years,
        status:            d.status,
        shift:             d.shift === 'morning' ? 'first' : 'second',
        currentPatients:   [],
        todayAppointments: d.patients ?? 0,
        nextAvailable:     d.status === 'active' ? 'Available' : 'Inactive',
        isStandby:         d.is_standby ?? false,
      }));

      // ── Map appointments ──
      const mappedPatients = deptAppts.map(a => ({
        id:              String(a.appointment_id),
        name:            a.patient_name,
        age:             a.age,
        gender:          a.gender,
        contact:         a.contact,
        department:      'Pediatrics',
        problem:         a.problem,
        appointmentType: a.appointment_type,
        shift:           'first',
        arrivalTime:     a.appointment_time ? a.appointment_time.slice(11, 16) : '',
        arrivalStatus:   'On-Time',
        priority:        a.severity_score ?? 2,
        assignedDoctor:  a.doctor_id ?? null,
        status:          a.status,
        waitingTime:     a.waiting_time,
      }));

      // ── Distribute patients across active doctors ──
      const activeDrs = mappedDoctors.filter(d => d.status === 'active');
      const sorted    = [...mappedPatients].sort((a, b) => a.priority - b.priority);
      const withDocs  = sorted.map((p, i) => ({
        ...p,
        assignedDoctor: activeDrs.length ? activeDrs[i % activeDrs.length].id : null,
      }));

      // ── Today stats ──
      setTodayStats({
        completed:  deptAppts.filter(a => a.status === 'completed').length,
        inProgress: deptAppts.filter(a => a.status === 'in-progress').length,
        waiting:    deptAppts.filter(a => a.status === 'waiting' || a.status === 'scheduled').length,
        cancelled:  deptAppts.filter(a => a.status === 'cancelled').length,
      });

      const deptStat = statsRes.dept_stats?.['Pediatrics'];
      setStats({
        totalAppointments: deptAppts.length,
        emergencyCases:    deptAppts.filter(a => a.appointment_type?.toLowerCase() === 'emergency').length,
        avgWaitTime:       deptStat?.wait_time ?? statsRes.avg_wait_time ?? 0,
        activeDoctors:     activeDrs.length,
      });

      setDoctors(mappedDoctors);
      setPatients(withDocs);

    } catch (err) {
      console.error('Fetch error:', err);
      setError('Could not load data. Make sure your backend is running on ' + BASE_URL);
    } finally {
      setLoading(false);
    }
  }, [selectedShift]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const formatTime = d => d.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });

  const getPatientsByShift  = shift    => patients.filter(p => p.shift === shift);
  const getPatientsByDoctor = doctorId =>
    patients
      .filter(p => p.assignedDoctor === doctorId && p.status !== 'completed')
      .sort((a, b) => a.priority - b.priority);

  // ── AI trigger ────────────────────────────────────────────────────────────
  const triggerAI = async (eventType, context) => {
    setAiPanel({ eventType, context, text: null, loading: true });
    const text  = await getAIExplanation(eventType, context);
    const entry = { id: Date.now(), eventType, context, text, time: new Date() };
    setAiPanel({ eventType, context, text, loading: false });
    setAiHistory(prev => [entry, ...prev]);
  };

  // ── Doctor toggle ─────────────────────────────────────────────────────────
  const toggleDoctorStatus = async doctorId => {
    const doc       = doctors.find(d => d.id === doctorId);
    if (!doc) return;
    const newStatus = doc.status === 'active' ? 'inactive' : 'active';

    try { await api.put(`/doctors/${doctorId}/status`, { status: newStatus }); }
    catch { console.warn('Backend update failed; updating locally'); }

    const updated   = doctors.map(d => d.id === doctorId ? { ...d, status: newStatus } : d);
    const activeDrs = updated.filter(d => d.status === 'active');
    setDoctors(updated);
    setStats(prev => ({ ...prev, activeDoctors: activeDrs.length }));

    const sorted   = [...patients].sort((a, b) => a.priority - b.priority);
    const withDocs = sorted.map((p, i) => ({
      ...p,
      assignedDoctor: activeDrs.length ? activeDrs[i % activeDrs.length].id : null,
    }));
    setPatients(withDocs);

    if (newStatus === 'inactive') {
      const affected   = patients.filter(p => p.assignedDoctor === doctorId);
      const redirected = activeDrs.filter(d => d.id !== doctorId).map(d => d.name).join(', ') || 'remaining staff';
      await triggerAI('doctor_inactive', {
        doctorName:   doc.name,
        department:   'Pediatrics',
        patientCount: affected.length,
        redirectedTo: redirected,
        specialNote:  'Ensure guardian/parent notifications are sent for all affected pediatric patients. Children under 5 may need priority reassignment.',
      });
    }
  };

  // ── Complete checkup ──────────────────────────────────────────────────────
  const handleCompleteCheckup = async patientId => {
    try {
      await api.put(`/appointments/${patientId}`, {
        appointment_type: 'Routine', problem_text: '', department: 'Pediatrics', status: 'completed',
      });
    } catch {}
    setPatients(prev => prev.filter(p => p.id !== patientId));
    setTodayStats(prev => ({ ...prev, completed: prev.completed + 1, inProgress: prev.inProgress - 1 }));
    setSelectedPatient(null);
  };

  // ── Cancel appointment ────────────────────────────────────────────────────
  const handleCancelAppointment = async patientId => {
    try { await api.delete(`/appointments/${patientId}`); } catch {}
    setPatients(prev => prev.filter(p => p.id !== patientId));
    setTodayStats(prev => ({ ...prev, cancelled: prev.cancelled + 1, waiting: prev.waiting - 1 }));
    setEditingAppointment(null);
    setShowReasonField(false);
    setChangeReason('');
  };

  // ── Arrival status change ─────────────────────────────────────────────────
  const handleArrivalStatusChange = newStatus => {
    const needsReason = ['Change Shift', 'Reschedule', 'Late'].includes(newStatus);
    setShowReasonField(needsReason);
    if (!needsReason) setChangeReason('');
    setEditingAppointment(prev => ({ ...prev, arrivalStatus: newStatus }));
  };

  const handleEditAppointment = patient => {
    setShowAllAppointments(false);
    setEditingAppointment(patient);
    setShowReasonField(['Change Shift', 'Reschedule', 'Late'].includes(patient.arrivalStatus));
    setChangeReason('');
  };

  // ── Save appointment + AI ─────────────────────────────────────────────────
  const handleSaveAppointment = async updated => {
    const needsReason = ['Change Shift', 'Reschedule', 'Late'].includes(updated.arrivalStatus);

    try {
      await api.put(`/appointments/${updated.id}`, {
        appointment_type: updated.appointmentType,
        problem_text:     updated.problem,
        department:       updated.department,
        status:           updated.status,
      });
    } catch {}

    if (needsReason && changeReason.trim()) {
      if (updated.arrivalStatus === 'Change Shift') {
        updated = { ...updated, shift: updated.shift === 'first' ? 'second' : 'first' };
      }

      const record = {
        id:             Date.now(),
        patientId:      updated.id,
        patientName:    updated.name,
        patientAge:     updated.age,
        patientGender:  updated.gender,
        patientContact: updated.contact,
        patientProblem: updated.problem,
        arrivalStatus:  updated.arrivalStatus,
        arrivalTime:    updated.arrivalStatus === 'Reschedule' ? updated.arrivalTime : undefined,
        reason:         changeReason,
        timestamp:      new Date().toLocaleString('en-IN', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: true,
        }),
      };
      setStatusChanges(prev => [record, ...prev]);

      // 🤖 Pediatrics-specific AI context
      const aiType = updated.arrivalStatus === 'Reschedule' ? 'reschedule' : 'delay';
      await triggerAI(aiType, {
        patientName:     updated.name,
        age:             updated.age,
        problem:         updated.problem,
        appointmentType: updated.appointmentType,
        reason:          changeReason,
        newTime:         updated.arrivalTime,
        department:      'Pediatrics',
        specialNote:     `Patient is a child (age ${updated.age}). Notify parent/guardian of any changes. Consider age-appropriate scheduling and whether the child's condition requires urgent reassessment.`,
      });
    }

    setPatients(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
    setEditingAppointment(null);
    setShowReasonField(false);
    setChangeReason('');
  };

  // ── Add Doctor ────────────────────────────────────────────────────────────
  const handleAddDoctor = async e => {
    e.preventDefault();
    try {
      const result = await api.post('/doctors', {
        name:             newDoctor.name,
        department:       'Pediatrics',
        experience_years: parseInt(newDoctor.experience),
        status:           newDoctor.status,
        shift:            newDoctor.shift === 'first' ? 'morning' : 'afternoon',
      });
      if (result.doctor_id) {
        setDoctors(prev => [...prev, {
          id:                result.doctor_id,
          name:              newDoctor.name,
          degree:            newDoctor.degree || `${newDoctor.experience} yrs experience`,
          department:        'Pediatrics',
          experience:        parseInt(newDoctor.experience),
          status:            newDoctor.status,
          shift:             newDoctor.shift,
          currentPatients:   [],
          todayAppointments: 0,
          nextAvailable:     'Available Now',
          isStandby:         false,
        }]);
        if (newDoctor.status === 'active') {
          setStats(prev => ({ ...prev, activeDoctors: prev.activeDoctors + 1 }));
        }
      }
    } catch { console.warn('Add doctor failed'); }
    setShowAddDoctorForm(false);
    setNewDoctor({ name: '', degree: '', department: 'Pediatrics', experience: '', status: 'active', shift: 'first' });
  };

  // ── Emergency AI trigger ──────────────────────────────────────────────────
  const triggerEmergencyAI = async (doctor, patient) => {
    const waiting = getPatientsByDoctor(doctor.id).filter(p => p.status !== 'in-progress');
    await triggerAI('emergency_reassignment', {
      doctorName:         doctor.name,
      department:         'Pediatrics',
      emergencyPatient:   patient.name,
      emergencyCondition: patient.problem,
      affectedPatients:   waiting.map(p => p.name).join(', ') || 'None',
      specialNote:        `Emergency patient is age ${patient.age}. Pediatric emergencies require immediate guardian notification, age-appropriate dosing, and potential PICU escalation if condition deteriorates.`,
    });
  };

  // ── Time helpers ──────────────────────────────────────────────────────────
  const to24h = (t = '') => {
    if (!t) return '';
    const m = t.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!m) return '';
    let h = parseInt(m[1]);
    if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
    if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m[2]}`;
  };
  const to12h = val => {
    if (!val) return '';
    const [h24, min] = val.split(':');
    const h    = parseInt(h24);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const disp = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${String(disp).padStart(2, '0')}:${min} ${ampm}`;
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="cardiology-container">

      {/* ── HEADER ── */}
      <div className="cardio-header">
        <button className="back-btn" onClick={onBack}>← Back to Dashboard</button>
        <div className="header-center">
          <h1 className="dept-heading">Pediatrics Department</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={fetchData} style={{
            background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)',
            color: '#fff', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
          }}>↻ Refresh</button>
          <div className="header-time">
            <div className="time-display">{formatTime(currentTime)}</div>
          </div>
        </div>
      </div>

      {/* ── LOADING ── */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300, flexDirection: 'column', gap: 12, color: '#6b7280' }}>
          <div style={{ width: 36, height: 36, border: '3px solid #e5e7eb', borderTopColor: '#7c5cbf', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          Loading Pediatrics data from database…
        </div>
      )}

      {/* ── ERROR ── */}
      {!loading && error && (
        <div style={{ margin: 28, background: '#faf5ff', border: '1px solid #c4b5fd', borderRadius: 12, padding: 20, color: '#6d28d9' }}>
          <strong>⚠ Connection Error</strong>
          <p style={{ marginTop: 8, fontSize: 14 }}>{error}</p>
          <button onClick={fetchData} style={{ marginTop: 8, padding: '8px 18px', background: '#7c5cbf', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (<>

        {/* ── STAT CARDS ── */}
        <div className="stats-grid">
          <div className="stat-box" onClick={() => setShowAllAppointments(true)}>
            <div className="stat-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
              </svg>
            </div>
            <div className="stat-content">
              <div className="stat-value">{stats.totalAppointments}</div>
              <div className="stat-label">Total Appointments</div>
            </div>
          </div>

          <div className="stat-box emergency">
            <div className="stat-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
              </svg>
            </div>
            <div className="stat-content">
              <div className="stat-value">{stats.emergencyCases}</div>
              <div className="stat-label">Emergency Cases</div>
            </div>
          </div>

          <div className="stat-box">
            <div className="stat-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
              </svg>
            </div>
            <div className="stat-content">
              <div className="stat-value">{stats.avgWaitTime} min</div>
              <div className="stat-label">Avg Wait Time</div>
            </div>
          </div>

          <div className="stat-box" onClick={() => setShowActiveDoctors(true)}>
            <div className="stat-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
              </svg>
            </div>
            <div className="stat-content">
              <div className="stat-value">{stats.activeDoctors}</div>
              <div className="stat-label">Active Doctors</div>
            </div>
          </div>
        </div>

        {/* ── TODAY'S SUMMARY ── */}
        <div className="today-summary">
          <h2 className="section-title">Today's Summary</h2>
          <div className="summary-grid">
            <div className="summary-item completed"><div className="summary-value">{todayStats.completed}</div><div className="summary-label">Completed</div></div>
            <div className="summary-item in-progress"><div className="summary-value">{todayStats.inProgress}</div><div className="summary-label">In Progress</div></div>
            <div className="summary-item waiting"><div className="summary-value">{todayStats.waiting}</div><div className="summary-label">Waiting</div></div>
            <div className="summary-item cancelled"><div className="summary-value">{todayStats.cancelled}</div><div className="summary-label">Cancelled</div></div>
          </div>
        </div>

        {/* ── AI EXPLANATION PANEL ── */}
        {aiPanel && (
          <div style={{ margin: '16px 28px 0', borderRadius: 14, overflow: 'hidden', border: '1.5px solid #7c5cbf', boxShadow: '0 4px 20px rgba(124,92,191,.15)' }}>
            <div style={{ background: 'linear-gradient(135deg,#7c5cbf,#1a1d2e)', padding: '13px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                🤖 AI Operations Assistant — Pediatrics
                <span style={{ background: 'rgba(255,255,255,.2)', borderRadius: 20, padding: '2px 10px', fontSize: 11 }}>
                  {aiPanel.eventType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </span>
              </div>
              <button onClick={() => setAiPanel(null)}
                style={{ background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>
            <div style={{ background: '#fff', padding: '16px 18px' }}>
              {aiPanel.loading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#6b7280', fontSize: 14 }}>
                  <div style={{ width: 18, height: 18, border: '2px solid #e5e7eb', borderTopColor: '#7c5cbf', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
                  Generating AI explanation…
                </div>
              ) : (
                <div style={{ fontSize: 14, lineHeight: 1.7, color: '#374151', background: '#faf5ff', borderRadius: 10, padding: '13px 15px', borderLeft: '3px solid #7c5cbf' }}>
                  {aiPanel.text}
                </div>
              )}
              {aiHistory.length > 1 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>Previous AI notes</div>
                  {aiHistory.slice(1, 4).map(h => (
                    <div key={h.id} onClick={() => setAiPanel({ ...h, loading: false })}
                      style={{ background: '#f9fafb', borderRadius: 8, padding: '9px 13px', marginBottom: 6, cursor: 'pointer', border: '1px solid #e5e7eb' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af', marginBottom: 3 }}>
                        <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{h.eventType.replace(/_/g, ' ')}</span>
                        <span>{h.time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.text}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── STATUS CHANGES TABLE ── */}
        {statusChanges.length > 0 && (
          <div className="status-changes-section">
            <h2 className="section-title"><span className="status-change-icon">📋</span> Arrival Status Changes</h2>
            <div className="status-changes-table-container">
              <table className="status-changes-table">
                <thead>
                  <tr>
                    <th>Patient ID</th><th>Arrival Status</th>
                    {statusChanges.some(sc => sc.arrivalTime) && <th>Arrival Time</th>}
                    <th>Reason</th><th>Timestamp</th><th>AI Note</th>
                  </tr>
                </thead>
                <tbody>
                  {statusChanges.map(change => {
                    const linked = aiHistory.find(h => h.context?.patientName === change.patientName);
                    return (
                      <tr key={change.id} onClick={() => setSelectedStatusChange(change)} className="clickable-row">
                        <td className="status-patient-id">{change.patientId}</td>
                        <td className={`status-badge-cell ${change.arrivalStatus.toLowerCase().replace(' ', '-')}`}>
                          <span className="status-badge">{change.arrivalStatus}</span>
                        </td>
                        {statusChanges.some(sc => sc.arrivalTime) && (
                          <td className="arrival-time-cell">{change.arrivalTime || '–'}</td>
                        )}
                        <td className="reason-cell">{change.reason}</td>
                        <td className="timestamp-cell">{change.timestamp}</td>
                        <td>
                          {linked ? (
                            <button onClick={e => { e.stopPropagation(); setAiPanel({ ...linked, loading: false }); }}
                              style={{ padding: '3px 8px', background: '#faf5ff', color: '#7c5cbf', border: '1px solid #c4b5fd', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
                              🤖 View
                            </button>
                          ) : <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── DOCTOR SECTION ── */}
        <div className="doctor-section-wrapper">
          <div className="section-header">
            <h2 className="section-title">Doctor Section</h2>
            <div className="shift-selector">
              <button className={`shift-btn ${selectedShift === 'first' ? 'active' : ''}`} onClick={() => setSelectedShift('first')}>First Shift</button>
              <button className={`shift-btn ${selectedShift === 'second' ? 'active' : ''}`} onClick={() => setSelectedShift('second')}>Second Shift</button>
            </div>
          </div>

          {doctors.filter(d => d.shift === selectedShift).length === 0 && (
            <div style={{ background: '#f9fafb', borderRadius: 12, padding: 24, textAlign: 'center', color: '#9ca3af' }}>
              No doctors scheduled for this shift.
            </div>
          )}

          {doctors.filter(d => d.shift === selectedShift).map(doctor => (
            <div key={doctor.id} className={`doctor-full-card ${doctor.status}`}>
              <div className="doctor-card-header">
                <div className="doctor-info-main">
                  <div className="doctor-name-section">
                    <h3 className="doctor-name">{doctor.name}</h3>
                    <p className="doctor-degree">{doctor.degree}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {doctor.isStandby && (
                    <span style={{ background: '#fff7ed', color: '#c2410c', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, border: '1px solid #fed7aa' }}>Standby</span>
                  )}
                  <span style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                    background: doctor.status === 'active' ? '#d1fae5' : '#fee2e2',
                    color:      doctor.status === 'active' ? '#065f46' : '#b91c1c',
                  }}>{doctor.status.toUpperCase()}</span>
                </div>
              </div>

              <div className="doctor-metrics-row">
                <div className="metric-item">
                  <div className="metric-label">Current Patients</div>
                  <div className="metric-value">
                    {getPatientsByDoctor(doctor.id).filter(p => p.status === 'in-progress').map(p => p.id).join(', ') || 'None'}
                  </div>
                </div>
                <div className="metric-item">
                  <div className="metric-label">Today's Appointments</div>
                  <div className="metric-value">{doctor.todayAppointments}</div>
                </div>
                <div className="metric-item">
                  <div className="metric-label">Next Available</div>
                  <div className="metric-value">{doctor.nextAvailable}</div>
                </div>
              </div>

              {doctor.status === 'active' && (
                <div className="patient-queue-section">
                  <h4 className="queue-title">Patient Queue ({getPatientsByDoctor(doctor.id).length})</h4>
                  <div className="queue-list">
                    {getPatientsByDoctor(doctor.id).length === 0 ? (
                      <div className="no-patients">No patients in queue</div>
                    ) : (
                      getPatientsByDoctor(doctor.id).map(patient => (
                        <div key={patient.id} className="queue-patient-item" onClick={() => setSelectedPatient(patient)}>
                          <div className="patient-basic-info">
                            <span className="patient-id">{patient.id}</span>
                            <span className="patient-name">{patient.name}</span>
                            <span style={{
                              fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 10,
                              background: '#ede9fe', color: '#6d28d9', marginLeft: 4,
                            }}>Age {patient.age}</span>
                            <span className={`appointment-type-badge ${patient.appointmentType?.toLowerCase()}`}>{patient.appointmentType}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="patient-problem-text">{patient.problem}</div>
                            {patient.waitingTime > 20 && (
                              <span style={{ fontSize: 11, color: '#d97706', background: '#fffbeb', padding: '2px 6px', borderRadius: 6, border: '1px solid #fde68a', whiteSpace: 'nowrap' }}>
                                ⏱ {patient.waitingTime}m
                              </span>
                            )}
                            {patient.appointmentType?.toLowerCase() === 'emergency' && (
                              <button onClick={e => { e.stopPropagation(); triggerEmergencyAI(doctor, patient); }}
                                style={{ padding: '3px 8px', background: '#faf5ff', color: '#7c5cbf', border: '1px solid #c4b5fd', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                🤖 AI Note
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="doctor-actions">
                <button className={`status-toggle-btn ${doctor.status}`} onClick={() => toggleDoctorStatus(doctor.id)}>
                  {doctor.status === 'active' ? 'Mark as Inactive' : 'Mark as Active'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* ── ADD DOCTOR ── */}
        <div className="add-doctor-section">
          <button className="add-doctor-btn" onClick={() => setShowAddDoctorForm(true)}>+ Add Doctor</button>
        </div>

        {/* ── EQUIPMENT ── */}
        <div className="equipment-section">
          <h2 className="section-title">Equipment Status</h2>
          <div className="equipment-grid">
            {equipment.map(item => (
              <div key={item.id} className="equipment-item">
                <div className={`equipment-status-indicator ${item.status}`}>
                  {item.status === 'available'
                    ? <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                    : <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>
                  }
                </div>
                <div className="equipment-details">
                  <div className="equipment-name">{item.name}</div>
                  <div className="equipment-room">{item.room}</div>
                  <div className={`equipment-status-text ${item.status}`}>{item.status.toUpperCase()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </>)}

      {/* ══════════════════════ MODALS ══════════════════════ */}

      {/* Edit Appointment */}
      {editingAppointment && (
        <div className="modal-overlay" onClick={() => setEditingAppointment(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Patient {editingAppointment.id} Details</h2>
              <button className="close-modal-btn" onClick={() => setEditingAppointment(null)}>✕</button>
            </div>
            <div className="edit-appointment-form">
              <div className="form-section">
                <h3>Patient Information</h3>
                <div className="info-grid">
                  {[['Name', editingAppointment.name], ['Age', editingAppointment.age], ['Gender', editingAppointment.gender], ['Contact', editingAppointment.contact]].map(([l, v]) => (
                    <div key={l} className="info-item"><label>{l}:</label><span>{v}</span></div>
                  ))}
                </div>
              </div>
              <div className="form-section">
                <h3>Appointment Details (Editable)</h3>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Department *</label>
                    <select value={editingAppointment.department} onChange={e => setEditingAppointment({ ...editingAppointment, department: e.target.value })}>
                      {['Pediatrics', 'Cardiology', 'Neurology', 'Orthopedics', 'Dermatology', 'General Medicine'].map(d => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Problem/Reason *</label>
                    <input type="text" value={editingAppointment.problem} onChange={e => setEditingAppointment({ ...editingAppointment, problem: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Appointment Type *</label>
                    <select value={editingAppointment.appointmentType} onChange={e => setEditingAppointment({ ...editingAppointment, appointmentType: e.target.value })}>
                      {['Emergency', 'Routine', 'Follow-up'].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Arrival Time *</label>
                    <input type="time" className="time-picker-input"
                      value={to24h(editingAppointment.arrivalTime)}
                      onChange={e => setEditingAppointment({ ...editingAppointment, arrivalTime: to12h(e.target.value) })} />
                  </div>
                  <div className="form-group full-width">
                    <label>Arrival Status *</label>
                    <select value={editingAppointment.arrivalStatus} onChange={e => handleArrivalStatusChange(e.target.value)}>
                      {['On-Time', 'Late', 'Reschedule', 'Change Shift'].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  {showReasonField && (
                    <div className="form-group full-width reason-field-container">
                      <label>Reason for {editingAppointment.arrivalStatus} *</label>
                      <textarea className="reason-textarea-inline" rows="3"
                        placeholder="Enter reason for status change..."
                        value={changeReason} onChange={e => setChangeReason(e.target.value)} />
                    </div>
                  )}
                </div>
              </div>
              <div className="form-actions">
                <button className="btn-cancel-appointment" onClick={() => handleCancelAppointment(editingAppointment.id)}>Cancel Appointment</button>
                <button className="btn-save-appointment"
                  onClick={() => handleSaveAppointment(editingAppointment)}
                  disabled={showReasonField && !changeReason.trim()}>
                  Save & Get AI Explanation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status Change Detail */}
      {selectedStatusChange && (
        <div className="modal-overlay" onClick={() => setSelectedStatusChange(null)}>
          <div className="modal-content small" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Patient Details - {selectedStatusChange.patientId}</h2>
              <button className="close-modal-btn" onClick={() => setSelectedStatusChange(null)}>✕</button>
            </div>
            <div className="patient-details-content">
              {[
                ['Patient ID',     selectedStatusChange.patientId],
                ['Name',           selectedStatusChange.patientName],
                ['Age',            selectedStatusChange.patientAge],
                ['Gender',         selectedStatusChange.patientGender],
                ['Contact',        selectedStatusChange.patientContact],
                ['Problem',        selectedStatusChange.patientProblem],
                ['Arrival Status', selectedStatusChange.arrivalStatus],
                ['Reason',         selectedStatusChange.reason],
                ['Changed At',     selectedStatusChange.timestamp],
              ].map(([l, v]) => (
                <div key={l} className="detail-row">
                  <span className="detail-label">{l}:</span>
                  <span className="detail-value">{v}</span>
                </div>
              ))}
              {(() => {
                const linked = aiHistory.find(h => h.context?.patientName === selectedStatusChange.patientName);
                return linked ? (
                  <div style={{ marginTop: 14, background: '#faf5ff', borderRadius: 10, padding: 12, borderLeft: '3px solid #7c5cbf' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#7c5cbf', marginBottom: 6 }}>🤖 AI Explanation</div>
                    <div style={{ fontSize: 13, lineHeight: 1.6, color: '#374151' }}>{linked.text}</div>
                  </div>
                ) : null;
              })()}
            </div>
          </div>
        </div>
      )}

      {/* All Appointments */}
      {showAllAppointments && (
        <div className="modal-overlay" onClick={() => setShowAllAppointments(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>All Appointments — Pediatrics</h2>
              <button className="close-modal-btn" onClick={() => setShowAllAppointments(false)}>✕</button>
            </div>
            <div className="appointments-tabs">
              {['first', 'second'].map(shift => (
                <div key={shift}>
                  <h3 className={shift === 'second' ? 'shift-divider' : undefined}>{shift === 'first' ? 'First Shift' : 'Second Shift'}</h3>
                  <div className="appointments-list">
                    {getPatientsByShift(shift).length === 0
                      ? <div style={{ color: '#d1d5db', fontSize: 13, marginBottom: 8 }}>No appointments</div>
                      : getPatientsByShift(shift).map(patient => (
                        <div key={patient.id} className="appointment-card" onClick={() => handleEditAppointment(patient)}>
                          <div className="appointment-header-row">
                            <span className="appointment-id">{patient.id}</span>
                            <span className={`appointment-status-badge ${patient.status}`}>{patient.status}</span>
                          </div>
                          <div className="appointment-patient-name">{patient.name} <span style={{ fontSize: 11, color: '#9ca3af' }}>· Age {patient.age}</span></div>
                          <div className="appointment-detail-row">
                            <span>Type: {patient.appointmentType}</span>
                            {patient.waitingTime && <span>Wait: {patient.waitingTime}m</span>}
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Active Doctors */}
      {showActiveDoctors && (
        <div className="modal-overlay" onClick={() => setShowActiveDoctors(false)}>
          <div className="modal-content small" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Active Doctors</h2>
              <button className="close-modal-btn" onClick={() => setShowActiveDoctors(false)}>✕</button>
            </div>
            <div className="active-doctors-list">
              {doctors.filter(d => d.status === 'active').map(doctor => (
                <div key={doctor.id} className="active-doctor-item">
                  <div className="doctor-name-display">{doctor.name}</div>
                  <div className="doctor-degree-display">{doctor.degree}</div>
                  <div className="doctor-shift-display">Shift: {doctor.shift === 'first' ? 'First' : 'Second'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Patient Details */}
      {selectedPatient && (
        <div className="modal-overlay" onClick={() => setSelectedPatient(null)}>
          <div className="modal-content small" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Patient Details</h2>
              <button className="close-modal-btn" onClick={() => setSelectedPatient(null)}>✕</button>
            </div>
            <div className="patient-details-content">
              {[
                ['ID',               selectedPatient.id],
                ['Name',             selectedPatient.name],
                ['Age',              `${selectedPatient.age} years`],
                ['Gender',           selectedPatient.gender],
                ['Contact',          selectedPatient.contact],
                ['Problem',          selectedPatient.problem],
                ['Appointment Type', selectedPatient.appointmentType],
                ['Status',           selectedPatient.status],
                ['Wait Time',        selectedPatient.waitingTime ? `${selectedPatient.waitingTime} min` : '—'],
              ].map(([l, v]) => (
                <div key={l} className="detail-row">
                  <span className="detail-label">{l}:</span>
                  <span className="detail-value">{v}</span>
                </div>
              ))}
              <div className="modal-actions">
                <button className="btn-complete" onClick={() => handleCompleteCheckup(selectedPatient.id)}>Complete Checkup</button>
                {selectedPatient.appointmentType?.toLowerCase() === 'emergency' && (
                  <button className="btn-override" onClick={() => {
                    const doc = doctors.find(d => d.id === selectedPatient.assignedDoctor);
                    if (doc) triggerEmergencyAI(doc, selectedPatient);
                    setSelectedPatient(null);
                  }}>🤖 AI Emergency Note</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Doctor */}
      {showAddDoctorForm && (
        <div className="modal-overlay" onClick={() => setShowAddDoctorForm(false)}>
          <div className="modal-content small" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add New Doctor</h2>
              <button className="close-modal-btn" onClick={() => setShowAddDoctorForm(false)}>✕</button>
            </div>
            <form onSubmit={handleAddDoctor} className="add-doctor-form">
              <div className="form-group">
                <label>Doctor Name *</label>
                <input type="text" required value={newDoctor.name} onChange={e => setNewDoctor({ ...newDoctor, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Degree *</label>
                <input type="text" required value={newDoctor.degree} onChange={e => setNewDoctor({ ...newDoctor, degree: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Department *</label>
                <select value="Pediatrics" disabled><option>Pediatrics</option></select>
              </div>
              <div className="form-group">
                <label>Experience (Years) *</label>
                <input type="number" required value={newDoctor.experience} onChange={e => setNewDoctor({ ...newDoctor, experience: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Status *</label>
                <select value={newDoctor.status} onChange={e => setNewDoctor({ ...newDoctor, status: e.target.value })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="form-group">
                <label>Shift *</label>
                <select value={newDoctor.shift} onChange={e => setNewDoctor({ ...newDoctor, shift: e.target.value })}>
                  <option value="first">First</option>
                  <option value="second">Second</option>
                </select>
              </div>
              <div className="form-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowAddDoctorForm(false)}>Cancel</button>
                <button type="submit" className="btn-add">Add Doctor</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default PediatricsDepartment;