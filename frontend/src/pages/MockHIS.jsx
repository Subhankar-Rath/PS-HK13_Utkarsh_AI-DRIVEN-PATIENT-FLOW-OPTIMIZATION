import React, { useState, useEffect } from 'react';
import DoctorCard from './DoctorCard';
import '../styles/mockHIS.css';

const API_BASE = "http://localhost:8000";

// ─── URGENCY COLOR MAP ────────────────────────────────────────────────────────
const URGENCY_COLORS = {
  critical: { bg: '#ff000022', border: '#ff0000', text: '#ff4444', label: '🔴 CRITICAL' },
  high:     { bg: '#e74c3c22', border: '#e74c3c', text: '#e74c3c', label: '🟠 HIGH' },
  medium:   { bg: '#f39c1222', border: '#f39c12', text: '#f39c12', label: '🟡 MEDIUM' },
  low:      { bg: '#2ecc7122', border: '#2ecc71', text: '#2ecc71', label: '🟢 LOW' },
};

const MockHIS = () => {
  const [showAddPatient, setShowAddPatient]     = useState(false);
  const [showAddDoctor, setShowAddDoctor]       = useState(false);
  const [showDoctorPage, setShowDoctorPage]     = useState(false);
  const [selectedPatient, setSelectedPatient]   = useState(null);
  const [loading, setLoading]                   = useState(true);
  const [error, setError]                       = useState(null);
  const [patients, setPatients]                 = useState([]);
  const [doctorList, setDoctorList]             = useState([]);
  const [doctorLoading, setDoctorLoading]       = useState(false);

  // ── Hyper Emergency state ──────────────────────────────────────────────────
  const [hyperStep, setHyperStep]               = useState(0); // 0=closed 1=form 2=result
  const [hyperLoading, setHyperLoading]         = useState(false);
  const [hyperError, setHyperError]             = useState('');
  const [hyperInput, setHyperInput]             = useState({ name: '', age: '', problem_text: '' });
  const [hyperResult, setHyperResult]           = useState(null);   // triage API response
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [confirmLoading, setConfirmLoading]     = useState(false);
  const [confirmSuccess, setConfirmSuccess]     = useState(false);

  const [formData, setFormData] = useState({
    name: '', age: '', gender: '', contact: '',
    appointmentType: '', time: '', problem: '',
    department: '', shift: 'first', disability: ''
  });

  const [editData, setEditData] = useState({
    appointmentType: '', time: '', arrivalStatus: '',
    problem: '', department: '', shift: '', disability: ''
  });

  const [doctorForm, setDoctorForm] = useState({
    name: '', experience_years: '', department: '',
    shift: 'morning', status: 'active'
  });

  const departments = [
    'Cardiology', 'ICU', 'General', 'Orthopedics', 'Pediatrics', 'Dermatology'
  ];

  // ─── FETCH APPOINTMENTS ───────────────────────────────────────────────────
  const fetchAppointments = () => {
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/appointments`)
      .then(res => {
        if (!res.ok) throw new Error("Server error: " + res.status);
        return res.json();
      })
      .then(data => {
        const mapped = data.appointments.map(a => ({
          id: a.appointment_id,
          name: a.patient_name,
          age: a.age,
          gender: a.gender,
          disability: a.disability ? "Yes" : "No",
          contact: a.contact || "",
          appointmentType: a.appointment_type,
          time: a.appointment_time ? a.appointment_time.slice(11, 16) : "",
          arrivalStatus: a.status === "scheduled" ? "on-time" : a.status,
          problem: a.problem,
          department: a.department,
          shift: a.shift || "first",
          doctor: a.doctor_name,
          severity_score: a.severity_score,
          priority_score: a.priority_score,
          predicted_service_time: a.predicted_service_time,
          waiting_time: a.waiting_time
        }));
        setPatients(mapped);
        setLoading(false);
      })
      .catch(err => {
        setError("Could not connect to backend. Is the server running?");
        setLoading(false);
      });
  };

  // ─── FETCH DOCTORS ────────────────────────────────────────────────────────
  const fetchDoctors = () => {
    setDoctorLoading(true);
    fetch(`${API_BASE}/doctors`)
      .then(res => res.json())
      .then(data => { setDoctorList(data.doctors || []); setDoctorLoading(false); })
      .catch(() => setDoctorLoading(false));
  };

  useEffect(() => { fetchAppointments(); fetchDoctors(); }, []);

  // ─── HYPER EMERGENCY: STEP 1 → call triage API ───────────────────────────
  const handleHyperAnalyze = async () => {
    if (!hyperInput.name || !hyperInput.age || !hyperInput.problem_text) {
      setHyperError('Please fill all fields.'); return;
    }
    setHyperLoading(true);
    setHyperError('');
    try {
      const res  = await fetch(`${API_BASE}/hyper-emergency/triage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:         hyperInput.name,
          age:          parseInt(hyperInput.age),
          problem_text: hyperInput.problem_text
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setHyperResult(data);
      setSelectedDoctorId(data.recommended_doctor?.doctor_id || '');
      setHyperStep(2);
    } catch (e) {
      setHyperError('Triage failed: ' + e.message);
    } finally {
      setHyperLoading(false);
    }
  };

  // ─── HYPER EMERGENCY: STEP 2 → confirm appointment ───────────────────────
  const handleHyperConfirm = async () => {
    if (!selectedDoctorId) { setHyperError('Please select a doctor.'); return; }
    setConfirmLoading(true);
    setHyperError('');
    try {
      const res  = await fetch(`${API_BASE}/hyper-emergency/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:          hyperInput.name,
          age:           parseInt(hyperInput.age),
          gender:        'Unknown',
          contact:       '',
          disability:    false,
          problem_text:  hyperInput.problem_text,
          department_id: hyperResult.department_id,
          doctor_id:     parseInt(selectedDoctorId),
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setConfirmSuccess(true);
      fetchAppointments();
      setTimeout(() => {
        setConfirmSuccess(false);
        setHyperStep(0);
        setHyperInput({ name: '', age: '', problem_text: '' });
        setHyperResult(null);
      }, 2000);
    } catch (e) {
      setHyperError('Confirm failed: ' + e.message);
    } finally {
      setConfirmLoading(false);
    }
  };

  const closeHyper = () => {
    setHyperStep(0); setHyperResult(null); setHyperError(''); setConfirmSuccess(false);
    setHyperInput({ name: '', age: '', problem_text: '' });
  };

  // ─── ADD DOCTOR ───────────────────────────────────────────────────────────
  const handleAddDoctor = (e) => {
    e.preventDefault();
    fetch(`${API_BASE}/doctors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: doctorForm.name,
        experience_years: parseInt(doctorForm.experience_years),
        department: doctorForm.department,
        shift: doctorForm.shift,
        status: doctorForm.status
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        fetchDoctors();
        setDoctorForm({ name: '', experience_years: '', department: '', shift: 'morning', status: 'active' });
        setShowAddDoctor(false);
      })
      .catch(err => alert("Failed to add doctor: " + err.message));
  };

  // ─── TOGGLE DOCTOR STATUS ─────────────────────────────────────────────────
  const handleToggleDoctorStatus = (doctor) => {
    const newStatus = doctor.status === 'active' ? 'inactive' : 'active';
    fetch(`${API_BASE}/doctors/${doctor.doctor_id}/status`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus })
    })
      .then(res => res.json())
      .then(data => { if (data.error) throw new Error(data.error); fetchDoctors(); })
      .catch(err => alert("Failed to update status: " + err.message));
  };

  // ─── ADD PATIENT ──────────────────────────────────────────────────────────
  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      name: formData.name, age: parseInt(formData.age), gender: formData.gender,
      contact: formData.contact, disability: formData.disability === "Yes",
      appointment_type: formData.appointmentType,
      appointment_time: `${new Date().toISOString().slice(0, 10)}T${formData.time}:00`,
      problem_text: formData.problem, department: formData.department, shift: formData.shift
    };
    fetch(`${API_BASE}/appointments`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(res => { if (!res.ok) throw new Error("Failed to add patient"); return res.json(); })
      .then(data => {
        if (data.error) throw new Error(data.error);
        fetchAppointments();
        setFormData({ name:'',age:'',gender:'',contact:'',appointmentType:'',time:'',problem:'',department:'',shift:'first',disability:'' });
        setShowAddPatient(false);
      })
      .catch(err => alert("Failed to add patient: " + err.message));
  };

  // ─── UPDATE APPOINTMENT ───────────────────────────────────────────────────
  const handleUpdateAppointment = () => {
    const payload = {
      appointment_type: editData.appointmentType, problem_text: editData.problem,
      department: editData.department, shift: editData.shift,
      disability: editData.disability === "Yes",
      status: editData.arrivalStatus === "on-time" ? "scheduled" : editData.arrivalStatus
    };
    fetch(`${API_BASE}/appointments/${selectedPatient.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(res => res.json())
      .then(data => { if (data.error) throw new Error(data.error); fetchAppointments(); setSelectedPatient(null); })
      .catch(err => alert("Failed to update: " + err.message));
  };

  // ─── DELETE APPOINTMENT ───────────────────────────────────────────────────
  const handleDeletePatient = () => {
    fetch(`${API_BASE}/appointments/${selectedPatient.id}`, { method: "DELETE" })
      .then(res => res.json())
      .then(data => { if (data.error) throw new Error(data.error); fetchAppointments(); setSelectedPatient(null); })
      .catch(err => alert("Failed to delete: " + err.message));
  };

  // ─── HELPERS ──────────────────────────────────────────────────────────────
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === "contact") {
      const d = value.replace(/\D/g, "");
      if (d.length <= 10) setFormData({ ...formData, contact: d });
      return;
    }
    setFormData({ ...formData, [name]: value });
  };
  const handleEditChange = (e) => { const { name, value } = e.target; setEditData({ ...editData, [name]: value }); };
  const handleDoctorFormChange = (e) => { const { name, value } = e.target; setDoctorForm({ ...doctorForm, [name]: value }); };
  const handlePatientClick = (patient) => {
    setSelectedPatient(patient);
    setEditData({ appointmentType: patient.appointmentType, time: patient.time, arrivalStatus: patient.arrivalStatus, problem: patient.problem, department: patient.department, shift: patient.shift || 'first', disability: patient.disability });
  };
  const getAppointmentTypeLabel = (type) => ({ routine:'Routine', emergency:'Emergency', followup:'Follow-up' }[type] || type);
  const getArrivalStatusLabel   = (status) => ({ 'on-time':'On-Time', late:'Late', reschedule:'Reschedule', scheduled:'Scheduled' }[status] || status);

  if (showDoctorPage) return <DoctorCard onBack={() => setShowDoctorPage(false)} />;

  const urgencyStyle = hyperResult ? (URGENCY_COLORS[hyperResult.urgency_level] || URGENCY_COLORS.high) : URGENCY_COLORS.high;

  return (
    <div className="his-full-layout fade-in">

      {/* ── APPOINTMENTS SECTION ──────────────────────────────────────────── */}
      <section className="appointments-section">
        <div className="section-header glass-effect">
          <h2>Appointments</h2>
          <div className="header-buttons">
            {/* 🚨 HYPER EMERGENCY BUTTON */}
            <button
              className="hyper-emergency-btn"
              onClick={() => setHyperStep(1)}
              style={{
                background: 'linear-gradient(135deg, #ff0000, #cc0000)',
                color: '#fff', border: 'none', borderRadius: 10,
                padding: '8px 18px', fontWeight: 700, fontSize: 13,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 0 16px #ff000066',
                animation: 'pulse-red 1.5s infinite',
              }}
            >
              🚨 Hyper Emergency
            </button>
            <button className="add-doctor-btn" onClick={() => setShowAddDoctor(true)}>+ Add Doctor</button>
            <button className="add-btn" onClick={() => setShowAddPatient(true)}>+ Add Patient</button>
          </div>
        </div>

        {loading && <div style={{ textAlign:'center', padding:'2rem', opacity:0.6 }}>⏳ Loading appointments...</div>}
        {error   && <div style={{ textAlign:'center', padding:'1rem', color:'red' }}>⚠️ {error}<button onClick={fetchAppointments} style={{ marginLeft:'1rem', cursor:'pointer' }}>Retry</button></div>}

        {!loading && !error && (
          <div className="appt-grid">
            {patients.length === 0 && <div style={{ opacity:0.6, padding:'1rem' }}>No appointments found.</div>}
            {patients.map(patient => (
              <div
                key={patient.id}
                className={`glass-effect appt-card ${patient.appointmentType === 'emergency' ? 'emergency-card' : ''}`}
                onClick={() => handlePatientClick(patient)}
                style={patient.appointmentType === 'emergency' ? { borderLeft:'3px solid #e74c3c' } : {}}
              >
                <h4>{patient.name} {patient.appointmentType === 'emergency' && <span style={{ fontSize:11, color:'#e74c3c', fontWeight:700 }}>🚨 EMERGENCY</span>}</h4>
                <div className="appt-info">
                  <span className="appt-time">{getAppointmentTypeLabel(patient.appointmentType)} | {patient.time}</span>
                  <span className="appt-dept">🏥 {patient.department}</span>
                  {patient.doctor && <span className="appt-doctor">👨‍⚕️ {patient.doctor}</span>}
                  <span className={`status-badge-small ${patient.arrivalStatus}`}>{getArrivalStatusLabel(patient.arrivalStatus)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── DOCTOR LIST SECTION ──────────────────────────────────────────── */}
      <section className="appointments-section" style={{ marginTop:'1.5rem' }}>
        <div className="section-header glass-effect">
          <h2>Doctors</h2>
          <span style={{ fontSize:13, opacity:0.6 }}>Toggle status — changes reflect live in AI Dashboard</span>
        </div>
        {doctorLoading && <div style={{ textAlign:'center', padding:'1rem', opacity:0.6 }}>Loading doctors...</div>}
        {!doctorLoading && (
          <div className="appt-grid">
            {doctorList.map(doctor => (
              <div key={doctor.doctor_id} className="glass-effect appt-card">
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div>
                    <h4 style={{ margin:0 }}>{doctor.name}</h4>
                    <div className="appt-info" style={{ marginTop:6 }}>
                      <span className="appt-dept">🏥 {doctor.department}</span>
                      <span style={{ fontSize:12, opacity:0.7 }}>{doctor.experience_years} yrs experience</span>
                    </div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                    <span className={`status-badge-small ${doctor.status === 'active' ? 'on-time' : 'reschedule'}`}>
                      {doctor.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                    <button
                      onClick={() => handleToggleDoctorStatus(doctor)}
                      style={{ padding:'4px 10px', fontSize:11, borderRadius:20, border:'none', cursor:'pointer', background: doctor.status === 'active' ? '#e74c3c' : '#2ecc71', color:'#fff', fontWeight:600 }}
                    >
                      {doctor.status === 'active' ? 'Set Inactive' : 'Set Active'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {doctorList.length === 0 && <div style={{ opacity:0.6, padding:'1rem' }}>No doctors found.</div>}
          </div>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          🚨 HYPER EMERGENCY MODAL — STEP 1: Patient Info Form
      ══════════════════════════════════════════════════════════════════════ */}
      {hyperStep === 1 && (
        <div className="modal-overlay" onClick={closeHyper}>
          <div className="modal-content glass-effect" style={{ maxWidth:480, border:'2px solid #e74c3c' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ background:'linear-gradient(135deg,#ff000022,#e74c3c22)', borderBottom:'1px solid #e74c3c44' }}>
              <h3 style={{ color:'#e74c3c' }}>🚨 Hyper Emergency Triage</h3>
              <button className="close-modal" onClick={closeHyper}>×</button>
            </div>
            <div style={{ padding:'1.2rem' }}>
              <p style={{ fontSize:13, opacity:0.7, marginBottom:16 }}>
                Enter patient details. Our AI will instantly classify the department and recommend the best available doctor.
              </p>

              {hyperError && <div style={{ background:'#e74c3c22', border:'1px solid #e74c3c', borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:13, color:'#e74c3c' }}>{hyperError}</div>}

              <div className="form-group">
                <label>Patient Name *</label>
                <input type="text" value={hyperInput.name} onChange={e => setHyperInput({...hyperInput, name: e.target.value})} placeholder="Full name" />
              </div>
              <div className="form-group">
                <label>Age *</label>
                <input type="number" value={hyperInput.age} onChange={e => setHyperInput({...hyperInput, age: e.target.value})} placeholder="Age in years" min={0} />
              </div>
              <div className="form-group">
                <label>Problem / Chief Complaint *</label>
                <textarea
                  value={hyperInput.problem_text}
                  onChange={e => setHyperInput({...hyperInput, problem_text: e.target.value})}
                  placeholder="Describe symptoms in detail (e.g., severe chest pain radiating to left arm, difficulty breathing...)"
                  rows={4}
                  style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:8, padding:'10px 12px', color:'inherit', fontSize:13, resize:'vertical' }}
                />
              </div>

              <div className="form-actions" style={{ marginTop:12 }}>
                <button type="button" className="btn-cancel" onClick={closeHyper}>Cancel</button>
                <button
                  onClick={handleHyperAnalyze}
                  disabled={hyperLoading}
                  style={{ background: hyperLoading ? '#555' : 'linear-gradient(135deg,#e74c3c,#c0392b)', color:'#fff', border:'none', borderRadius:8, padding:'10px 22px', fontWeight:700, cursor: hyperLoading ? 'not-allowed' : 'pointer', fontSize:13 }}
                >
                  {hyperLoading ? '⏳ Analyzing...' : '🧠 Analyze with AI →'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          🚨 HYPER EMERGENCY MODAL — STEP 2: AI Result + Doctor Selection
      ══════════════════════════════════════════════════════════════════════ */}
      {hyperStep === 2 && hyperResult && (
        <div className="modal-overlay" onClick={closeHyper}>
          <div
            className="modal-content glass-effect"
            style={{ maxWidth:540, border:`2px solid ${urgencyStyle.border}`, maxHeight:'90vh', overflowY:'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header" style={{ background:`${urgencyStyle.bg}`, borderBottom:`1px solid ${urgencyStyle.border}44` }}>
              <h3 style={{ color: urgencyStyle.text }}>🚨 Triage Result — {hyperInput.name}</h3>
              <button className="close-modal" onClick={closeHyper}>×</button>
            </div>

            <div style={{ padding:'1.2rem' }}>
              {confirmSuccess ? (
                <div style={{ textAlign:'center', padding:'2rem' }}>
                  <div style={{ fontSize:48 }}>✅</div>
                  <h3 style={{ color:'#2ecc71', marginTop:12 }}>Emergency Appointment Created!</h3>
                  <p style={{ opacity:0.7, fontSize:13 }}>Doctor has been assigned and notified.</p>
                </div>
              ) : (
                <>
                  {/* AI Analysis Card */}
                  <div style={{ background: urgencyStyle.bg, border:`1px solid ${urgencyStyle.border}`, borderRadius:10, padding:'12px 16px', marginBottom:16 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                      <span style={{ fontWeight:700, fontSize:15 }}>🧠 AI Analysis</span>
                      <span style={{ background: urgencyStyle.border, color:'#fff', borderRadius:20, padding:'2px 10px', fontSize:11, fontWeight:700 }}>
                        {urgencyStyle.label}
                      </span>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                      <span style={{ opacity:0.7, fontSize:13 }}>Recommended Department:</span>
                      <span style={{ fontWeight:700, fontSize:15, color: urgencyStyle.text }}>🏥 {hyperResult.department}</span>
                    </div>
                    <p style={{ fontSize:13, opacity:0.85, lineHeight:1.6, margin:0 }}>
                      <strong>Clinical Reasoning:</strong> {hyperResult.reasoning}
                    </p>
                  </div>

                  {/* Doctor Selection */}
                  <div style={{ marginBottom:16 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                      <h4 style={{ margin:0, fontSize:14 }}>👨‍⚕️ Doctor Assignment</h4>
                      <span style={{ fontSize:11, opacity:0.6, background:'#2ecc7122', border:'1px solid #2ecc7144', borderRadius:6, padding:'2px 8px', color:'#2ecc71' }}>
                        ✏️ Human Override Enabled
                      </span>
                    </div>

                    {hyperResult.doctors.length === 0 ? (
                      <div style={{ opacity:0.6, padding:'1rem', textAlign:'center' }}>No active doctors available in {hyperResult.department}</div>
                    ) : (
                      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                        {hyperResult.doctors.map((doc, idx) => (
                          <label
                            key={doc.doctor_id}
                            style={{
                              display:'flex', alignItems:'center', gap:12, padding:'10px 14px',
                              borderRadius:10, cursor:'pointer',
                              background: String(selectedDoctorId) === String(doc.doctor_id) ? urgencyStyle.bg : 'rgba(255,255,255,0.04)',
                              border: `1.5px solid ${String(selectedDoctorId) === String(doc.doctor_id) ? urgencyStyle.border : 'rgba(255,255,255,0.12)'}`,
                              transition:'all 0.2s'
                            }}
                          >
                            <input
                              type="radio"
                              name="doctor_select"
                              value={doc.doctor_id}
                              checked={String(selectedDoctorId) === String(doc.doctor_id)}
                              onChange={() => setSelectedDoctorId(doc.doctor_id)}
                              style={{ accentColor: urgencyStyle.border }}
                            />
                            <div style={{ flex:1 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                <span style={{ fontWeight:600, fontSize:14 }}>{doc.name}</span>
                                {idx === 0 && <span style={{ fontSize:10, background:'#2ecc71', color:'#fff', borderRadius:4, padding:'1px 6px', fontWeight:700 }}>⭐ RECOMMENDED</span>}
                              </div>
                              <div style={{ fontSize:12, opacity:0.65, marginTop:2 }}>
                                {doc.department} · {doc.experience_years} yrs exp · {doc.patients} current patients
                              </div>
                            </div>
                            <span style={{ fontSize:12, opacity:0.5 }}>Rank #{doc.rank}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {hyperError && <div style={{ background:'#e74c3c22', border:'1px solid #e74c3c', borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:13, color:'#e74c3c' }}>{hyperError}</div>}

                  <div className="form-actions">
                    <button type="button" className="btn-cancel" onClick={() => setHyperStep(1)}>← Edit Info</button>
                    <button
                      onClick={handleHyperConfirm}
                      disabled={confirmLoading || !selectedDoctorId}
                      style={{
                        background: (confirmLoading || !selectedDoctorId) ? '#555' : `linear-gradient(135deg, ${urgencyStyle.border}, ${urgencyStyle.border}cc)`,
                        color:'#fff', border:'none', borderRadius:8, padding:'10px 22px',
                        fontWeight:700, cursor:(confirmLoading || !selectedDoctorId) ? 'not-allowed' : 'pointer', fontSize:13
                      }}
                    >
                      {confirmLoading ? '⏳ Confirming...' : '✅ Confirm Assignment'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── ADD DOCTOR MODAL ──────────────────────────────────────────────── */}
      {showAddDoctor && (
        <div className="modal-overlay" onClick={() => setShowAddDoctor(false)}>
          <div className="modal-content glass-effect" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add New Doctor</h3>
              <button className="close-modal" onClick={() => setShowAddDoctor(false)}>×</button>
            </div>
            <form onSubmit={handleAddDoctor} className="patient-form">
              <div className="form-group">
                <label>Doctor Name *</label>
                <input type="text" name="name" value={doctorForm.name} onChange={handleDoctorFormChange} placeholder="e.g. Dr. Rahul Sharma" required />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Department *</label>
                  <select name="department" value={doctorForm.department} onChange={handleDoctorFormChange} required>
                    <option value="">Select Department</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Experience (years) *</label>
                  <input type="number" name="experience_years" value={doctorForm.experience_years} onChange={handleDoctorFormChange} placeholder="e.g. 5" min={0} required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Shift *</label>
                  <select name="shift" value={doctorForm.shift} onChange={handleDoctorFormChange} required>
                    <option value="morning">Morning (8AM - 1PM)</option>
                    <option value="afternoon">Evening (3PM - 8PM)</option>
                    <option value="night">Night</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Status *</label>
                  <select name="status" value={doctorForm.status} onChange={handleDoctorFormChange} required>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowAddDoctor(false)}>Cancel</button>
                <button type="submit" className="btn-submit">Add Doctor</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── ADD PATIENT MODAL ────────────────────────────────────────────── */}
      {showAddPatient && (
        <div className="modal-overlay" onClick={() => setShowAddPatient(false)}>
          <div className="modal-content glass-effect" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add New Patient</h3>
              <button className="close-modal" onClick={() => setShowAddPatient(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit} className="patient-form">
              <div className="form-row">
                <div className="form-group"><label>Patient Name *</label><input type="text" name="name" value={formData.name} onChange={handleInputChange} placeholder="Enter full name" required /></div>
                <div className="form-group"><label>Age *</label><input type="number" name="age" value={formData.age} onChange={handleInputChange} placeholder="Age" required /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Gender *</label><select name="gender" value={formData.gender} onChange={handleInputChange} required><option value="">Select</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></select></div>
                <div className="form-group"><label>Disability *</label><select name="disability" value={formData.disability} onChange={handleInputChange} required><option value="">Select option</option><option value="Yes">Yes</option><option value="No">No</option></select></div>
              </div>
              <div className="form-group"><label>Contact Number *</label><input type="text" name="contact" value={formData.contact} onChange={handleInputChange} placeholder="10 digit number" maxLength={10} inputMode="numeric" pattern="[0-9]{10}" required /></div>
              <div className="form-row">
                <div className="form-group"><label>Department *</label><select name="department" value={formData.department} onChange={handleInputChange} required><option value="">Select Department</option>{departments.map(dept => <option key={dept} value={dept}>{dept}</option>)}</select></div>
                <div className="form-group"><label>Appointment Type *</label><select name="appointmentType" value={formData.appointmentType} onChange={handleInputChange} required><option value="">Select Type</option><option value="emergency">Emergency</option><option value="routine">Routine</option><option value="followup">Follow-up</option></select></div>
              </div>
              <div className="form-group"><label>Problem / Reason *</label><input type="text" name="problem" value={formData.problem} onChange={handleInputChange} placeholder="Enter problem or reason for visit" required /></div>
              <div className="form-row">
                <div className="form-group"><label>Appointment Time *</label><input type="time" name="time" value={formData.time} onChange={handleInputChange} required /></div>
                <div className="form-group"><label>Shift *</label><select name="shift" value={formData.shift} onChange={handleInputChange} required><option value="first">First Shift</option><option value="second">Second Shift</option></select></div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowAddPatient(false)}>Cancel</button>
                <button type="submit" className="btn-submit">Add Patient</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── PATIENT DETAILS MODAL ────────────────────────────────────────── */}
      {selectedPatient && (
        <div className="modal-overlay" onClick={() => setSelectedPatient(null)}>
          <div className="modal-content glass-effect patient-details-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Patient #{selectedPatient.id} — {selectedPatient.name}</h3>
              <button className="close-modal" onClick={() => setSelectedPatient(null)}>×</button>
            </div>
            <div className="patient-details-content">
              <div className="detail-section">
                <h4>Patient Information</h4>
                {[
                  ['Name', selectedPatient.name], ['Age', selectedPatient.age], ['Gender', selectedPatient.gender],
                  ['Contact', '+91 ' + selectedPatient.contact], ['Disability', selectedPatient.disability],
                  ['Doctor', selectedPatient.doctor || '—'], ['Department', selectedPatient.department],
                  ['Problem', selectedPatient.problem], ['Waiting Time', selectedPatient.waiting_time + ' min'],
                ].map(([label, value]) => (
                  <div className="detail-row" key={label}>
                    <span className="detail-label">{label}:</span>
                    <span className="detail-value">{value}</span>
                  </div>
                ))}
                {selectedPatient.priority_score > 0 && <div className="detail-row"><span className="detail-label">Priority Score:</span><span className="detail-value">{Number(selectedPatient.priority_score).toFixed(2)}</span></div>}
                {selectedPatient.predicted_service_time > 0 && <div className="detail-row"><span className="detail-label">Est. Service Time:</span><span className="detail-value">{Number(selectedPatient.predicted_service_time).toFixed(0)} min</span></div>}
              </div>
              <div className="detail-section editable-section">
                <h4>Appointment Details (Editable)</h4>
                <div className="form-group"><label>Appointment Type *</label><select name="appointmentType" value={editData.appointmentType} onChange={handleEditChange} required><option value="emergency">Emergency</option><option value="routine">Routine</option><option value="followup">Follow-up</option></select></div>
                <div className="form-group"><label>Department *</label><select name="department" value={editData.department} onChange={handleEditChange} required>{departments.map(dept => <option key={dept} value={dept}>{dept}</option>)}</select></div>
                <div className="form-group"><label>Problem / Reason *</label><input type="text" name="problem" value={editData.problem} onChange={handleEditChange} required /></div>
                <div className="form-group"><label>Disability *</label><select name="disability" value={editData.disability} onChange={handleEditChange} required><option value="Yes">Yes</option><option value="No">No</option></select></div>
                <div className="form-group"><label>Shift *</label><select name="shift" value={editData.shift} onChange={handleEditChange} required><option value="first">First Shift</option><option value="second">Second Shift</option></select></div>
                <div className="form-group"><label>Arrival Status *</label><select name="arrivalStatus" value={editData.arrivalStatus} onChange={handleEditChange} className="arrival-status-select" required><option value="on-time">On-Time</option><option value="late">Late</option><option value="reschedule">Reschedule</option></select></div>
              </div>
              <div className="detail-actions">
                <button className="btn-delete" onClick={handleDeletePatient}>Cancel Appointment</button>
                <button className="btn-submit" onClick={handleUpdateAppointment}>Save Appointment</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pulse animation for emergency button */}
      <style>{`
        @keyframes pulse-red {
          0%, 100% { box-shadow: 0 0 16px #ff000066; }
          50%       { box-shadow: 0 0 28px #ff0000aa, 0 0 8px #ff000044; }
        }
      `}</style>
    </div>
  );
};

export default MockHIS;