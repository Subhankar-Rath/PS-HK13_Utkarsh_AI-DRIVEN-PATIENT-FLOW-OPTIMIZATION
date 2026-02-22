import React, { useState, useEffect, useCallback } from 'react';
import '../styles/ICUDepartment.css';

const BASE_URL = 'http://localhost:8000';

const api = {
  get:    (path)       => fetch(`${BASE_URL}${path}`).then(r => r.json()),
  post:   (path, body) => fetch(`${BASE_URL}${path}`, { method: 'POST',   headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  put:    (path, body) => fetch(`${BASE_URL}${path}`, { method: 'PUT',    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  delete: (path)       => fetch(`${BASE_URL}${path}`, { method: 'DELETE' }).then(r => r.json()),
};

async function getAIExplanation(eventType, context) {
  try {
    const res = await api.post('/ai/explain', { event_type: eventType, context });
    return res.explanation ?? 'No explanation available.';
  } catch {
    return 'AI service unavailable. Please check backend connection.';
  }
}

// ── Severity helpers ──────────────────────────────────────────────────────────
const getSeverityClass = score => {
  if (score >= 9) return 'severity-critical';
  if (score >= 7) return 'severity-high';
  if (score >= 5) return 'severity-moderate';
  return 'severity-stable';
};
const getSeverityColor = score => {
  if (score >= 9) return '#ef4444';
  if (score >= 7) return '#f59e0b';
  if (score >= 5) return '#3b82f6';
  return '#10b981';
};
const getSeverityLabel = score => {
  if (score >= 9) return 'CRITICAL';
  if (score >= 7) return 'HIGH';
  if (score >= 5) return 'MODERATE';
  return 'STABLE';
};

const ICUDepartment = ({ onBack }) => {

  const [currentTime,          setCurrentTime]          = useState(new Date());
  const [selectedShift,        setSelectedShift]        = useState('first');
  const [viewMode,             setViewMode]             = useState('queue');  // 'queue' | 'beds'
  const [doctors,              setDoctors]              = useState([]);
  const [patients,             setPatients]             = useState([]);
  const [loading,              setLoading]              = useState(true);
  const [error,                setError]                = useState(null);
  const [stats,                setStats]                = useState({ totalAppointments: 0, emergencyCases: 0, avgWaitTime: 0, activeDoctors: 0 });
  const [todayStats,           setTodayStats]           = useState({ completed: 0, inProgress: 0, waiting: 0, cancelled: 0 });
  const [showAllAppointments,  setShowAllAppointments]  = useState(false);
  const [showActiveDoctors,    setShowActiveDoctors]    = useState(false);
  const [showAddDoctorForm,    setShowAddDoctorForm]    = useState(false);
  const [selectedPatient,      setSelectedPatient]      = useState(null);
  const [editingAppointment,   setEditingAppointment]   = useState(null);
  const [selectedStatusChange, setSelectedStatusChange] = useState(null);
  const [showReasonField,      setShowReasonField]      = useState(false);
  const [changeReason,         setChangeReason]         = useState('');
  const [statusChanges,        setStatusChanges]        = useState([]);
  const [aiPanel,              setAiPanel]              = useState(null);
  const [aiHistory,            setAiHistory]            = useState([]);
  const [newDoctor,            setNewDoctor]            = useState({ name: '', degree: '', department: 'ICU', experience: '', status: 'active', shift: 'first' });

  const equipment = [
    { id: 1, name: 'Ventilator',          room: 'ICU Bay 1', status: 'in-use'      },
    { id: 2, name: 'Cardiac Monitor',     room: 'ICU Bay 2', status: 'in-use'      },
    { id: 3, name: 'Defibrillator',       room: 'ICU Bay 3', status: 'available'   },
    { id: 4, name: 'Infusion Pump',       room: 'ICU Bay 4', status: 'in-use'      },
    { id: 5, name: 'Pulse Oximeter',      room: 'ICU Bay 5', status: 'available'   },
    { id: 6, name: 'CPAP Machine',        room: 'ICU Bay 6', status: 'maintenance' },
    { id: 7, name: 'Dialysis Machine',    room: 'ICU Bay 7', status: 'available'   },
    { id: 8, name: 'Feeding Pump',        room: 'ICU Bay 8', status: 'in-use'      },
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

  const fetchData = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const shiftParam = selectedShift === 'first' ? 'morning' : 'afternoon';
      const [apptRes, doctorsRes, statsRes] = await Promise.all([
        api.get('/appointments'),
        api.get(`/doctors/by-department?shift=${shiftParam}`),
        api.get('/dashboard/stats'),
      ]);

      const deptAppts   = (apptRes.appointments ?? []).filter(a => a.department?.toLowerCase() === 'icu');
      const deptDoctors = doctorsRes.doctors_by_department?.['ICU'] ?? [];

      const mappedDoctors = deptDoctors.map(d => ({
        id: d.id, name: d.name,
        degree:            `${d.experience_years} yrs — ICU Specialist`,
        department:        'ICU',
        experience:        d.experience_years,
        status:            d.status,
        shift:             d.shift === 'morning' ? 'first' : 'second',
        todayAppointments: d.patients ?? 0,
        nextAvailable:     d.status === 'active' ? 'Available' : 'Inactive',
        isStandby:         d.is_standby ?? false,
      }));

      const mappedPatients = deptAppts.map(a => ({
        id: String(a.appointment_id), name: a.patient_name,
        age: a.age, gender: a.gender, contact: a.contact,
        department: 'ICU', problem: a.problem,
        appointmentType: a.appointment_type, shift: 'first',
        arrivalTime:   a.appointment_time ? a.appointment_time.slice(11, 16) : '',
        arrivalStatus: 'On-Time',
        priority:      a.severity_score ?? 5,
        severityScore: a.severity_score ?? 5,
        assignedDoctor:a.doctor_id ?? null,
        status:        a.status,
        waitingTime:   a.waiting_time,
        priorityScore: a.priority_score,
        predictedTime: a.predicted_service_time,
      }));

      const activeDrs = mappedDoctors.filter(d => d.status === 'active');
      // Sort ICU by severity DESC (highest first)
      const withDocs  = [...mappedPatients]
        .sort((a, b) => b.severityScore - a.severityScore)
        .map((p, i) => ({ ...p, assignedDoctor: activeDrs.length ? activeDrs[i % activeDrs.length].id : null }));

      setTodayStats({
        completed:  deptAppts.filter(a => a.status === 'completed').length,
        inProgress: deptAppts.filter(a => a.status === 'in-progress').length,
        waiting:    deptAppts.filter(a => a.status === 'waiting' || a.status === 'scheduled').length,
        cancelled:  deptAppts.filter(a => a.status === 'cancelled').length,
      });
      const deptStat = statsRes.dept_stats?.['ICU'];
      const criticalCount = deptAppts.filter(a => (a.severity_score ?? 0) >= 9).length;
      setStats({
        totalAppointments: deptAppts.length,
        emergencyCases:    criticalCount,
        avgWaitTime:       deptStat?.wait_time ?? statsRes.avg_wait_time ?? 0,
        activeDoctors:     activeDrs.length,
      });
      setDoctors(mappedDoctors);
      setPatients(withDocs);
    } catch (err) {
      setError('Could not load data. Make sure your backend is running on ' + BASE_URL);
    } finally {
      setLoading(false);
    }
  }, [selectedShift]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { const id = setInterval(fetchData, 15000); return () => clearInterval(id); }, [fetchData]);

  const formatTime = d => d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const getPatientsByShift  = shift    => patients.filter(p => p.shift === shift);
  const getPatientsByDoctor = doctorId => patients.filter(p => p.assignedDoctor === doctorId && p.status !== 'completed').sort((a, b) => b.severityScore - a.severityScore);

  const triggerAI = async (eventType, context) => {
    setAiPanel({ eventType, context, text: null, loading: true });
    const text  = await getAIExplanation(eventType, context);
    const entry = { id: Date.now(), eventType, context, text, time: new Date() };
    setAiPanel({ eventType, context, text, loading: false });
    setAiHistory(prev => [entry, ...prev]);
  };

  const toggleDoctorStatus = async doctorId => {
    const doc = doctors.find(d => d.id === doctorId);
    if (!doc) return;
    const newStatus = doc.status === 'active' ? 'inactive' : 'active';
    try { await api.put(`/doctors/${doctorId}/status`, { status: newStatus }); } catch {}
    const updated   = doctors.map(d => d.id === doctorId ? { ...d, status: newStatus } : d);
    const activeDrs = updated.filter(d => d.status === 'active');
    setDoctors(updated);
    setStats(prev => ({ ...prev, activeDoctors: activeDrs.length }));
    const withDocs = [...patients].sort((a, b) => b.severityScore - a.severityScore)
      .map((p, i) => ({ ...p, assignedDoctor: activeDrs.length ? activeDrs[i % activeDrs.length].id : null }));
    setPatients(withDocs);
    if (newStatus === 'inactive') {
      await triggerAI('doctor_inactive', {
        doctorName: doc.name, department: 'ICU',
        patientCount: patients.filter(p => p.assignedDoctor === doctorId).length,
        redirectedTo: activeDrs.filter(d => d.id !== doctorId).map(d => d.name).join(', ') || 'remaining ICU staff',
      });
    }
  };

  const handleStabilize = async patientId => {
    try { await api.put(`/appointments/${patientId}`, { appointment_type: 'Emergency', problem_text: '', department: 'ICU', status: 'completed' }); } catch {}
    setPatients(prev => prev.filter(p => p.id !== patientId));
    setTodayStats(prev => ({ ...prev, completed: prev.completed + 1, inProgress: prev.inProgress - 1 }));
    setSelectedPatient(null);
  };

  const handleCancelAppointment = async patientId => {
    try { await api.delete(`/appointments/${patientId}`); } catch {}
    setPatients(prev => prev.filter(p => p.id !== patientId));
    setTodayStats(prev => ({ ...prev, cancelled: prev.cancelled + 1, waiting: prev.waiting - 1 }));
    setEditingAppointment(null); setShowReasonField(false); setChangeReason('');
  };

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
    try { await api.put(`/appointments/${updated.id}`, { appointment_type: updated.appointmentType, problem_text: updated.problem, department: updated.department, status: updated.status }); } catch {}
    if (needsReason && changeReason.trim()) {
      if (updated.arrivalStatus === 'Change Shift') updated = { ...updated, shift: updated.shift === 'first' ? 'second' : 'first' };
      setStatusChanges(prev => [{
        id: Date.now(), patientId: updated.id, patientName: updated.name,
        patientAge: updated.age, patientGender: updated.gender, patientContact: updated.contact,
        patientProblem: updated.problem, arrivalStatus: updated.arrivalStatus,
        arrivalTime: updated.arrivalStatus === 'Reschedule' ? updated.arrivalTime : undefined,
        reason: changeReason,
        timestamp: new Date().toLocaleString('en-IN', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true }),
      }, ...prev]);
      await triggerAI(updated.arrivalStatus === 'Reschedule' ? 'reschedule' : 'delay', {
        patientName: updated.name, age: updated.age, problem: updated.problem,
        appointmentType: updated.appointmentType, reason: changeReason, newTime: updated.arrivalTime, department: 'ICU',
      });
    }
    setPatients(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
    setEditingAppointment(null); setShowReasonField(false); setChangeReason('');
  };

  const handleAddDoctor = async e => {
    e.preventDefault();
    try {
      const result = await api.post('/doctors', { name: newDoctor.name, department: 'ICU', experience_years: parseInt(newDoctor.experience), status: newDoctor.status, shift: newDoctor.shift === 'first' ? 'morning' : 'afternoon' });
      if (result.doctor_id) {
        setDoctors(prev => [...prev, { id: result.doctor_id, name: newDoctor.name, degree: newDoctor.degree || `${newDoctor.experience} yrs — ICU Specialist`, department: 'ICU', experience: parseInt(newDoctor.experience), status: newDoctor.status, shift: newDoctor.shift, todayAppointments: 0, nextAvailable: 'Available Now', isStandby: false }]);
        setStats(prev => ({ ...prev, activeDoctors: newDoctor.status === 'active' ? prev.activeDoctors + 1 : prev.activeDoctors }));
      }
    } catch {}
    setShowAddDoctorForm(false);
    setNewDoctor({ name: '', degree: '', department: 'ICU', experience: '', status: 'active', shift: 'first' });
  };

  const triggerCriticalAI = async (doctor, patient) => {
    await triggerAI('emergency_reassignment', {
      doctorName: doctor.name, department: 'ICU',
      emergencyPatient: patient.name, emergencyCondition: patient.problem,
      severityScore: patient.severityScore,
      affectedPatients: getPatientsByDoctor(doctor.id).filter(p => p.status !== 'in-progress').map(p => p.name).join(', ') || 'None',
    });
  };

  const to24h = (t = '') => { if (!t) return ''; const m = t.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i); if (!m) return ''; let h = parseInt(m[1]); if (m[3].toUpperCase()==='PM' && h!==12) h+=12; if (m[3].toUpperCase()==='AM' && h===12) h=0; return `${String(h).padStart(2,'0')}:${m[2]}`; };
  const to12h = val => { if (!val) return ''; const [h24,min]=val.split(':'); const h=parseInt(h24); const ampm=h>=12?'PM':'AM'; const disp=h>12?h-12:h===0?12:h; return `${String(disp).padStart(2,'0')}:${min} ${ampm}`; };

  const criticalPatients = patients.filter(p => p.severityScore >= 9 && p.status !== 'completed');

  return (
    <div className="icu-container">

      {/* HEADER */}
      <div className="icu-header">
        <button className="back-btn" onClick={onBack}>← Back to Dashboard</button>
        <div className="header-center" style={{ display:'flex', alignItems:'center', gap:12 }}>
          <h1 className="dept-heading">🚨 ICU — Intensive Care Unit</h1>
          {criticalPatients.length > 0 && (
            <div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(239,68,68,.15)', border:'1px solid rgba(239,68,68,.3)', borderRadius:20, padding:'4px 12px' }}>
              <span className="icu-critical-dot"/>
              <span style={{ fontSize:12, fontWeight:700, color:'#fca5a5' }}>{criticalPatients.length} CRITICAL</span>
            </div>
          )}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={fetchData} style={{ background:'rgba(255,255,255,.15)', border:'1px solid rgba(255,255,255,.3)', color:'#fff', padding:'6px 14px', borderRadius:8, cursor:'pointer', fontSize:12 }}>↻ Refresh</button>
          <div className="header-time"><div className="time-display">{formatTime(currentTime)}</div></div>
        </div>
      </div>

      {loading && (
        <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:300, flexDirection:'column', gap:12, color:'#64748b' }}>
          <div style={{ width:36, height:36, border:'3px solid rgba(239,68,68,.2)', borderTopColor:'#ef4444', borderRadius:'50%', animation:'spin .7s linear infinite' }}/>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          Loading ICU data…
        </div>
      )}

      {!loading && error && (
        <div style={{ margin:28, background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.3)', borderRadius:12, padding:20, color:'#fca5a5' }}>
          <strong>⚠ Connection Error</strong>
          <p style={{ marginTop:8, fontSize:14 }}>{error}</p>
          <button onClick={fetchData} style={{ marginTop:8, padding:'8px 18px', background:'#ef4444', color:'#fff', border:'none', borderRadius:8, cursor:'pointer' }}>Retry</button>
        </div>
      )}

      {!loading && !error && (<>

        {/* STAT CARDS */}
        <div className="icu-stats-grid">
          {[
            { icon:<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>, value:stats.totalAppointments, label:'Total ICU Patients', onClick:()=>setShowAllAppointments(true) },
            { icon:<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>, value:criticalPatients.length, label:'Critical Cases' },
            { icon:<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>, value:`${stats.avgWaitTime} min`, label:'Avg Response Time' },
            { icon:<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>, value:stats.activeDoctors, label:'ICU Specialists', onClick:()=>setShowActiveDoctors(true) },
          ].map((s,i) => (
            <div key={i} className="icu-stat-box" onClick={s.onClick} style={{ cursor:s.onClick?'pointer':'default' }}>
              <div className="stat-icon">{s.icon}</div>
              <div className="stat-content">
                <div className="stat-value">{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* TODAY SUMMARY */}
        <div className="icu-today-summary">
          <h2 className="icu-section-title">Today's Summary</h2>
          <div className="icu-summary-grid">
            {[['completed','Stabilized',todayStats.completed],['in-progress','Active Care',todayStats.inProgress],['waiting','Awaiting',todayStats.waiting],['cancelled','Discharged',todayStats.cancelled]].map(([cls,label,val]) => (
              <div key={cls} className={`icu-summary-item ${cls}`}>
                <div className="summary-value">{val}</div>
                <div className="summary-label">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* AI PANEL */}
        {aiPanel && (
          <div style={{ margin:'16px 28px 0', borderRadius:14, overflow:'hidden', border:'1.5px solid #ef4444', boxShadow:'0 4px 20px rgba(239,68,68,.2)' }}>
            <div style={{ background:'linear-gradient(135deg,#450a0a,#1a0d0d)', padding:'13px 18px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ color:'#fff', fontWeight:700, fontSize:14, display:'flex', alignItems:'center', gap:8 }}>
                🤖 AI Critical Care Assistant
                <span style={{ background:'rgba(255,255,255,.2)', borderRadius:20, padding:'2px 10px', fontSize:11 }}>{aiPanel.eventType.replace(/_/g,' ').replace(/\b\w/g, c=>c.toUpperCase())}</span>
              </div>
              <button onClick={() => setAiPanel(null)} style={{ background:'rgba(255,255,255,.15)', border:'none', color:'#fff', width:28, height:28, borderRadius:'50%', cursor:'pointer', fontSize:16 }}>×</button>
            </div>
            <div style={{ background:'#fff', padding:'16px 18px' }}>
              {aiPanel.loading
                ? <div style={{ display:'flex', alignItems:'center', gap:10, color:'#6b7280', fontSize:14 }}><div style={{ width:18, height:18, border:'2px solid #e5e7eb', borderTopColor:'#ef4444', borderRadius:'50%', animation:'spin .7s linear infinite' }}/>Generating AI explanation…</div>
                : <div style={{ fontSize:14, lineHeight:1.7, color:'#374151', background:'#fef2f2', borderRadius:10, padding:'13px 15px', borderLeft:'3px solid #ef4444' }}>{aiPanel.text}</div>
              }
              {aiHistory.length > 1 && (
                <div style={{ marginTop:14 }}>
                  <div style={{ fontSize:12, color:'#9ca3af', marginBottom:8 }}>Previous AI notes</div>
                  {aiHistory.slice(1,4).map(h => (
                    <div key={h.id} onClick={() => setAiPanel({...h,loading:false})} style={{ background:'#f9fafb', borderRadius:8, padding:'9px 13px', marginBottom:6, cursor:'pointer', border:'1px solid #e5e7eb' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#9ca3af', marginBottom:3 }}>
                        <span style={{ fontWeight:600, textTransform:'capitalize' }}>{h.eventType.replace(/_/g,' ')}</span>
                        <span>{h.time.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true})}</span>
                      </div>
                      <div style={{ fontSize:12, color:'#4b5563', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{h.text}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* STATUS CHANGES */}
        {statusChanges.length > 0 && (
          <div className="icu-status-changes-section">
            <h2 className="icu-section-title">📋 Status Changes</h2>
            <div className="icu-status-table-container">
              <table className="icu-status-table">
                <thead><tr>
                  <th>Patient ID</th><th>Status</th>
                  {statusChanges.some(sc=>sc.arrivalTime) && <th>Time</th>}
                  <th>Reason</th><th>Timestamp</th><th>AI Note</th>
                </tr></thead>
                <tbody>
                  {statusChanges.map(change => {
                    const linked = aiHistory.find(h => h.context?.patientName === change.patientName);
                    return (
                      <tr key={change.id} className="clickable-row" onClick={() => setSelectedStatusChange(change)}>
                        <td>{change.patientId}</td>
                        <td><span style={{ padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:700, background:'rgba(239,68,68,.1)', color:'#fca5a5' }}>{change.arrivalStatus}</span></td>
                        {statusChanges.some(sc=>sc.arrivalTime) && <td>{change.arrivalTime||'–'}</td>}
                        <td>{change.reason}</td>
                        <td style={{ fontSize:12, color:'#64748b' }}>{change.timestamp}</td>
                        <td>{linked
                          ? <button onClick={e=>{e.stopPropagation();setAiPanel({...linked,loading:false});}} style={{ padding:'3px 8px', background:'rgba(239,68,68,.1)', color:'#fca5a5', border:'1px solid rgba(239,68,68,.3)', borderRadius:6, fontSize:11, cursor:'pointer' }}>🤖 View</button>
                          : <span style={{ color:'#d1d5db', fontSize:12 }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* DOCTOR SECTION */}
        <div className="icu-section-wrapper">
          <div className="icu-section-header">
            <h2 className="icu-section-title">ICU Specialist Section</h2>
            <div style={{ display:'flex', gap:8 }}>
              {/* View mode toggle */}
              <div className="icu-view-toggle">
                <button className={`icu-view-btn ${viewMode==='queue'?'active':''}`} onClick={() => setViewMode('queue')}>📋 Queue</button>
                <button className={`icu-view-btn ${viewMode==='beds'?'active':''}`}  onClick={() => setViewMode('beds')}>🛏️ Beds</button>
              </div>
              <div className="icu-shift-selector">
                <button className={`icu-shift-btn ${selectedShift==='first'?'active':''}`}  onClick={() => setSelectedShift('first')}>First Shift</button>
                <button className={`icu-shift-btn ${selectedShift==='second'?'active':''}`} onClick={() => setSelectedShift('second')}>Second Shift</button>
              </div>
            </div>
          </div>

          {/* ── BEDS VIEW (all patients as cards) ── */}
          {viewMode === 'beds' && (
            <>
              <div className="icu-beds-grid">
                {patients.filter(p => p.status !== 'completed').length === 0
                  ? <div className="icu-no-data" style={{ gridColumn:'1/-1' }}>No active ICU patients.</div>
                  : patients.filter(p => p.status !== 'completed').map(patient => (
                    <div key={patient.id} className={`icu-bed-card ${getSeverityClass(patient.severityScore)}`} onClick={() => setSelectedPatient(patient)}>
                      {patient.severityScore >= 9 && (
                        <span className="icu-critical-dot" style={{ position:'absolute', top:14, right:14 }}/>
                      )}
                      <div className="icu-bed-patient-name">{patient.name}</div>
                      <div className="icu-bed-meta">
                        #{patient.id} · Age {patient.age}{patient.gender ? ` · ${patient.gender}` : ''}{patient.status === 'in-progress' ? ' · 🟡 In Care' : ' · 🔵 Waiting'}
                      </div>
                      <div className="icu-bed-problem">{patient.problem || 'No chief complaint recorded'}</div>
                      <div className="icu-severity-bar" style={{ width:`${Math.min((patient.severityScore/10)*100,100)}%`, background:getSeverityColor(patient.severityScore) }}/>
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                        <span style={{ padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:700, background:`${getSeverityColor(patient.severityScore)}22`, color:getSeverityColor(patient.severityScore) }}>
                          {getSeverityLabel(patient.severityScore)} {patient.severityScore}/10
                        </span>
                        {patient.waitingTime > 0 && (
                          <span style={{ padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:700, background:'rgba(245,158,11,.15)', color:'#f59e0b' }}>⏱ {patient.waitingTime}m</span>
                        )}
                      </div>
                    </div>
                  ))
                }
              </div>
            </>
          )}

          {/* ── QUEUE VIEW (by doctor) ── */}
          {viewMode === 'queue' && (
            <>
              {doctors.filter(d => d.shift === selectedShift).length === 0
                ? <div className="icu-no-data">No ICU specialists scheduled for this shift.</div>
                : doctors.filter(d => d.shift === selectedShift).map(doctor => (
                  <div key={doctor.id} className={`icu-doctor-card ${doctor.status}`}>
                    <div className="icu-doctor-card-header">
                      <div>
                        <h3 className="icu-doctor-name">{doctor.name}</h3>
                        <p className="icu-doctor-degree">{doctor.degree}</p>
                      </div>
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        {doctor.isStandby && <span style={{ background:'#fff7ed', color:'#c2410c', fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:20, border:'1px solid #fed7aa' }}>Standby</span>}
                        <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:doctor.status==='active'?'#d1fae5':'#fee2e2', color:doctor.status==='active'?'#065f46':'#b91c1c' }}>{doctor.status.toUpperCase()}</span>
                      </div>
                    </div>

                    <div className="icu-doctor-metrics">
                      {[
                        ['Patients in Care', getPatientsByDoctor(doctor.id).filter(p=>p.status==='in-progress').length || '0'],
                        ["Today's Patients", doctor.todayAppointments],
                        ['Critical',         getPatientsByDoctor(doctor.id).filter(p=>p.severityScore>=9).length || '0'],
                      ].map(([label,value]) => (
                        <div key={label} className="icu-metric-item">
                          <div className="metric-label">{label}</div>
                          <div className="metric-value">{value}</div>
                        </div>
                      ))}
                    </div>

                    {doctor.status === 'active' && (
                      <div>
                        <h4 className="icu-queue-title">Patient Queue ({getPatientsByDoctor(doctor.id).length})</h4>
                        {getPatientsByDoctor(doctor.id).length === 0
                          ? <div className="icu-no-data" style={{ padding:14 }}>No patients assigned</div>
                          : getPatientsByDoctor(doctor.id).map(patient => (
                            <div key={patient.id} className={`icu-queue-item ${patient.severityScore>=9?'critical-patient':''}`} onClick={() => setSelectedPatient(patient)}>
                              <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                                {patient.severityScore >= 9 && <span className="icu-critical-dot"/>}
                                <span style={{ fontSize:11, color:'#64748b', fontFamily:'monospace' }}>#{patient.id}</span>
                                <span style={{ fontSize:14, fontWeight:700, color:'#f1f5f9' }}>{patient.name}</span>
                                <span style={{ padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700, background:`${getSeverityColor(patient.severityScore)}22`, color:getSeverityColor(patient.severityScore) }}>
                                  {getSeverityLabel(patient.severityScore)} {patient.severityScore}/10
                                </span>
                              </div>
                              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                <span style={{ fontSize:12, color:'#94a3b8', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{patient.problem}</span>
                                {patient.waitingTime > 20 && <span style={{ fontSize:11, color:'#d97706', background:'#fffbeb', padding:'2px 6px', borderRadius:6, border:'1px solid #fde68a', whiteSpace:'nowrap' }}>⏱ {patient.waitingTime}m</span>}
                                <button onClick={e=>{e.stopPropagation();triggerCriticalAI(doctor,patient);}} style={{ padding:'3px 8px', background:'rgba(239,68,68,.1)', color:'#fca5a5', border:'1px solid rgba(239,68,68,.3)', borderRadius:6, fontSize:10, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>🤖 AI Note</button>
                              </div>
                            </div>
                          ))
                        }
                      </div>
                    )}

                    <div className="icu-doctor-actions">
                      <button className={`icu-status-toggle-btn ${doctor.status}`} onClick={() => toggleDoctorStatus(doctor.id)}>
                        {doctor.status === 'active' ? 'Mark as Inactive' : 'Mark as Active'}
                      </button>
                    </div>
                  </div>
                ))
              }
            </>
          )}
        </div>

        {/* ADD DOCTOR */}
        <div className="icu-add-doctor-section">
          <button className="icu-add-doctor-btn" onClick={() => setShowAddDoctorForm(true)}>+ Add ICU Specialist</button>
        </div>

        {/* EQUIPMENT */}
        <div className="icu-equipment-section">
          <h2 className="icu-section-title">Life-Support Equipment Status</h2>
          <div className="icu-equipment-grid">
            {equipment.map(item => (
              <div key={item.id} className="icu-equipment-item">
                <div className={`icu-equipment-indicator ${item.status}`}>
                  {item.status === 'available'
                    ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                    : item.status === 'in-use'
                    ? <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>
                    : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  }
                </div>
                <div>
                  <div className="icu-equipment-name">{item.name}</div>
                  <div className="icu-equipment-room">{item.room}</div>
                  <div className={`icu-equipment-status ${item.status}`}>{item.status.replace('-',' ').toUpperCase()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </>)}

      {/* ══ MODALS ══ */}

      {editingAppointment && (
        <div className="icu-modal-overlay" onClick={() => setEditingAppointment(null)}>
          <div className="icu-modal-content" onClick={e => e.stopPropagation()}>
            <div className="icu-modal-header">
              <h2>Patient {editingAppointment.id} Details</h2>
              <button className="close-modal-btn" onClick={() => setEditingAppointment(null)}>✕</button>
            </div>
            <div style={{ padding:'20px 22px' }}>
              <div className="icu-form-section">
                <h3 style={{ fontSize:13, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.06em', margin:'0 0 12px' }}>Patient Information</h3>
                <div className="icu-info-grid">
                  {[['Name',editingAppointment.name],['Age',editingAppointment.age],['Gender',editingAppointment.gender],['Contact',editingAppointment.contact]].map(([l,v]) => (
                    <div key={l} className="icu-info-item"><label>{l}</label><span>{v}</span></div>
                  ))}
                </div>
              </div>
              <div className="icu-form-section" style={{ marginTop:18 }}>
                <h3 style={{ fontSize:13, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.06em', margin:'0 0 12px' }}>ICU Care Details</h3>
                <div className="icu-form-grid">
                  <div className="icu-form-group">
                    <label>Department *</label>
                    <select value={editingAppointment.department} onChange={e => setEditingAppointment({...editingAppointment,department:e.target.value})}>
                      {['ICU','General','Cardiology','Neurology','Orthopedics','Dermatology','Pediatrics'].map(d=><option key={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="icu-form-group">
                    <label>Chief Complaint *</label>
                    <input type="text" value={editingAppointment.problem} onChange={e => setEditingAppointment({...editingAppointment,problem:e.target.value})}/>
                  </div>
                  <div className="icu-form-group">
                    <label>Appointment Type *</label>
                    <select value={editingAppointment.appointmentType} onChange={e => setEditingAppointment({...editingAppointment,appointmentType:e.target.value})}>
                      {['Emergency','Routine','Follow-up'].map(t=><option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="icu-form-group">
                    <label>Arrival Time *</label>
                    <input type="time" value={to24h(editingAppointment.arrivalTime)} onChange={e => setEditingAppointment({...editingAppointment,arrivalTime:to12h(e.target.value)})}/>
                  </div>
                  <div className="icu-form-group full-width">
                    <label>Arrival Status *</label>
                    <select value={editingAppointment.arrivalStatus} onChange={e => handleArrivalStatusChange(e.target.value)}>
                      {['On-Time','Late','Reschedule','Change Shift'].map(s=><option key={s}>{s}</option>)}
                    </select>
                  </div>
                  {showReasonField && (
                    <div className="icu-form-group full-width">
                      <label>Reason for {editingAppointment.arrivalStatus} *</label>
                      <textarea rows="3" placeholder="Enter reason…" value={changeReason} onChange={e => setChangeReason(e.target.value)}/>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="icu-form-actions">
              <button className="icu-btn-cancel-appt" onClick={() => handleCancelAppointment(editingAppointment.id)}>Cancel / Discharge</button>
              <button className="icu-btn-save" onClick={() => handleSaveAppointment(editingAppointment)} disabled={showReasonField && !changeReason.trim()}>Save & Get AI Explanation</button>
            </div>
          </div>
        </div>
      )}

      {selectedStatusChange && (
        <div className="icu-modal-overlay" onClick={() => setSelectedStatusChange(null)}>
          <div className="icu-modal-content small" onClick={e => e.stopPropagation()}>
            <div className="icu-modal-header">
              <h2>Patient Details – {selectedStatusChange.patientId}</h2>
              <button className="close-modal-btn" onClick={() => setSelectedStatusChange(null)}>✕</button>
            </div>
            <div style={{ padding:'20px 22px' }}>
              {[['Patient ID',selectedStatusChange.patientId],['Name',selectedStatusChange.patientName],['Age',selectedStatusChange.patientAge],['Gender',selectedStatusChange.patientGender],['Contact',selectedStatusChange.patientContact],['Problem',selectedStatusChange.patientProblem],['Status Change',selectedStatusChange.arrivalStatus],['Reason',selectedStatusChange.reason],['Changed At',selectedStatusChange.timestamp]].map(([l,v]) => (
                <div key={l} className="icu-detail-row"><span className="icu-detail-label">{l}</span><span className="icu-detail-value">{v}</span></div>
              ))}
              {(() => { const linked = aiHistory.find(h => h.context?.patientName === selectedStatusChange.patientName); return linked ? <div style={{ marginTop:14, background:'rgba(239,68,68,.08)', borderRadius:10, padding:12, borderLeft:'3px solid #ef4444' }}><div style={{ fontSize:11, fontWeight:600, color:'#fca5a5', marginBottom:6 }}>🤖 AI Explanation</div><div style={{ fontSize:13, lineHeight:1.6, color:'#e2e8f0' }}>{linked.text}</div></div> : null; })()}
            </div>
          </div>
        </div>
      )}

      {showAllAppointments && (
        <div className="icu-modal-overlay" onClick={() => setShowAllAppointments(false)}>
          <div className="icu-modal-content" onClick={e => e.stopPropagation()}>
            <div className="icu-modal-header">
              <h2>All ICU Patients</h2>
              <button className="close-modal-btn" onClick={() => setShowAllAppointments(false)}>✕</button>
            </div>
            <div style={{ padding:'20px 22px' }}>
              {['first','second'].map(shift => (
                <div key={shift}>
                  {shift==='second' && <div className="icu-shift-divider">Second Shift</div>}
                  {shift==='first' && <div style={{ fontSize:13, fontWeight:700, color:'#64748b', marginBottom:10 }}>First Shift</div>}
                  {getPatientsByShift(shift).length===0
                    ? <div style={{ color:'#64748b', fontSize:13, marginBottom:12 }}>No patients</div>
                    : getPatientsByShift(shift).map(patient => (
                      <div key={patient.id} className="icu-appt-card" onClick={() => handleEditAppointment(patient)}>
                        <div className="icu-appt-header-row">
                          <span className="icu-appt-id">#{patient.id}</span>
                          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                            <span style={{ padding:'2px 7px', borderRadius:20, fontSize:10, fontWeight:700, background:`${getSeverityColor(patient.severityScore)}22`, color:getSeverityColor(patient.severityScore) }}>{getSeverityLabel(patient.severityScore)}</span>
                            <span className={`icu-status-pill ${patient.status}`}>{patient.status}</span>
                          </div>
                        </div>
                        <div className="icu-appt-name">{patient.name}</div>
                        <div className="icu-appt-detail-row">
                          <span>Age: {patient.age}</span>
                          <span>Severity: {patient.severityScore}/10</span>
                          {patient.waitingTime && <span>Wait: {patient.waitingTime}m</span>}
                        </div>
                      </div>
                    ))
                  }
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showActiveDoctors && (
        <div className="icu-modal-overlay" onClick={() => setShowActiveDoctors(false)}>
          <div className="icu-modal-content small" onClick={e => e.stopPropagation()}>
            <div className="icu-modal-header">
              <h2>Active ICU Specialists</h2>
              <button className="close-modal-btn" onClick={() => setShowActiveDoctors(false)}>✕</button>
            </div>
            <div style={{ padding:'20px 22px' }}>
              {doctors.filter(d=>d.status==='active').length===0
                ? <div className="icu-no-data">No active specialists.</div>
                : doctors.filter(d=>d.status==='active').map(doctor => (
                  <div key={doctor.id} style={{ padding:'12px 0', borderBottom:'1px solid rgba(239,68,68,.1)' }}>
                    <div style={{ fontWeight:700, color:'#f1f5f9' }}>{doctor.name}</div>
                    <div style={{ fontSize:12, color:'#64748b', marginTop:3 }}>{doctor.degree}</div>
                    <div style={{ fontSize:12, color:'#94a3b8', marginTop:2 }}>Shift: {doctor.shift==='first'?'First':'Second'}</div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {selectedPatient && (
        <div className="icu-modal-overlay" onClick={() => setSelectedPatient(null)}>
          <div className="icu-modal-content small" onClick={e => e.stopPropagation()}>
            <div className="icu-modal-header">
              <h2>Patient Details — ICU</h2>
              <button className="close-modal-btn" onClick={() => setSelectedPatient(null)}>✕</button>
            </div>
            <div style={{ padding:'20px 22px' }}>
              {/* Severity banner */}
              <div style={{ background:`${getSeverityColor(selectedPatient.severityScore)}22`, border:`1px solid ${getSeverityColor(selectedPatient.severityScore)}44`, borderRadius:10, padding:'10px 14px', marginBottom:14, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontWeight:700, color:getSeverityColor(selectedPatient.severityScore) }}>{getSeverityLabel(selectedPatient.severityScore)}</span>
                <span style={{ fontSize:20, fontWeight:800, color:getSeverityColor(selectedPatient.severityScore) }}>{selectedPatient.severityScore}/10</span>
              </div>
              {[['ID',selectedPatient.id],['Name',selectedPatient.name],['Age',selectedPatient.age],['Gender',selectedPatient.gender],['Contact',selectedPatient.contact],['Condition',selectedPatient.problem],['Type',selectedPatient.appointmentType],['Status',selectedPatient.status],['Wait Time',selectedPatient.waitingTime?`${selectedPatient.waitingTime} min`:'—'],['Priority Score',selectedPatient.priorityScore??'—'],['Est. Care Time',selectedPatient.predictedTime?`${selectedPatient.predictedTime} min`:'—']].map(([l,v]) => (
                <div key={l} className="icu-detail-row"><span className="icu-detail-label">{l}</span><span className="icu-detail-value">{v}</span></div>
              ))}
              <div style={{ display:'flex', gap:10, marginTop:16 }}>
                <button className="icu-btn-stabilized" onClick={() => handleStabilize(selectedPatient.id)}>✅ Mark Stabilized</button>
                <button onClick={() => { const doc=doctors.find(d=>d.id===selectedPatient.assignedDoctor); if(doc) triggerCriticalAI(doc,selectedPatient); setSelectedPatient(null); }} style={{ padding:'9px 16px', background:'rgba(239,68,68,.1)', color:'#fca5a5', border:'1px solid rgba(239,68,68,.3)', borderRadius:9, fontSize:13, fontWeight:700, cursor:'pointer' }}>🤖 AI Note</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddDoctorForm && (
        <div className="icu-modal-overlay" onClick={() => setShowAddDoctorForm(false)}>
          <div className="icu-modal-content small" onClick={e => e.stopPropagation()}>
            <div className="icu-modal-header">
              <h2>Add ICU Specialist</h2>
              <button className="close-modal-btn" onClick={() => setShowAddDoctorForm(false)}>✕</button>
            </div>
            <form onSubmit={handleAddDoctor}>
              <div style={{ padding:'20px 22px' }}>
                <div className="icu-form-grid">
                  {[['Doctor Name *','text','name',newDoctor.name],['Specialization *','text','degree',newDoctor.degree],['Experience (Years) *','number','experience',newDoctor.experience]].map(([label,type,field,value])=>(
                    <div key={field} className="icu-form-group">
                      <label>{label}</label>
                      <input type={type} required value={value} onChange={e=>setNewDoctor({...newDoctor,[field]:e.target.value})}/>
                    </div>
                  ))}
                  <div className="icu-form-group"><label>Department *</label><select value="ICU" disabled><option>ICU</option></select></div>
                  <div className="icu-form-group"><label>Status *</label><select value={newDoctor.status} onChange={e=>setNewDoctor({...newDoctor,status:e.target.value})}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
                  <div className="icu-form-group"><label>Shift *</label><select value={newDoctor.shift} onChange={e=>setNewDoctor({...newDoctor,shift:e.target.value})}><option value="first">First</option><option value="second">Second</option></select></div>
                </div>
              </div>
              <div className="icu-form-actions">
                <button type="button" className="icu-btn-cancel" onClick={() => setShowAddDoctorForm(false)}>Cancel</button>
                <button type="submit" className="icu-btn-add">Add Specialist</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default ICUDepartment;