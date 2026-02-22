import React, { useState, useEffect } from 'react';
import '../styles/CardiologyDepartment.css';

const NeurologyDepartment = ({ onBack }) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedShift, setSelectedShift] = useState('first');
  const [showAllAppointments, setShowAllAppointments] = useState(false);
  const [showActiveDoctors, setShowActiveDoctors] = useState(false);
  const [showAddDoctorForm, setShowAddDoctorForm] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [statusChanges, setStatusChanges] = useState([]);
  const [selectedStatusChange, setSelectedStatusChange] = useState(null);
  const [showReasonField, setShowReasonField] = useState(false);
  const [changeReason, setChangeReason] = useState('');

  // Toggle hide karne ke liye useEffect
  useEffect(() => {
    const toggle = document.querySelector('.toggleContainer');
    if (toggle) {
      toggle.style.display = 'none';
    }
    return () => {
      if (toggle) {
        toggle.style.display = 'flex';
      }
    };
  }, []);

  // Department Stats
  const [stats, setStats] = useState({
    totalAppointments: 12,
    emergencyCases: 3,
    avgWaitTime: 28,
    activeDoctors: 2
  });

  const [todayStats, setTodayStats] = useState({
    completed: 5,
    inProgress: 2,
    waiting: 4,
    cancelled: 1
  });

  // Doctors List
  const [doctors, setDoctors] = useState([
    {
      id: 1,
      name: 'Dr. Anil Patel',
      degree: 'DM (Neurology), MD, MBBS',
      department: 'Neurology',
      experience: 18,
      status: 'active',
      shift: 'first',
      currentPatients: ['P201', 'P202'],
      todayAppointments: 8,
      nextAvailable: '15:00'
    },
    {
      id: 2,
      name: 'Dr. Sunita Singh',
      degree: 'MD (Neurology), MBBS',
      department: 'Neurology',
      experience: 12,
      status: 'active',
      shift: 'first',
      currentPatients: ['P203'],
      todayAppointments: 4,
      nextAvailable: '14:15'
    }
  ]);

  // All Patients Data
  const [patients, setPatients] = useState([
    {
      id: 'P201',
      name: 'Vikram Malhotra',
      age: 55,
      gender: 'Male',
      contact: '+91 9876543220',
      department: 'Neurology',
      problem: 'Severe headaches and dizziness',
      appointmentType: 'Emergency',
      shift: 'first',
      arrivalTime: '09:00 AM',
      arrivalStatus: 'On-Time',
      priority: 1,
      assignedDoctor: 1,
      status: 'in-progress'
    },
    {
      id: 'P202',
      name: 'Anjali Desai',
      age: 42,
      gender: 'Female',
      contact: '+91 9876543221',
      department: 'Neurology',
      problem: 'Migraine follow-up',
      appointmentType: 'Follow-up',
      shift: 'first',
      arrivalTime: '09:45 AM',
      arrivalStatus: 'On-Time',
      priority: 3,
      assignedDoctor: 1,
      status: 'waiting'
    },
    {
      id: 'P203',
      name: 'Rahul Kapoor',
      age: 35,
      gender: 'Male',
      contact: '+91 9876543222',
      department: 'Neurology',
      problem: 'Memory loss concerns',
      appointmentType: 'Routine',
      shift: 'first',
      arrivalTime: '10:30 AM',
      arrivalStatus: 'Late',
      priority: 2,
      assignedDoctor: 2,
      status: 'waiting'
    }
  ]);

  // Equipment Status
  const [equipment] = useState([
    { id: 1, name: 'MRI Scanner', room: 'Room 201', status: 'in-use' },
    { id: 2, name: 'EEG Machine', room: 'Room 202', status: 'available' },
    { id: 3, name: 'CT Scanner', room: 'Room 203', status: 'available' },
    { id: 4, name: 'EMG Equipment', room: 'Room 204', status: 'available' }
  ]);

  // New Doctor Form State
  const [newDoctor, setNewDoctor] = useState({
    name: '',
    degree: '',
    department: 'Neurology',
    experience: '',
    status: 'active',
    shift: 'first'
  });

  // Clock Update
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-assign patients when doctor becomes inactive
  useEffect(() => {
    redistributePatients();
  }, [doctors]);

  const redistributePatients = () => {
    const activeDoctors = doctors.filter(d => d.status === 'active');
    
    if (activeDoctors.length === 0) {
      setStats(prev => ({ ...prev, activeDoctors: 0 }));
      return;
    }

    setPatients(prevPatients => {
      const allPatients = [...prevPatients];
      const sortedPatients = allPatients.sort((a, b) => a.priority - b.priority);
      const redistributedPatients = sortedPatients.map((patient, index) => {
        const doctorIndex = index % activeDoctors.length;
        return { ...patient, assignedDoctor: activeDoctors[doctorIndex].id };
      });
      
      return redistributedPatients;
    });

    setStats(prev => ({ ...prev, activeDoctors: activeDoctors.length }));
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const handleCompleteCheckup = (patientId) => {
    setPatients(patients.filter(p => p.id !== patientId));
    setTodayStats(prev => ({
      ...prev,
      completed: prev.completed + 1,
      inProgress: prev.inProgress - 1
    }));
    setSelectedPatient(null);
  };

  const handleCancelAppointment = (patientId) => {
    setPatients(patients.filter(p => p.id !== patientId));
    setTodayStats(prev => ({
      ...prev,
      cancelled: prev.cancelled + 1,
      waiting: prev.waiting - 1
    }));
    setEditingAppointment(null);
    setShowReasonField(false);
    setChangeReason('');
  };

  const handleArrivalStatusChange = (newStatus) => {
    if (newStatus === 'Change Shift' || newStatus === 'Reschedule' || newStatus === 'Late') {
      setShowReasonField(true);
    } else {
      setShowReasonField(false);
      setChangeReason('');
    }
    setEditingAppointment({ ...editingAppointment, arrivalStatus: newStatus });
  };

  const handleEditAppointment = (patient) => {
    setShowAllAppointments(false);
    setEditingAppointment(patient);
    setShowReasonField(patient.arrivalStatus === 'Change Shift' || patient.arrivalStatus === 'Reschedule' || patient.arrivalStatus === 'Late');
    setChangeReason('');
  };

  const handleSaveAppointment = (updatedPatient) => {
    if ((updatedPatient.arrivalStatus === 'Change Shift' || updatedPatient.arrivalStatus === 'Reschedule' || updatedPatient.arrivalStatus === 'Late') && changeReason.trim()) {
      if (updatedPatient.arrivalStatus === 'Change Shift') {
        updatedPatient.shift = updatedPatient.shift === 'first' ? 'second' : 'first';
      }

      const statusChangeRecord = {
        id: Date.now(),
        patientId: updatedPatient.id,
        patientName: updatedPatient.name,
        patientAge: updatedPatient.age,
        patientGender: updatedPatient.gender,
        patientContact: updatedPatient.contact,
        patientProblem: updatedPatient.problem,
        arrivalStatus: updatedPatient.arrivalStatus,
        arrivalTime: updatedPatient.arrivalStatus === 'Reschedule' ? updatedPatient.arrivalTime : undefined,
        reason: changeReason,
        timestamp: new Date().toLocaleString('en-IN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        })
      };

      setStatusChanges(prev => [statusChangeRecord, ...prev]);
    }

    const updatedPatients = patients.map(p =>
      p.id === updatedPatient.id ? updatedPatient : p
    );
    setPatients(updatedPatients);
    setEditingAppointment(null);
    setShowReasonField(false);
    setChangeReason('');
  };

  const handleAddDoctor = (e) => {
    e.preventDefault();
    const doctor = {
      id: doctors.length + 1,
      ...newDoctor,
      currentPatients: [],
      todayAppointments: 0,
      nextAvailable: 'Available Now'
    };
    setDoctors([...doctors, doctor]);
    setShowAddDoctorForm(false);
    setNewDoctor({
      name: '',
      degree: '',
      department: 'Neurology',
      experience: '',
      status: 'active',
      shift: 'first'
    });
  };

  const toggleDoctorStatus = (doctorId) => {
    setDoctors(doctors.map(d =>
      d.id === doctorId ? { ...d, status: d.status === 'active' ? 'inactive' : 'active' } : d
    ));
  };

  const getPatientsByShift = (shift) => {
    return patients.filter(p => p.shift === shift);
  };

  const getPatientsByDoctor = (doctorId) => {
    return patients
      .filter(p => p.assignedDoctor === doctorId && p.status !== 'completed')
      .sort((a, b) => a.priority - b.priority);
  };

  return (
    <div className="cardiology-container">
      {/* Header */}
      <div className="cardio-header">
        <button className="back-btn" onClick={onBack}>
          ← Back to Dashboard
        </button>
        <div className="header-center">
          <h1 className="dept-heading">Neurology Department</h1>
        </div>
        <div className="header-time">
          <div className="time-display">{formatTime(currentTime)}</div>
        </div>
      </div>

      {/* Stats Cards - 4 Boxes */}
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
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 8v4M12 16h.01"/>
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
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
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
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
            </svg>
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.activeDoctors}</div>
            <div className="stat-label">Active Doctors</div>
          </div>
        </div>
      </div>

      {/* Today's Summary */}
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

      {/* Arrival Status Changes Dashboard */}
      {statusChanges.length > 0 && (
        <div className="status-changes-section">
          <h2 className="section-title">
            <span className="status-change-icon">📋</span>
            Arrival Status Changes
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
                {statusChanges.map((change) => (
                  <tr 
                    key={change.id}
                    onClick={() => setSelectedStatusChange(change)}
                    className="clickable-row"
                  >
                    <td className="status-patient-id">{change.patientId}</td>
                    <td className={`status-badge-cell ${change.arrivalStatus.toLowerCase().replace(' ', '-')}`}>
                      <span className="status-badge">{change.arrivalStatus}</span>
                    </td>
                    {statusChanges.some(sc => sc.arrivalTime) && (
                      <td className="arrival-time-cell">
                        {change.arrivalTime || '-'}
                      </td>
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

      {/* Doctor Section */}
      <div className="doctor-section-wrapper">
        <div className="section-header">
          <h2 className="section-title">Doctor Section</h2>
          <div className="shift-selector">
            <button
              className={`shift-btn ${selectedShift === 'first' ? 'active' : ''}`}
              onClick={() => setSelectedShift('first')}
            >
              First Shift
            </button>
            <button
              className={`shift-btn ${selectedShift === 'second' ? 'active' : ''}`}
              onClick={() => setSelectedShift('second')}
            >
              Second Shift
            </button>
          </div>
        </div>

        {doctors
          .filter(d => d.shift === selectedShift)
          .map(doctor => (
            <div key={doctor.id} className={`doctor-full-card ${doctor.status}`}>
              <div className="doctor-card-header">
                <div className="doctor-info-main">
                  <div className="doctor-name-section">
                    <h3 className="doctor-name">{doctor.name}</h3>
                    <p className="doctor-degree">{doctor.degree}</p>
                  </div>
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
                  <h4 className="queue-title">Patient Queue</h4>
                  <div className="queue-list">
                    {getPatientsByDoctor(doctor.id).length === 0 ? (
                      <div className="no-patients">No patients in queue</div>
                    ) : (
                      getPatientsByDoctor(doctor.id).map(patient => (
                        <div
                          key={patient.id}
                          className="queue-patient-item"
                          onClick={() => setSelectedPatient(patient)}
                        >
                          <div className="patient-basic-info">
                            <span className="patient-id">{patient.id}</span>
                            <span className="patient-name">{patient.name}</span>
                            <span className={`appointment-type-badge ${patient.appointmentType.toLowerCase()}`}>
                              {patient.appointmentType}
                            </span>
                          </div>
                          <div className="patient-problem-text">{patient.problem}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
              
              <div className="doctor-actions">
                <button
                  className={`status-toggle-btn ${doctor.status}`}
                  onClick={() => toggleDoctorStatus(doctor.id)}
                >
                  {doctor.status === 'active' ? 'Mark as Inactive' : 'Mark as Active'}
                </button>
              </div>
            </div>
          ))}
      </div>

      {/* Add Doctor Section */}
      <div className="add-doctor-section">
        <button className="add-doctor-btn" onClick={() => setShowAddDoctorForm(true)}>
          + Add Doctor
        </button>
      </div>

      {/* Equipment Status */}
      <div className="equipment-section">
        <h2 className="section-title">Equipment Status</h2>
        <div className="equipment-grid">
          {equipment.map(item => (
            <div key={item.id} className="equipment-item">
              <div className={`equipment-status-indicator ${item.status}`}>
                {item.status === 'available' ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="12" r="8"/>
                  </svg>
                )}
              </div>
              <div className="equipment-details">
                <div className="equipment-name">{item.name}</div>
                <div className="equipment-room">{item.room}</div>
                <div className={`equipment-status-text ${item.status}`}>
                  {item.status.toUpperCase()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Edit Appointment Modal */}
      {editingAppointment && (
        <div className="modal-overlay" onClick={() => setEditingAppointment(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Patient {editingAppointment.id} Details</h2>
              <button className="close-modal-btn" onClick={() => setEditingAppointment(null)}>
                ✕
              </button>
            </div>
            <div className="edit-appointment-form">
              <div className="form-section">
                <h3>Patient Information</h3>
                <div className="info-grid">
                  <div className="info-item">
                    <label>Name:</label>
                    <span>{editingAppointment.name}</span>
                  </div>
                  <div className="info-item">
                    <label>Age:</label>
                    <span>{editingAppointment.age}</span>
                  </div>
                  <div className="info-item">
                    <label>Gender:</label>
                    <span>{editingAppointment.gender}</span>
                  </div>
                  <div className="info-item">
                    <label>Contact:</label>
                    <span>{editingAppointment.contact}</span>
                  </div>
                </div>
              </div>

              <div className="form-section">
                <h3>Appointment Details (Editable)</h3>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Department *</label>
                    <select
                      value={editingAppointment.department}
                      onChange={(e) =>
                        setEditingAppointment({ ...editingAppointment, department: e.target.value })
                      }
                    >
                      <option>Neurology</option>
                      <option>Cardiology</option>
                      <option>Orthopedics</option>
                      <option>General Medicine</option>
                      <option>Pediatrics</option>
                      <option>Dermatology</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Problem/Reason *</label>
                    <input
                      type="text"
                      value={editingAppointment.problem}
                      onChange={(e) =>
                        setEditingAppointment({ ...editingAppointment, problem: e.target.value })
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label>Appointment Type *</label>
                    <select
                      value={editingAppointment.appointmentType}
                      onChange={(e) =>
                        setEditingAppointment({ ...editingAppointment, appointmentType: e.target.value })
                      }
                    >
                      <option>Emergency</option>
                      <option>Routine</option>
                      <option>Follow-up</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Arrival Time *</label>
                    <input
                      type="time"
                      value={(() => {
                        if (!editingAppointment.arrivalTime) return '';
                        const timeStr = editingAppointment.arrivalTime.trim();
                        const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
                        if (!match) return '';
                        
                        let hours = parseInt(match[1]);
                        const minutes = match[2];
                        const period = match[3].toUpperCase();
                        
                        if (period === 'PM' && hours !== 12) {
                          hours += 12;
                        } else if (period === 'AM' && hours === 12) {
                          hours = 0;
                        }
                        
                        return `${hours.toString().padStart(2, '0')}:${minutes}`;
                      })()}
                      onChange={(e) => {
                        const timeValue = e.target.value;
                        if (!timeValue) return;
                        
                        const [hours24, minutes] = timeValue.split(':');
                        let hours = parseInt(hours24);
                        
                        const ampm = hours >= 12 ? 'PM' : 'AM';
                        const displayHour = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
                        const formattedTime = `${displayHour.toString().padStart(2, '0')}:${minutes} ${ampm}`;
                        
                        setEditingAppointment({ ...editingAppointment, arrivalTime: formattedTime });
                      }}
                      className="time-picker-input"
                    />
                  </div>

                  <div className="form-group full-width">
                    <label>Arrival Status *</label>
                    <select
                      value={editingAppointment.arrivalStatus}
                      onChange={(e) => handleArrivalStatusChange(e.target.value)}
                    >
                      <option>On-Time</option>
                      <option>Late</option>
                      <option>Reschedule</option>
                      <option>Change Shift</option>
                    </select>
                  </div>

                  {showReasonField && (
                    <div className="form-group full-width reason-field-container">
                      <label>Reason for {editingAppointment.arrivalStatus} *</label>
                      <textarea
                        className="reason-textarea-inline"
                        rows="3"
                        placeholder="Enter reason for status change..."
                        value={changeReason}
                        onChange={(e) => setChangeReason(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="form-actions">
                <button
                  className="btn-cancel-appointment"
                  onClick={() => handleCancelAppointment(editingAppointment.id)}
                >
                  Cancel Appointment
                </button>
                <button
                  className="btn-save-appointment"
                  onClick={() => handleSaveAppointment(editingAppointment)}
                  disabled={showReasonField && !changeReason.trim()}
                >
                  Save Appointment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status Change Details Modal */}
      {selectedStatusChange && (
        <div className="modal-overlay" onClick={() => setSelectedStatusChange(null)}>
          <div className="modal-content small" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Patient Details - {selectedStatusChange.patientId}</h2>
              <button className="close-modal-btn" onClick={() => setSelectedStatusChange(null)}>
                ✕
              </button>
            </div>
            <div className="patient-details-content">
              <div className="detail-row">
                <span className="detail-label">Patient ID:</span>
                <span className="detail-value">{selectedStatusChange.patientId}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Name:</span>
                <span className="detail-value">{selectedStatusChange.patientName}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Age:</span>
                <span className="detail-value">{selectedStatusChange.patientAge}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Gender:</span>
                <span className="detail-value">{selectedStatusChange.patientGender}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Contact:</span>
                <span className="detail-value">{selectedStatusChange.patientContact}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Problem:</span>
                <span className="detail-value">{selectedStatusChange.patientProblem}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Arrival Status:</span>
                <span className={`detail-value status-badge ${selectedStatusChange.arrivalStatus.toLowerCase().replace(' ', '-')}`}>
                  {selectedStatusChange.arrivalStatus}
                </span>
              </div>
              {selectedStatusChange.arrivalTime && (
                <div className="detail-row">
                  <span className="detail-label">Arrival Time:</span>
                  <span className="detail-value">{selectedStatusChange.arrivalTime}</span>
                </div>
              )}
              <div className="detail-row">
                <span className="detail-label">Reason:</span>
                <span className="detail-value">{selectedStatusChange.reason}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Changed At:</span>
                <span className="detail-value">{selectedStatusChange.timestamp}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* All Appointments Modal */}
      {showAllAppointments && (
        <div className="modal-overlay" onClick={() => setShowAllAppointments(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>All Appointments</h2>
              <button className="close-modal-btn" onClick={() => setShowAllAppointments(false)}>
                ✕
              </button>
            </div>

            <div className="appointments-tabs">
              <h3>First Shift</h3>
              <div className="appointments-list">
                {getPatientsByShift('first').map(patient => (
                  <div
                    key={patient.id}
                    className="appointment-card"
                    onClick={() => handleEditAppointment(patient)}
                  >
                    <div className="appointment-header-row">
                      <span className="appointment-id">{patient.id}</span>
                      <span className={`appointment-status-badge ${patient.status}`}>
                        {patient.status}
                      </span>
                    </div>
                    <div className="appointment-patient-name">{patient.name}</div>
                    <div className="appointment-detail-row">
                      <span>Age: {patient.age}</span>
                      <span>Type: {patient.appointmentType}</span>
                    </div>
                  </div>
                ))}
              </div>

              <h3 className="shift-divider">Second Shift</h3>
              <div className="appointments-list">
                {getPatientsByShift('second').map(patient => (
                  <div
                    key={patient.id}
                    className="appointment-card"
                    onClick={() => handleEditAppointment(patient)}
                  >
                    <div className="appointment-header-row">
                      <span className="appointment-id">{patient.id}</span>
                      <span className={`appointment-status-badge ${patient.status}`}>
                        {patient.status}
                      </span>
                    </div>
                    <div className="appointment-patient-name">{patient.name}</div>
                    <div className="appointment-detail-row">
                      <span>Age: {patient.age}</span>
                      <span>Type: {patient.appointmentType}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Doctors Modal */}
      {showActiveDoctors && (
        <div className="modal-overlay" onClick={() => setShowActiveDoctors(false)}>
          <div className="modal-content small" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Active Doctors</h2>
              <button className="close-modal-btn" onClick={() => setShowActiveDoctors(false)}>
                ✕
              </button>
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

      {/* Patient Details Modal */}
      {selectedPatient && (
        <div className="modal-overlay" onClick={() => setSelectedPatient(null)}>
          <div className="modal-content small" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Patient Details</h2>
              <button className="close-modal-btn" onClick={() => setSelectedPatient(null)}>
                ✕
              </button>
            </div>
            <div className="patient-details-content">
              <div className="detail-row">
                <span className="detail-label">ID:</span>
                <span className="detail-value">{selectedPatient.id}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Name:</span>
                <span className="detail-value">{selectedPatient.name}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Age:</span>
                <span className="detail-value">{selectedPatient.age}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Problem:</span>
                <span className="detail-value">{selectedPatient.problem}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Appointment Type:</span>
                <span className="detail-value">{selectedPatient.appointmentType}</span>
              </div>
              <div className="modal-actions">
                <button
                  className="btn-complete"
                  onClick={() => handleCompleteCheckup(selectedPatient.id)}
                >
                  Complete Checkup
                </button>
                <button className="btn-override">Override</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Doctor Modal */}
      {showAddDoctorForm && (
        <div className="modal-overlay" onClick={() => setShowAddDoctorForm(false)}>
          <div className="modal-content small" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add New Doctor</h2>
              <button className="close-modal-btn" onClick={() => setShowAddDoctorForm(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleAddDoctor} className="add-doctor-form">
              <div className="form-group">
                <label>Doctor Name *</label>
                <input
                  type="text"
                  required
                  value={newDoctor.name}
                  onChange={(e) => setNewDoctor({ ...newDoctor, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Degree *</label>
                <input
                  type="text"
                  required
                  value={newDoctor.degree}
                  onChange={(e) => setNewDoctor({ ...newDoctor, degree: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Department *</label>
                <select
                  value={newDoctor.department}
                  onChange={(e) => setNewDoctor({ ...newDoctor, department: e.target.value })}
                >
                  <option>Neurology</option>
                </select>
              </div>

              <div className="form-group">
                <label>Experience (Years) *</label>
                <input
                  type="number"
                  required
                  value={newDoctor.experience}
                  onChange={(e) => setNewDoctor({ ...newDoctor, experience: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Status *</label>
                <select
                  value={newDoctor.status}
                  onChange={(e) => setNewDoctor({ ...newDoctor, status: e.target.value })}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="form-group">
                <label>Shift *</label>
                <select
                  value={newDoctor.shift}
                  onChange={(e) => setNewDoctor({ ...newDoctor, shift: e.target.value })}
                >
                  <option value="first">First</option>
                  <option value="second">Second</option>
                </select>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowAddDoctorForm(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-add">
                  Add Doctor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default NeurologyDepartment;