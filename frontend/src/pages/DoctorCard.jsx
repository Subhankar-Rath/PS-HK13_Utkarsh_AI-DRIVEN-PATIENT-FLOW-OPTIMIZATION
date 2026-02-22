import React, { useState, useEffect } from 'react';
import '../styles/DoctorCard.css';

const DoctorCard = ({ onBack }) => {
  const [showAddDoctorModal, setShowAddDoctorModal] = useState(false);
  const [showDoctorDetails, setShowDoctorDetails] = useState(null);
  const [selectedDept, setSelectedDept] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    degree: '',
    dept: '',
    experience: '',
    status: 'active'
  });

  // Toggle hide karne ke liye useEffect
  useEffect(() => {
    const toggle = document.querySelector('.toggleContainer');
    if (toggle) {
      toggle.style.display = 'none';
    }
    // Cleanup: jab component unmount ho to wapas dikhao
    return () => {
      if (toggle) {
        toggle.style.display = 'flex';
      }
    };
  }, []);

  const [doctorsData, setDoctorsData] = useState({
    cardiology: [
      {
        id: 1,
        name: "Dr. Rajesh Kumar",
        degree: "MD, DM (Cardiology)",
        dept: "Cardiology",
        experience: 15,
        status: "active"
      },
      {
        id: 2,
        name: "Dr. Priya Sharma",
        degree: "MBBS, MD (Cardiology)",
        dept: "Cardiology",
        experience: 12,
        status: "inactive"
      }
    ],
    orthopedics: [
      {
        id: 3,
        name: "Dr. Amit Verma",
        degree: "MBBS, MS (Orthopedics)",
        dept: "Orthopedics",
        experience: 10,
        status: "active"
      }
    ],
    generalMedicine: [
      {
        id: 4,
        name: "Dr. Sunita Rao",
        degree: "MBBS, MD (General Medicine)",
        dept: "General Medicine",
        experience: 8,
        status: "active"
      }
    ],
    pediatrics: [
      {
        id: 5,
        name: "Dr. Anil Gupta",
        degree: "MBBS, MD (Pediatrics)",
        dept: "Pediatrics",
        experience: 14,
        status: "active"
      }
    ],
    dermatology: [
      {
        id: 6,
        name: "Dr. Kavita Singh",
        degree: "MBBS, MD (Dermatology)",
        dept: "Dermatology",
        experience: 9,
        status: "inactive"
      }
    ],
    neurology: [
      {
        id: 7,
        name: "Dr. Vikram Patel",
        degree: "MBBS, DM (Neurology)",
        dept: "Neurology",
        experience: 11,
        status: "active"
      }
    ]
  });

  const departments = [
    { key: 'cardiology', name: 'Cardiology' },
    { key: 'orthopedics', name: 'Orthopedics' },
    { key: 'generalMedicine', name: 'General Medicine' },
    { key: 'pediatrics', name: 'Pediatrics' },
    { key: 'dermatology', name: 'Dermatology' },
    { key: 'neurology', name: 'Neurology' }
  ];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleAddDoctor = (dept) => {
    setSelectedDept(dept);
    setFormData({
      name: '',
      degree: '',
      dept: departments.find(d => d.key === dept)?.name || '',
      experience: '',
      status: 'active'
    });
    setShowAddDoctorModal(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const newDoctor = {
      id: Date.now(),
      name: formData.name,
      degree: formData.degree,
      dept: formData.dept,
      experience: parseInt(formData.experience),
      status: formData.status
    };

    setDoctorsData({
      ...doctorsData,
      [selectedDept]: [...(doctorsData[selectedDept] || []), newDoctor]
    });

    setShowAddDoctorModal(false);
    setFormData({
      name: '',
      degree: '',
      dept: '',
      experience: '',
      status: 'active'
    });
  };

  const handleRemoveDoctor = (deptKey, doctorId) => {
    setDoctorsData({
      ...doctorsData,
      [deptKey]: doctorsData[deptKey].filter(doc => doc.id !== doctorId)
    });
    setShowDoctorDetails(null);
  };

  const handleDoctorClick = (doctor, deptKey) => {
    setShowDoctorDetails({ ...doctor, deptKey });
  };

  const handleToggleStatus = (e) => {
    e.stopPropagation();
    const updatedDoctor = {
      ...showDoctorDetails,
      status: showDoctorDetails.status === 'active' ? 'inactive' : 'active'
    };
    
    // Update in doctorsData
    setDoctorsData({
      ...doctorsData,
      [showDoctorDetails.deptKey]: doctorsData[showDoctorDetails.deptKey].map(doc => 
        doc.id === showDoctorDetails.id ? updatedDoctor : doc
      )
    });
    
    // Update modal display
    setShowDoctorDetails(updatedDoctor);
  };

  return (
    <div className="doctor-card-page">
      {/* Back Button */}
      <button className="back-btn" onClick={onBack}>
        ← Back
      </button>

      <div className="page-header">
        <h1>Doctors Management</h1>
        <p>Manage doctors across all departments</p>
      </div>

      {/* Department Sections */}
      <div className="departments-container">
        {departments.map((dept) => (
          <div key={dept.key} className="dept-section glass-effect">
            <div className="dept-header">
              <h2>{dept.name}</h2>
              <button 
                className="add-doctor-btn"
                onClick={() => handleAddDoctor(dept.key)}
              >
                + Add Doctor
              </button>
            </div>

            <div className="doctors-list">
              {doctorsData[dept.key] && doctorsData[dept.key].length > 0 ? (
                doctorsData[dept.key].map((doctor) => (
                  <div 
                    key={doctor.id} 
                    className="doctor-item glass-effect"
                    onClick={() => handleDoctorClick(doctor, dept.key)}
                  >
                    <span className={`status-light ${doctor.status}`}></span>
                    <div className="doctor-item-info">
                      <h4>{doctor.name}</h4>
                      <p>{doctor.degree}</p>
                      <span className="experience">{doctor.experience} years</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="no-doctors">No doctors available</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add Doctor Modal */}
      {showAddDoctorModal && (
        <div className="modal-overlay" onClick={() => setShowAddDoctorModal(false)}>
          <div className="modal-content glass-effect" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add New Doctor</h3>
              <button 
                className="close-modal"
                onClick={() => setShowAddDoctorModal(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="doctor-form">
              <div className="form-group">
                <label>Doctor Name *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Enter doctor's full name"
                  required
                />
              </div>

              <div className="form-group">
                <label>Degree *</label>
                <input
                  type="text"
                  name="degree"
                  value={formData.degree}
                  onChange={handleInputChange}
                  placeholder="e.g., MBBS, MD"
                  required
                />
              </div>

              <div className="form-group">
                <label>Department *</label>
                <input
                  type="text"
                  name="dept"
                  value={formData.dept}
                  readOnly
                  className="readonly-input"
                />
              </div>

              <div className="form-group">
                <label>Experience (Years) *</label>
                <input
                  type="number"
                  name="experience"
                  value={formData.experience}
                  onChange={handleInputChange}
                  placeholder="Enter years of experience"
                  min="0"
                  required
                />
              </div>

              <div className="form-group">
                <label>Status *</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  required
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="form-actions">
                <button 
                  type="button" 
                  className="btn-cancel"
                  onClick={() => setShowAddDoctorModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-submit">
                  Add Doctor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Doctor Details Modal */}
      {showDoctorDetails && (
        <div className="modal-overlay" onClick={() => setShowDoctorDetails(null)}>
          <div className="modal-content glass-effect doctor-details-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Doctor Details</h3>
              <button 
                className="close-modal"
                onClick={() => setShowDoctorDetails(null)}
              >
                ×
              </button>
            </div>

            <div className="details-content">
              <div className="detail-row">
                <span className="detail-label">Name:</span>
                <span className="detail-value">{showDoctorDetails.name}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Degree:</span>
                <span className="detail-value">{showDoctorDetails.degree}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Department:</span>
                <span className="detail-value">{showDoctorDetails.dept}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Experience:</span>
                <span className="detail-value">{showDoctorDetails.experience} years</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Status:</span>
                <button 
                  className={`status-button ${showDoctorDetails.status}`}
                  onClick={handleToggleStatus}
                >
                  {showDoctorDetails.status === 'active' ? 'Active' : 'Inactive'}
                </button>
              </div>

              <button 
                className="remove-btn"
                onClick={() => handleRemoveDoctor(showDoctorDetails.deptKey, showDoctorDetails.id)}
              >
                Remove Doctor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DoctorCard;