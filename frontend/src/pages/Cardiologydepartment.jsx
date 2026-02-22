import React, { useState, useEffect, useCallback } from 'react';
import '../styles/CardiologyDepartment.css';

const BASE_URL = 'http://localhost:8000';

const api = {
  get:    path        => fetch(`${BASE_URL}${path}`).then(r => r.json()),
  post:   (path, body)=> fetch(`${BASE_URL}${path}`, { method:'POST',  headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }).then(r => r.json()),
  put:    (path, body)=> fetch(`${BASE_URL}${path}`, { method:'PUT',   headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }).then(r => r.json()),
  delete: path        => fetch(`${BASE_URL}${path}`, { method:'DELETE' }).then(r => r.json()),
};

// ─── Shift helpers ────────────────────────────────────────────────────────────
const dbShiftToUi = s => (s === 'morning' ? 'first' : 'second');
const uiShiftToDb = s => (s === 'first'   ? 'morning' : 'afternoon');

// ─── Priority sort: Emergency first → longer wait first → severity score ──────
const prioritySort = (a, b) => {
  const typeOrder = { emergency: 0, routine: 1, 'follow-up': 2 };
  const aType = typeOrder[a.appointmentType?.toLowerCase()] ?? 1;
  const bType = typeOrder[b.appointmentType?.toLowerCase()] ?? 1;
  if (aType !== bType) return aType - bType;
  const aWait = a.waitingTime ?? 0;
  const bWait = b.waitingTime ?? 0;
  if (aWait !== bWait) return bWait - aWait;
  return a.priority - b.priority;
};

const CardiologyDepartment = ({ onBack }) => {

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

  const [showAllAppointments,  setShowAllAppointments]  = useState(false);
  const [showActiveDoctors,    setShowActiveDoctors]    = useState(false);
  const [showAddDoctorForm,    setShowAddDoctorForm]    = useState(false);
  const [selectedPatient,      setSelectedPatient]      = useState(null);
  const [editingAppointment,   setEditingAppointment]   = useState(null);
  const [selectedStatusChange, setSelectedStatusChange] = useState(null);
  const [showReasonField,      setShowReasonField]      = useState(false);
  const [changeReason,         setChangeReason]         = useState('');
  const [statusChanges,        setStatusChanges]        = useState([]);

  // Tracks how many appointments each doctor has completed (removed from patients[])
  const [completedByDoctor, setCompletedByDoctor] = useState({});

  const [newDoctor, setNewDoctor] = useState({
    name: '', degree: '', department: 'Cardiology',
    experience: '', status: 'active', shift: 'first',
  });

  const equipment = [
    { id:1, name:'ECG Machine',     room:'Room 101', status:'available' },
    { id:2, name:'Echo Machine',    room:'Room 102', status:'in-use'   },
    { id:3, name:'Stress Test Unit',room:'Room 103', status:'available' },
    { id:4, name:'Holter Monitor',  room:'Room 104', status:'available' },
  ];

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const toggle = document.querySelector('.toggleContainer');
    if (toggle) toggle.style.display = 'none';
    return () => { if (toggle) toggle.style.display = 'flex'; };
  }, []);

  // ── FETCH DATA ────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const shiftParam = uiShiftToDb(selectedShift);
      const [apptRes, doctorsRes, statsRes] = await Promise.all([
        api.get('/appointments'),
        api.get(`/doctors/by-department?shift=${shiftParam}`),
        api.get('/dashboard/stats'),
      ]);

      const allAppts  = apptRes.appointments ?? [];
      const deptAppts = allAppts.filter(
        a => (a.department ?? '').toLowerCase() === 'cardiology'
      );

      const rawDoctors = doctorsRes.doctors_by_department?.['Cardiology'] ?? [];

      const mappedDoctors = rawDoctors.map(d => {
        const uiShift = d.shift ? dbShiftToUi(d.shift) : selectedShift;
        return {
          id:          d.id,
          name:        d.name,
          degree:      `${d.experience_years} yrs experience`,
          department:  'Cardiology',
          experience:  d.experience_years,
          status:      d.status,
          shift:       uiShift,
          isStandby:   d.is_standby ?? false,
          maxPatients: d.max_patients ?? 15,
        };
      });

      const activeDrs = mappedDoctors.filter(d => d.status === 'active');

      const mappedPatients = deptAppts.map((a, i) => ({
        id:              String(a.appointment_id),
        name:            a.patient_name,
        age:             a.age,
        gender:          a.gender,
        contact:         a.contact,
        department:      'Cardiology',
        problem:         a.problem,
        appointmentType: a.appointment_type,
        shift:           activeDrs.length
                           ? (activeDrs[i % activeDrs.length]?.shift ?? 'first')
                           : 'first',
        arrivalTime:     a.appointment_time ? a.appointment_time.slice(11, 16) : '',
        arrivalStatus:   'On-Time',
        priority:        a.severity_score ?? 2,
        assignedDoctor:  activeDrs.length ? activeDrs[i % activeDrs.length].id : null,
        status:          a.status,
        waitingTime:     a.waiting_time ?? 0,
      }));

      const deptStat   = statsRes.dept_stats?.['Cardiology'];
      const deptWait   = deptStat?.wait_time ?? 0;
      const globalWait = statsRes.avg_wait_time ?? 0;

      let avgWait = deptWait > 0 ? deptWait : (globalWait > 0 ? globalWait : 0);

      if (avgWait === 0 && deptAppts.length > 0) {
        const withWait = deptAppts.filter(a => (a.waiting_time ?? 0) > 0);
        if (withWait.length > 0) {
          avgWait = Math.round(
            withWait.reduce((sum, a) => sum + a.waiting_time, 0) / withWait.length
          );
        } else {
          const queued = deptAppts.filter(
            a => ['scheduled', 'waiting', 'in-progress'].includes(a.status)
          ).length;
          avgWait = queued > 0 ? 15 + queued * 5 : 0;
        }
      }

      setStats({
        totalAppointments: deptAppts.length,
        emergencyCases:    deptAppts.filter(
          a => (a.appointment_type ?? '').toLowerCase() === 'emergency'
        ).length,
        avgWaitTime:   avgWait,
        activeDoctors: activeDrs.length,
      });

      setTodayStats({
        completed:  deptAppts.filter(a => a.status === 'completed').length,
        inProgress: deptAppts.filter(a => a.status === 'in-progress').length,
        waiting:    deptAppts.filter(
          a => a.status === 'waiting' || a.status === 'scheduled'
        ).length,
        cancelled:  deptAppts.filter(a => a.status === 'cancelled').length,
      });

      setDoctors(mappedDoctors);
      setPatients(mappedPatients);
      setCompletedByDoctor({});

    } catch (err) {
      console.error('Fetch error:', err);
      setError('Could not load data. Make sure your backend is running on ' + BASE_URL);
    } finally {
      setLoading(false);
    }
  }, [selectedShift]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const formatTime = d => d.toLocaleTimeString('en-IN', {
    hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true,
  });

  // ── Patient queue for a doctor, sorted by correct priority ───────────────
  // Excludes completed patients; in-progress shown at top as they are pos #1
  const getPatientsByDoctor = useCallback((doctorId) => {
    // Put in-progress first (they are the CURRENT patient), then priority sort the rest
    const assigned = patients.filter(
      p => p.assignedDoctor === doctorId && p.status !== 'completed'
    );
    const inProgress = assigned.filter(p => p.status === 'in-progress').sort(prioritySort);
    const others     = assigned.filter(p => p.status !== 'in-progress').sort(prioritySort);
    return [...inProgress, ...others];
  }, [patients]);

  // ── Live doctor stats computed from patients state ────────────────────────
  const getDoctorStats = useCallback((doctorId) => {
    const queue      = getPatientsByDoctor(doctorId);
    const inProgress = queue.filter(p => p.status === 'in-progress');

    // ── CURRENT PATIENT: prefer an in-progress patient; otherwise the #1
    //    priority patient in the waiting queue (whoever the doctor sees next)
    const currentPatient = inProgress[0] ?? queue[0] ?? null;

    // Today's appointments = still in queue + locally completed ones
    const todayAppts = queue.length + (completedByDoctor[doctorId] ?? 0);

    // Next Available logic
    let nextAvailable;
    if (queue.length === 0) {
      nextAvailable = 'Available Now';
    } else if (inProgress.length > 0) {
      const estMins = inProgress.length * 15;
      nextAvailable = `~${estMins} min`;
    } else {
      nextAvailable = `${queue.length} waiting`;
    }

    return { currentPatient, inProgress, todayAppts, nextAvailable };
  }, [patients, completedByDoctor, getPatientsByDoctor]);

  const getPatientsByShift = shift => patients.filter(p => p.shift === shift);

  // ── Doctor toggle ─────────────────────────────────────────────────────────
  const toggleDoctorStatus = async doctorId => {
    const doc       = doctors.find(d => d.id === doctorId);
    if (!doc) return;
    const newStatus = doc.status === 'active' ? 'inactive' : 'active';

    try { await api.put(`/doctors/${doctorId}/status`, { status: newStatus }); }
    catch { console.warn('Backend toggle failed; updating locally'); }

    const updated   = doctors.map(d => d.id === doctorId ? { ...d, status: newStatus } : d);
    const activeDrs = updated.filter(d => d.status === 'active');
    setDoctors(updated);
    setStats(prev => ({ ...prev, activeDoctors: activeDrs.length }));

    const sorted   = [...patients].sort(prioritySort);
    const withDocs = sorted.map((p, i) => ({
      ...p,
      assignedDoctor: activeDrs.length ? activeDrs[i % activeDrs.length].id : null,
    }));
    setPatients(withDocs);
  };

  // ── Complete checkup ──────────────────────────────────────────────────────
  const handleCompleteCheckup = async patientId => {
    const patient = patients.find(p => p.id === patientId);
    try {
      await api.put(`/appointments/${patientId}`, {
        appointment_type: 'Routine', problem_text: '', department: 'Cardiology', status: 'completed',
      });
    } catch {}

    if (patient?.assignedDoctor) {
      setCompletedByDoctor(prev => ({
        ...prev,
        [patient.assignedDoctor]: (prev[patient.assignedDoctor] ?? 0) + 1,
      }));
    }

    setPatients(prev => prev.filter(p => p.id !== patientId));
    setTodayStats(prev => ({
      ...prev,
      completed:  prev.completed + 1,
      inProgress: Math.max(0, prev.inProgress - 1),
    }));
    setSelectedPatient(null);
  };

  // ── Cancel appointment ────────────────────────────────────────────────────
  const handleCancelAppointment = async patientId => {
    try { await api.delete(`/appointments/${patientId}`); } catch {}
    setPatients(prev => prev.filter(p => p.id !== patientId));
    setTodayStats(prev => ({
      ...prev,
      cancelled: prev.cancelled + 1,
      waiting:   Math.max(0, prev.waiting - 1),
    }));
    setEditingAppointment(null);
    setShowReasonField(false);
    setChangeReason('');
  };

  // ── Arrival status ────────────────────────────────────────────────────────
  const handleArrivalStatusChange = newStatus => {
    const needsReason = ['Change Shift','Reschedule','Late'].includes(newStatus);
    setShowReasonField(needsReason);
    if (!needsReason) setChangeReason('');
    setEditingAppointment(prev => ({ ...prev, arrivalStatus: newStatus }));
  };

  const handleEditAppointment = patient => {
    setShowAllAppointments(false);
    setEditingAppointment(patient);
    setShowReasonField(['Change Shift','Reschedule','Late'].includes(patient.arrivalStatus));
    setChangeReason('');
  };

  const handleSaveAppointment = async updated => {
    const needsReason = ['Change Shift','Reschedule','Late'].includes(updated.arrivalStatus);

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
        id:            Date.now(),
        patientId:     updated.id,
        patientName:   updated.name,
        patientAge:    updated.age,
        patientGender: updated.gender,
        patientContact:updated.contact,
        patientProblem:updated.problem,
        arrivalStatus: updated.arrivalStatus,
        arrivalTime:   updated.arrivalStatus === 'Reschedule' ? updated.arrivalTime : undefined,
        reason:        changeReason,
        timestamp:     new Date().toLocaleString('en-IN', {
          day:'2-digit', month:'2-digit', year:'numeric',
          hour:'2-digit', minute:'2-digit', hour12:true,
        }),
      };
      setStatusChanges(prev => [record, ...prev]);
    }

    const prev = patients.find(p => p.id === updated.id);
    if (prev && prev.status !== 'in-progress' && updated.status === 'in-progress') {
      setTodayStats(s => ({
        ...s,
        inProgress: s.inProgress + 1,
        waiting: Math.max(0, s.waiting - 1),
      }));
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
        department:       'Cardiology',
        experience_years: parseInt(newDoctor.experience),
        status:           newDoctor.status,
        shift:            uiShiftToDb(newDoctor.shift),
      });
      if (result.doctor_id) {
        setDoctors(prev => [...prev, {
          id:          result.doctor_id,
          name:        newDoctor.name,
          degree:      newDoctor.degree || `${newDoctor.experience} yrs experience`,
          department:  'Cardiology',
          experience:  parseInt(newDoctor.experience),
          status:      newDoctor.status,
          shift:       newDoctor.shift,
          isStandby:   false,
          maxPatients: 15,
        }]);
        if (newDoctor.status === 'active') {
          setStats(prev => ({ ...prev, activeDoctors: prev.activeDoctors + 1 }));
        }
      }
    } catch { console.warn('Add doctor failed'); }
    setShowAddDoctorForm(false);
    setNewDoctor({ name:'', degree:'', department:'Cardiology', experience:'', status:'active', shift:'first' });
  };

  // ── Time helpers ──────────────────────────────────────────────────────────
  const to24h = (t = '') => {
    if (!t) return '';
    const m = t.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!m) return t.length === 5 ? t : '';
    let h = parseInt(m[1]);
    if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
    if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2,'0')}:${m[2]}`;
  };
  const to12h = val => {
    if (!val) return '';
    const [h24, min] = val.split(':');
    const h    = parseInt(h24);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const disp = h > 12 ? h-12 : h === 0 ? 12 : h;
    return `${String(disp).padStart(2,'0')}:${min} ${ampm}`;
  };

  const visibleDoctors = doctors.filter(d => d.shift === selectedShift);

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="cardiology-container">

      {/* HEADER */}
      <div className="cardio-header">
        <button className="back-btn" onClick={onBack}>← Back to Dashboard</button>
        <div className="header-center">
          <h1 className="dept-heading">Cardiology Department</h1>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={fetchData} style={{
            background:'rgba(255,255,255,.15)', border:'1px solid rgba(255,255,255,.3)',
            color:'#fff', padding:'6px 14px', borderRadius:8, cursor:'pointer', fontSize:12,
          }}>↻ Refresh</button>
          <div className="header-time">
            <div className="time-display">{formatTime(currentTime)}</div>
          </div>
        </div>
      </div>

      {/* LOADING */}
      {loading && (
        <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:300, flexDirection:'column', gap:12, color:'#6b7280' }}>
          <div style={{ width:36, height:36, border:'3px solid #e5e7eb', borderTopColor:'#e05b5b', borderRadius:'50%', animation:'spin .7s linear infinite' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          Loading Cardiology data from database…
        </div>
      )}

      {/* ERROR */}
      {!loading && error && (
        <div style={{ margin:28, background:'#fff1f1', border:'1px solid #fca5a5', borderRadius:12, padding:20, color:'#b91c1c' }}>
          <strong>⚠ Connection Error</strong>
          <p style={{ marginTop:8, fontSize:14 }}>{error}</p>
          <button onClick={fetchData} style={{ marginTop:8, padding:'8px 18px', background:'#e05b5b', color:'#fff', border:'none', borderRadius:8, cursor:'pointer' }}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (<>

        {/* STAT CARDS */}
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
              <div className="stat-value">
                {stats.avgWaitTime > 0 ? `${stats.avgWaitTime} min` : '—'}
              </div>
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

        {/* TODAY'S SUMMARY */}
        <div className="today-summary">
          <h2 className="section-title">Today's Summary</h2>
          <div className="summary-grid">
            <div className="summary-item completed">
              <div className="summary-value">{todayStats.completed}</div>
              <div className="summary-label">Completed</div>
            </div>
            <div className="summary-item in-progress">
              <div className="summary-value">{todayStats.inProgress}</div>
              <div className="summary-label">In Progress</div>
            </div>
            <div className="summary-item waiting">
              <div className="summary-value">{todayStats.waiting}</div>
              <div className="summary-label">Waiting</div>
            </div>
            <div className="summary-item cancelled">
              <div className="summary-value">{todayStats.cancelled}</div>
              <div className="summary-label">Cancelled</div>
            </div>
          </div>
        </div>

        {/* STATUS CHANGES TABLE */}
        {statusChanges.length > 0 && (
          <div className="status-changes-section">
            <h2 className="section-title">
              <span className="status-change-icon">📋</span> Arrival Status Changes
            </h2>
            <div className="status-changes-table-container">
              <table className="status-changes-table">
                <thead>
                  <tr>
                    <th>Patient ID</th>
                    <th>Arrival Status</th>
                    {statusChanges.some(sc => sc.arrivalTime) && <th>Arrival Time</th>}
                    <th>Reason</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {statusChanges.map(change => (
                    <tr key={change.id} onClick={() => setSelectedStatusChange(change)} className="clickable-row">
                      <td className="status-patient-id">{change.patientId}</td>
                      <td className={`status-badge-cell ${change.arrivalStatus.toLowerCase().replace(' ','-')}`}>
                        <span className="status-badge">{change.arrivalStatus}</span>
                      </td>
                      {statusChanges.some(sc => sc.arrivalTime) && (
                        <td className="arrival-time-cell">{change.arrivalTime || '–'}</td>
                      )}
                      <td className="reason-cell">{change.reason}</td>
                      <td className="timestamp-cell">{change.timestamp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* DOCTOR SECTION */}
        <div className="doctor-section-wrapper">
          <div className="section-header">
            <h2 className="section-title">Doctor Section</h2>
            <div className="shift-selector">
              <button
                className={`shift-btn ${selectedShift==='first'?'active':''}`}
                onClick={() => setSelectedShift('first')}
              >
                First Shift
              </button>
              <button
                className={`shift-btn ${selectedShift==='second'?'active':''}`}
                onClick={() => setSelectedShift('second')}
              >
                Second Shift
              </button>
            </div>
          </div>

          {visibleDoctors.length === 0 && (
            <div style={{ background:'#f9fafb', borderRadius:12, padding:24, textAlign:'center', color:'#9ca3af' }}>
              No doctors scheduled for the{' '}
              {selectedShift === 'first' ? 'First (Morning)' : 'Second (Evening)'} shift.
              {doctors.length > 0 && (
                <div style={{ marginTop:8, fontSize:13, color:'#d1d5db' }}>
                  {doctors.length} doctor(s) found in other shift.
                </div>
              )}
            </div>
          )}

          {visibleDoctors.map(doctor => {
            const { currentPatient, inProgress, todayAppts, nextAvailable } = getDoctorStats(doctor.id);
            const queue = getPatientsByDoctor(doctor.id);

            const nextAvailableColor = doctor.status === 'inactive'
              ? '#9ca3af'
              : nextAvailable === 'Available Now'
                ? '#059669'
                : nextAvailable.startsWith('~')
                  ? '#d97706'
                  : '#6b7280';

            return (
              <div key={doctor.id} className={`doctor-full-card ${doctor.status}`}>
                <div className="doctor-card-header">
                  <div className="doctor-info-main">
                    <div className="doctor-name-section">
                      <h3 className="doctor-name">{doctor.name}</h3>
                      <p className="doctor-degree">{doctor.degree}</p>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    {doctor.isStandby && (
                      <span style={{ background:'#fff7ed', color:'#c2410c', fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:20, border:'1px solid #fed7aa' }}>
                        Standby
                      </span>
                    )}
                    <span style={{
                      padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700,
                      background: doctor.status==='active' ? '#d1fae5' : '#fee2e2',
                      color:      doctor.status==='active' ? '#065f46' : '#b91c1c',
                    }}>{doctor.status.toUpperCase()}</span>
                  </div>
                </div>

                <div className="doctor-metrics-row">

                  {/* ── CURRENT PATIENT: #1 in priority queue ─────────────
                      Shows name of whoever the doctor is seeing right now.
                      If someone has status='in-progress' they appear first;
                      otherwise the top-priority waiting patient is shown.   */}
                  <div className="metric-item">
                    <div className="metric-label">Current Patient</div>
                    <div className="metric-value">
                      {currentPatient ? (
                        <span style={{ display:'flex', flexDirection:'column', gap:2 }}>
                          <span style={{ fontWeight:700 }}>{currentPatient.name}</span>
                          <span style={{
                            fontSize:10, fontWeight:600,
                            color: currentPatient.status === 'in-progress' ? '#2563eb'
                              : currentPatient.appointmentType?.toLowerCase() === 'emergency' ? '#e05b5b'
                              : '#6b7280',
                            background: currentPatient.status === 'in-progress' ? '#eff6ff'
                              : currentPatient.appointmentType?.toLowerCase() === 'emergency' ? '#fff1f1'
                              : '#f3f4f6',
                            padding:'1px 6px', borderRadius:6, width:'fit-content',
                          }}>
                            {currentPatient.status === 'in-progress'
                              ? 'IN PROGRESS'
                              : currentPatient.appointmentType?.toUpperCase() ?? 'NEXT UP'}
                          </span>
                        </span>
                      ) : 'None'}
                    </div>
                  </div>

                  {/* ── TODAY'S APPOINTMENTS: live count ──────────────────── */}
                  <div className="metric-item">
                    <div className="metric-label">Today's Appointments</div>
                    <div className="metric-value">{todayAppts}</div>
                  </div>

                  {/* ── NEXT AVAILABLE: dynamic availability estimate ──────── */}
                  <div className="metric-item">
                    <div className="metric-label">Next Available</div>
                    <div className="metric-value" style={{ color: nextAvailableColor }}>
                      {doctor.status === 'inactive' ? 'Inactive' : nextAvailable}
                    </div>
                  </div>

                </div>

                {doctor.status === 'active' && (
                  <div className="patient-queue-section">
                    <h4 className="queue-title">
                      Patient Queue ({queue.length})
                      {inProgress.length > 0 && (
                        <span style={{ marginLeft:10, fontSize:11, fontWeight:600, color:'#2563eb', background:'#eff6ff', padding:'2px 8px', borderRadius:10 }}>
                          {inProgress.length} In Progress
                        </span>
                      )}
                    </h4>
                    <div className="queue-list">
                      {queue.length === 0 ? (
                        <div className="no-patients">No patients in queue</div>
                      ) : (
                        queue.map((patient, index) => (
                          <div
                            key={patient.id}
                            className="queue-patient-item"
                            style={{
                              borderLeft: patient.status === 'in-progress'
                                ? '3px solid #2563eb'
                                : index === 0
                                  ? '3px solid #e05b5b'   // top priority always highlighted
                                  : '3px solid transparent',
                            }}
                            onClick={() => setSelectedPatient(patient)}
                          >
                            <div className="patient-basic-info">
                              {/* Position number in queue */}
                              <span style={{
                                width:20, height:20, borderRadius:'50%', fontSize:10, fontWeight:700,
                                display:'inline-flex', alignItems:'center', justifyContent:'center',
                                background: index === 0 ? '#e05b5b' : '#e5e7eb',
                                color: index === 0 ? '#fff' : '#6b7280',
                                flexShrink: 0,
                              }}>
                                {index + 1}
                              </span>
                              <span className="patient-id">{patient.id}</span>
                              <span className="patient-name">{patient.name}</span>
                              <span className={`appointment-type-badge ${patient.appointmentType?.toLowerCase()}`}>
                                {patient.appointmentType}
                              </span>
                              {patient.status === 'in-progress' && (
                                <span style={{ fontSize:10, fontWeight:700, color:'#2563eb', background:'#eff6ff', padding:'2px 6px', borderRadius:8 }}>
                                  IN PROGRESS
                                </span>
                              )}
                            </div>
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                              <div className="patient-problem-text">{patient.problem}</div>
                              {(patient.waitingTime ?? 0) > 30 && (
                                <span style={{ fontSize:11, color:'#d97706', background:'#fffbeb', padding:'2px 6px', borderRadius:6, border:'1px solid #fde68a', whiteSpace:'nowrap' }}>
                                  ⏱ {patient.waitingTime}m
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                <div className="doctor-actions">
                  <button className={`status-toggle-btn ${doctor.status}`}
                    onClick={() => toggleDoctorStatus(doctor.id)}>
                    {doctor.status === 'active' ? 'Mark as Inactive' : 'Mark as Active'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* ADD DOCTOR */}
        <div className="add-doctor-section">
          <button className="add-doctor-btn" onClick={() => setShowAddDoctorForm(true)}>
            + Add Doctor
          </button>
        </div>

        {/* EQUIPMENT */}
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

      {/* ══════════ MODALS ══════════ */}

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
                  {[['Name',editingAppointment.name],['Age',editingAppointment.age],
                    ['Gender',editingAppointment.gender],['Contact',editingAppointment.contact]
                  ].map(([l,v]) => (
                    <div key={l} className="info-item"><label>{l}:</label><span>{v}</span></div>
                  ))}
                </div>
              </div>
              <div className="form-section">
                <h3>Appointment Details (Editable)</h3>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Department *</label>
                    <select value={editingAppointment.department}
                      onChange={e => setEditingAppointment({...editingAppointment,department:e.target.value})}>
                      {['Cardiology','Neurology','Orthopedics','Dermatology','Pediatrics','General Medicine'].map(d=><option key={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Problem/Reason *</label>
                    <input type="text" value={editingAppointment.problem}
                      onChange={e => setEditingAppointment({...editingAppointment,problem:e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label>Appointment Type *</label>
                    <select value={editingAppointment.appointmentType}
                      onChange={e => setEditingAppointment({...editingAppointment,appointmentType:e.target.value})}>
                      {['Emergency','Routine','Follow-up'].map(t=><option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Arrival Time *</label>
                    <input type="time" className="time-picker-input"
                      value={to24h(editingAppointment.arrivalTime)}
                      onChange={e => setEditingAppointment({...editingAppointment,arrivalTime:to12h(e.target.value)})} />
                  </div>
                  <div className="form-group full-width">
                    <label>Arrival Status *</label>
                    <select value={editingAppointment.arrivalStatus}
                      onChange={e => handleArrivalStatusChange(e.target.value)}>
                      {['On-Time','Late','Reschedule','Change Shift'].map(s=><option key={s}>{s}</option>)}
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
                <button className="btn-cancel-appointment"
                  onClick={() => handleCancelAppointment(editingAppointment.id)}>
                  Cancel Appointment
                </button>
                <button className="btn-save-appointment"
                  onClick={() => handleSaveAppointment(editingAppointment)}
                  disabled={showReasonField && !changeReason.trim()}>
                  Save Changes
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
                ['Patient ID',    selectedStatusChange.patientId],
                ['Name',          selectedStatusChange.patientName],
                ['Age',           selectedStatusChange.patientAge],
                ['Gender',        selectedStatusChange.patientGender],
                ['Contact',       selectedStatusChange.patientContact],
                ['Problem',       selectedStatusChange.patientProblem],
                ['Arrival Status',selectedStatusChange.arrivalStatus],
                ['Reason',        selectedStatusChange.reason],
                ['Changed At',    selectedStatusChange.timestamp],
              ].map(([l,v]) => (
                <div key={l} className="detail-row">
                  <span className="detail-label">{l}:</span>
                  <span className="detail-value">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* All Appointments */}
      {showAllAppointments && (
        <div className="modal-overlay" onClick={() => setShowAllAppointments(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>All Appointments — Cardiology</h2>
              <button className="close-modal-btn" onClick={() => setShowAllAppointments(false)}>✕</button>
            </div>
            <div className="appointments-tabs">
              {['first','second'].map(shift => (
                <div key={shift}>
                  <h3 className={shift==='second'?'shift-divider':undefined}>
                    {shift==='first'?'First Shift':'Second Shift'}
                  </h3>
                  <div className="appointments-list">
                    {getPatientsByShift(shift).length === 0
                      ? <div style={{color:'#d1d5db',fontSize:13,marginBottom:8}}>No appointments</div>
                      : getPatientsByShift(shift).map(patient => (
                          <div key={patient.id} className="appointment-card"
                            onClick={() => handleEditAppointment(patient)}>
                            <div className="appointment-header-row">
                              <span className="appointment-id">{patient.id}</span>
                              <span className={`appointment-status-badge ${patient.status}`}>{patient.status}</span>
                            </div>
                            <div className="appointment-patient-name">{patient.name}</div>
                            <div className="appointment-detail-row">
                              <span>Age: {patient.age}</span>
                              <span>Type: {patient.appointmentType}</span>
                              {patient.waitingTime ? <span>Wait: {patient.waitingTime}m</span> : null}
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
              {doctors.filter(d => d.status==='active').length === 0
                ? <div style={{color:'#9ca3af',textAlign:'center',padding:20}}>No active doctors found.</div>
                : doctors.filter(d => d.status==='active').map(doctor => (
                    <div key={doctor.id} className="active-doctor-item">
                      <div className="doctor-name-display">{doctor.name}</div>
                      <div className="doctor-degree-display">{doctor.degree}</div>
                      <div className="doctor-shift-display">
                        Shift: {doctor.shift==='first'?'First (Morning)':'Second (Evening)'}
                        {doctor.isStandby && <span style={{marginLeft:8,fontSize:11,color:'#c2410c'}}>· Standby</span>}
                      </div>
                    </div>
                  ))
              }
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
                ['Age',              selectedPatient.age],
                ['Gender',           selectedPatient.gender],
                ['Contact',          selectedPatient.contact],
                ['Problem',          selectedPatient.problem],
                ['Appointment Type', selectedPatient.appointmentType],
                ['Status',           selectedPatient.status],
                ['Wait Time',        selectedPatient.waitingTime ? `${selectedPatient.waitingTime} min` : '—'],
              ].map(([l,v]) => (
                <div key={l} className="detail-row">
                  <span className="detail-label">{l}:</span>
                  <span className="detail-value">{v}</span>
                </div>
              ))}
              <div className="modal-actions">
                <button className="btn-complete"
                  onClick={() => handleCompleteCheckup(selectedPatient.id)}>
                  Complete Checkup
                </button>
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
                <input type="text" required value={newDoctor.name}
                  onChange={e => setNewDoctor({...newDoctor,name:e.target.value})} />
              </div>
              <div className="form-group">
                <label>Degree *</label>
                <input type="text" required value={newDoctor.degree}
                  onChange={e => setNewDoctor({...newDoctor,degree:e.target.value})} />
              </div>
              <div className="form-group">
                <label>Department *</label>
                <select value="Cardiology" disabled><option>Cardiology</option></select>
              </div>
              <div className="form-group">
                <label>Experience (Years) *</label>
                <input type="number" required value={newDoctor.experience}
                  onChange={e => setNewDoctor({...newDoctor,experience:e.target.value})} />
              </div>
              <div className="form-group">
                <label>Status *</label>
                <select value={newDoctor.status}
                  onChange={e => setNewDoctor({...newDoctor,status:e.target.value})}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="form-group">
                <label>Shift *</label>
                <select value={newDoctor.shift}
                  onChange={e => setNewDoctor({...newDoctor,shift:e.target.value})}>
                  <option value="first">First (Morning)</option>
                  <option value="second">Second (Evening)</option>
                </select>
              </div>
              <div className="form-actions">
                <button type="button" className="btn-cancel"
                  onClick={() => setShowAddDoctorForm(false)}>Cancel</button>
                <button type="submit" className="btn-add">Add Doctor</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default CardiologyDepartment;