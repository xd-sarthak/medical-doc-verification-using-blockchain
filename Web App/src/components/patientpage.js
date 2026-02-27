import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { viewFile } from '../ipfs';
import PageLayout from './layout/PageLayout';
import Card from './common/Card';
import Button from './common/Button';
import Badge from './common/Badge';
import Modal from './common/Modal';
import EmptyState from './common/EmptyState';
import { useToast } from './common/Toast';
import '../App.css';


/**
 * PatientLogin — Patient authentication page.
 * Dark themed login matching Obsidian Trust aesthetic.
 */
export const PatientLogin = ({ contract }) => {
  const [patientId, setPatientId] = useState('');
  const [patientUsername, setPatientUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const verifyPatient = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const patient = await contract.patients(patientId);
      if (patient.isRegistered) {
        navigate(`/patient-dashboard/${patientId}`);
      } else {
        setError('Invalid patient ID — not registered on the network');
      }
    } catch (err) {
      setError('Error verifying patient credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg" aria-hidden="true">
        <div className="login-bg-orb login-bg-orb--1" />
        <div className="login-bg-orb login-bg-orb--2" />
        <div className="login-grid" />
      </div>

      <div className="login-content animate-fade-in-up" style={{ maxWidth: '420px' }}>
        <div className="login-brand">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-lg mb-4"
            style={{ background: 'var(--color-success-bg)', border: '1px solid rgba(34, 197, 94, 0.3)' }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
            Patient Portal
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Access your medical records securely
          </p>
        </div>

        <Card className="w-full">
          <form onSubmit={verifyPatient} className="space-y-4">
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                type="text"
                placeholder="Enter your name"
                value={patientUsername}
                onChange={(e) => setPatientUsername(e.target.value)}
                className="form-input"
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
              Sign In
            </Button>

            {error && (
              <p className="login-error animate-fade-in">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                {error}
              </p>
            )}
          </form>
        </Card>

        <Button variant="ghost" onClick={() => navigate('/')}>
          ← Back to Login
        </Button>
      </div>
    </div>
  );
};


/**
 * PatientDashboard — Patient's main workspace.
 * Shows patient info, doctor access management with grant/revoke (with
 * confirmation modal), and medical records list.
 * All contract logic is preserved identically.
 */
export const PatientDashboard = ({ doctorContract, patientContract, getSignedContracts }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [doctors, setDoctors] = useState([]);
  const [records, setRecords] = useState([]);
  const [patient, setPatient] = useState();
  const [revokeTarget, setRevokeTarget] = useState(null); // for confirmation modal
  const [loadingAction, setLoadingAction] = useState(null); // doctorId of active action

  useEffect(() => {
    const fetchData = async () => {
      try {
        // get patient data
        const patientInfo = await patientContract.getPatient(id);
        const patientDetails = {
          username: patientInfo[0],
          role: patientInfo[1],
        };
        setPatient(patientDetails);

        // get doctors data
        const doctorIds = await doctorContract.getAllDoctors();
        const doctorsData = await Promise.all(
          doctorIds.map(async (doctorId) => {
            const doctor = await doctorContract.getDoctor(doctorId);

            if (doctor[1] === 'admin') return null;

            const hasAccess = await doctorContract.isAuthorized(doctorId, id);
            return { id: doctorId, name: doctor[0], hasAccess };
          })
        );
        const filteredDoctorsData = doctorsData.filter((data) => data !== null);
        setDoctors(filteredDoctorsData);

        // get records data
        const allRecords = await patientContract.getActiveRecords(id);
        const recordData = await Promise.all(
          allRecords.map(async (record) => {
            const doctor = await doctorContract.getDoctor(record[6]);

            if (doctor[1] === 'admin') return null;

            return {
              recordCDI: record[0],
              fileName: record[2],
              title: record[3],
              description: record[4],
              datetime: record[5],
              doctor: doctor
            };
          })
        );
        const filteredRecordData = recordData.filter((data) => data !== null);
        setRecords(filteredRecordData);

      } catch (err) {
        console.error("Error fetching data:", err);
        toast.error('Failed to load dashboard data');
      }
    };

    fetchData();
  }, [doctorContract, patientContract, id]);

  const grantAccess = async (doctorId) => {
    setLoadingAction(doctorId);
    try {
      const { doctorContract: signedDoctorContract } = await getSignedContracts();
      toast.info('Submitting access grant to blockchain...');
      const tx2 = await signedDoctorContract.addPatientAccess(doctorId, id);
      await tx2.wait();

      setDoctors(doctors.map(d =>
        d.id === doctorId ? { ...d, hasAccess: true } : d
      ));
      toast.success('Access granted successfully!');
    } catch (err) {
      toast.error('Error granting access: ' + err.message);
    } finally {
      setLoadingAction(null);
    }
  };

  const revokeAccess = async (doctorId) => {
    setRevokeTarget(null);
    setLoadingAction(doctorId);
    try {
      const { doctorContract: signedDoctorContract } = await getSignedContracts();
      toast.info('Submitting access revocation to blockchain...');
      const tx2 = await signedDoctorContract.revokePatientAccess(doctorId, id);
      await tx2.wait();

      setDoctors(doctors.map(d =>
        d.id === doctorId ? { ...d, hasAccess: false } : d
      ));
      toast.success('Access revoked successfully');
    } catch (err) {
      toast.error('Error revoking access: ' + err.message);
    } finally {
      setLoadingAction(null);
    }
  };

  const revokeDoctor = revokeTarget ? doctors.find(d => d.id === revokeTarget) : null;

  return (
    <PageLayout
      title="Patient Dashboard"
      role="patient"
      walletAddress={id}
      showBack
      backPath="/"
      backLabel="Logout"
    >
      {/* Revoke Confirmation Modal */}
      <Modal
        isOpen={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        title="Revoke Access"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRevokeTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => revokeAccess(revokeTarget)}>
              Confirm Revoke
            </Button>
          </>
        }
      >
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Are you sure you want to revoke access for <strong style={{ color: 'var(--text-primary)' }}>Dr. {revokeDoctor?.name}</strong>?
          They will no longer be able to view your medical records.
        </p>
      </Modal>

      {/* Patient Info */}
      <div className="mb-8">
        {patient ? (
          <Card accent>
            <div className="flex items-center gap-4">
              <div
                className="flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center font-display font-bold text-xl"
                style={{
                  background: 'var(--color-success-bg)',
                  color: 'var(--color-success)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                }}
              >
                {patient.username?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  {patient.username}
                </h2>
                <p className="font-mono text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  {id}
                </p>
              </div>
              <Badge variant="success" className="ml-auto">Patient</Badge>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="flex items-center gap-4">
              <div className="skeleton w-14 h-14 rounded-full" />
              <div className="flex-1">
                <div className="skeleton h-6 w-40 mb-2" />
                <div className="skeleton h-4 w-64" />
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Available Doctors */}
      <section className="mb-10">
        <h3 className="section-title">Available Doctors</h3>

        {doctors.length === 0 ? (
          <EmptyState
            title="No doctors registered"
            description="The administrator hasn't registered any doctors yet."
          />
        ) : (
          <div className="grid gap-3 stagger-children">
            {doctors.map(doctor => (
              <div
                key={doctor.id}
                className="glass rounded-lg p-4 flex items-center gap-4"
              >
                {/* Doctor Avatar */}
                <div
                  className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-display font-bold text-sm"
                  style={{
                    background: 'var(--color-info-bg)',
                    color: 'var(--color-info)',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                  }}
                >
                  {doctor.name?.charAt(0)?.toUpperCase() || '?'}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                    Dr. {doctor.name}
                  </p>
                  <p className="font-mono text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                    {doctor.id}
                  </p>
                </div>

                {doctor.hasAccess ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="success">Access Granted</Badge>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setRevokeTarget(doctor.id)}
                      loading={loadingAction === doctor.id}
                    >
                      Revoke
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => grantAccess(doctor.id)}
                    loading={loadingAction === doctor.id}
                  >
                    Grant Access
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Medical Records */}
      <section>
        <h3 className="section-title">Medical Records</h3>

        {records.length === 0 ? (
          <EmptyState
            title="No medical records"
            description="Your doctors will add records here once you grant them access."
            icon={
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--obsidian-400)" strokeWidth="1">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            }
          />
        ) : (
          <div className="grid gap-3 stagger-children">
            {records.map((record, index) => (
              <Card key={index} hover>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      <h4 className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                        {record.title}
                      </h4>
                    </div>

                    <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      <span className="font-body">
                        Dr. {record.doctor[0]}
                      </span>
                      <span>•</span>
                      <span className="font-mono">
                        {record.fileName}
                      </span>
                      <span>•</span>
                      <span>
                        {new Date(Number(record.datetime) * 1000).toLocaleString()}
                      </span>
                    </div>

                    {record.description && (
                      <p className="text-xs mt-2 pt-2" style={{ color: 'var(--text-tertiary)', borderTop: '1px solid var(--border-subtle)' }}>
                        {record.description}
                      </p>
                    )}
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => viewFile(record.recordCDI)}
                  >
                    View
                  </Button>
                </div>
                <div id={`folder-content-${record.recordCDI}`} className="mt-2" />
              </Card>
            ))}
          </div>
        )}
      </section>
    </PageLayout>
  );
};
