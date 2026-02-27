import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageLayout from './layout/PageLayout';
import Card from './common/Card';
import Button from './common/Button';
import { useToast } from './common/Toast';
import '../App.css';


/**
 * DoctorRegister — Admin registers a new doctor on the blockchain.
 * Uses glassmorphic card form with toast notifications.
 */
export const DoctorRegister = ({ getSignedContracts }) => {
  const [doctorId, setDoctorId] = useState('');
  const [doctorUsername, setDoctorUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const registerDoctor = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { doctorContract } = await getSignedContracts();
      const tx = await doctorContract.registerDoctor(doctorId, doctorUsername, 'Doctor');
      toast.info('Transaction submitted — waiting for confirmation...');
      await tx.wait();
      toast.success('Doctor registered successfully!');
      setDoctorId('');
      setDoctorUsername('');
    } catch (err) {
      toast.error(err.message || 'Error registering doctor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageLayout
      title="Register Doctor"
      role="admin"
      showBack
      backPath="/admin"
      backLabel="Admin Dashboard"
    >
      <div className="max-w-md mx-auto">
        <Card accent>
          <div className="text-center mb-6">
            <div
              className="inline-flex items-center justify-center w-16 h-16 rounded-lg mb-4"
              style={{ background: 'var(--color-info-bg)', border: '1px solid rgba(59, 130, 246, 0.2)' }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-info)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
            </div>
            <h2 className="font-display text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              Register New Doctor
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Add a doctor to the blockchain network
            </p>
          </div>

          <form onSubmit={registerDoctor} className="space-y-4">
            <div className="form-group">
              <label className="form-label">Doctor Name</label>
              <input
                type="text"
                placeholder="Enter doctor's full name"
                value={doctorUsername}
                onChange={(e) => setDoctorUsername(e.target.value)}
                className="form-input"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Wallet Address</label>
              <input
                type="text"
                placeholder="0x..."
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                className="form-input"
                style={{ fontFamily: 'var(--font-mono)' }}
                required
              />
            </div>

            <Button type="submit" variant="primary" fullWidth loading={loading}>
              Register Doctor
            </Button>
          </form>
        </Card>
      </div>
    </PageLayout>
  );
};


/**
 * PatientRegister — Admin registers a new patient on the blockchain.
 */
export const PatientRegister = ({ getSignedContracts }) => {
  const [patientId, setPatientId] = useState('');
  const [patientUsername, setPatientUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const registerPatient = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { patientContract } = await getSignedContracts();
      const tx = await patientContract.registerPatient(patientId, patientUsername, 'Patient');
      toast.info('Transaction submitted — waiting for confirmation...');
      await tx.wait();
      toast.success('Patient registered successfully!');
      setPatientId('');
      setPatientUsername('');
    } catch (err) {
      toast.error(err.message || 'Error registering patient');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageLayout
      title="Register Patient"
      role="admin"
      showBack
      backPath="/admin"
      backLabel="Admin Dashboard"
    >
      <div className="max-w-md mx-auto">
        <Card accent>
          <div className="text-center mb-6">
            <div
              className="inline-flex items-center justify-center w-16 h-16 rounded-lg mb-4"
              style={{ background: 'var(--color-success-bg)', border: '1px solid rgba(34, 197, 94, 0.2)' }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
            </div>
            <h2 className="font-display text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              Register New Patient
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Add a patient to the blockchain network
            </p>
          </div>

          <form onSubmit={registerPatient} className="space-y-4">
            <div className="form-group">
              <label className="form-label">Patient Name</label>
              <input
                type="text"
                placeholder="Enter patient's full name"
                value={patientUsername}
                onChange={(e) => setPatientUsername(e.target.value)}
                className="form-input"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Wallet Address</label>
              <input
                type="text"
                placeholder="0x..."
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                className="form-input"
                style={{ fontFamily: 'var(--font-mono)' }}
                required
              />
            </div>

            <Button type="submit" variant="primary" fullWidth loading={loading}>
              Register Patient
            </Button>
          </form>
        </Card>
      </div>
    </PageLayout>
  );
};


/**
 * Admin Dashboard — Main hub for admin actions.
 * Shows action cards for registering doctors and patients.
 */
export const Admin = () => {
  const navigate = useNavigate();

  const actions = [
    {
      id: 'register-doctor',
      title: 'Register Doctor',
      desc: 'Add a new doctor to the blockchain network',
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-info)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
      ),
      bgColor: 'var(--color-info-bg)',
      borderColor: 'rgba(59, 130, 246, 0.2)',
      onClick: () => navigate('/register-doctor'),
    },
    {
      id: 'register-patient',
      title: 'Register Patient',
      desc: 'Add a new patient to the blockchain network',
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
      bgColor: 'var(--color-success-bg)',
      borderColor: 'rgba(34, 197, 94, 0.2)',
      onClick: () => navigate('/register-patient'),
    },
    {
      id: 'view-audits',
      title: 'View Audit Trail',
      desc: 'Coming soon — immutable access logs',
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      ),
      bgColor: 'rgba(100, 116, 139, 0.1)',
      borderColor: 'rgba(100, 116, 139, 0.2)',
      disabled: true,
    },
  ];

  return (
    <PageLayout
      title="Admin Dashboard"
      role="admin"
      showBack
      backPath="/"
      backLabel="Logout"
    >
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="font-display text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            System Administration
          </h2>
          <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
            Manage users and oversee the medical records network
          </p>
        </div>

        <div className="grid gap-4 stagger-children">
          {actions.map((action) => (
            <button
              key={action.id}
              onClick={action.onClick}
              disabled={action.disabled}
              className={`
                w-full flex items-center gap-5 p-5
                glass rounded-lg text-left
                transition-all duration-250
                ${action.disabled
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover-lift hover-glow cursor-pointer'
                }
              `}
              style={{ outline: 'none' }}
            >
              <div
                className="flex-shrink-0 w-14 h-14 rounded-lg flex items-center justify-center"
                style={{ background: action.bgColor, border: `1px solid ${action.borderColor}` }}
              >
                {action.icon}
              </div>
              <div className="flex-1">
                <h3 className="font-display text-base font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>
                  {action.title}
                </h3>
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  {action.desc}
                </p>
              </div>
              {!action.disabled && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>
    </PageLayout>
  );
};