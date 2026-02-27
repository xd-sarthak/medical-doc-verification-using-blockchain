import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { uploadFileToIPFS, viewFile } from '../ipfs';
import PageLayout from './layout/PageLayout';
import Card from './common/Card';
import Button from './common/Button';
import Badge from './common/Badge';
import EmptyState from './common/EmptyState';
import { useToast } from './common/Toast';
import '../App.css';


/**
 * DoctorLogin — Doctor authentication page.
 * Styled dark login form matching the Obsidian Trust aesthetic.
 */
export const DoctorLogin = ({ contract }) => {
  const [doctorId, setDoctorId] = useState('');
  const [doctorUsername, setDoctorUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const verifyDoctor = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const doctor = await contract.doctors(doctorId);
      if (doctor.isRegistered) {
        navigate(`/doctor-dashboard/${doctorId}`);
      } else {
        setError('Invalid doctor ID — not registered on the network');
      }
    } catch (err) {
      setError('Error verifying doctor credentials');
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
            style={{ background: 'var(--color-info-bg)', border: '1px solid rgba(59, 130, 246, 0.3)' }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-info)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
            Doctor Portal
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Sign in to access patient records
          </p>
        </div>

        <Card className="w-full">
          <form onSubmit={verifyDoctor} className="space-y-4">
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                type="text"
                placeholder="Enter your name"
                value={doctorUsername}
                onChange={(e) => setDoctorUsername(e.target.value)}
                className="form-input"
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
 * DoctorDashboard — Doctor's main workspace.
 * Shows authorized patients with expandable record cards, and an upload form.
 * All contract logic is preserved identically.
 */
export const DoctorDashboard = ({ doctorContract, patientContract, getSignedContracts }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [patients, setPatients] = useState([]);
  const [doctor, setDoctor] = useState();
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const doctorInfo = await doctorContract.getDoctor(id);
        setDoctor(doctorInfo[0]);

        const authorizedPatients = await doctorContract.getAuthorizedPatients(id);

        const patientsData = await Promise.all(
          authorizedPatients.map(async (patientId) => {
            const patient = await patientContract.getPatient(patientId);
            const patientRecords = await patientContract.getActiveRecords(patientId);
            const doctorRecords = patientRecords.filter(record => record[6] === id);

            return {
              id: patientId,
              name: patient[0],
              records: doctorRecords
            };
          })
        );

        setPatients(patientsData.filter(p => p !== null));
      } catch (err) {
        console.error("Error fetching data:", err);
        toast.error('Failed to load patient data');
      }
    };

    fetchData();
  }, [doctorContract, patientContract, id]);


  const addRecord = async (e) => {
    e.preventDefault();

    if (!selectedPatient) { toast.warning("Select a patient first"); return; }
    if (!file) { toast.warning("Upload a file first"); return; }
    if (!title.trim()) { toast.warning("Title is required"); return; }

    setUploading(true);
    try {
      toast.info('Uploading file to IPFS...');
      const fileCID = await uploadFileToIPFS(file);
      toast.success('File uploaded to IPFS');

      const { patientContract: signedPatientContract } = await getSignedContracts();

      toast.info('Submitting transaction to blockchain...');
      const tx = await signedPatientContract.addMedicalRecord(
        selectedPatient.id,
        fileCID,
        "Unknown",
        file.name,
        title.trim(),
        description.trim(),
        ""
      );

      await tx.wait();

      // refresh records
      const patientRecords = await signedPatientContract.getActiveRecords(selectedPatient.id);
      const doctorRecords = patientRecords.filter(
        (r) => r[6].toLowerCase() === id.toLowerCase()
      );

      setPatients(
        patients.map((p) =>
          p.id === selectedPatient.id ? { ...p, records: doctorRecords } : p
        )
      );

      setFile(null);
      setTitle("");
      setDescription("");
      toast.success("Medical record added successfully!");

    } catch (err) {
      console.error("Add record error:", err);
      toast.error(err.message || 'Failed to add record');
    } finally {
      setUploading(false);
    }
  };


  return (
    <PageLayout
      title="Doctor Dashboard"
      role="doctor"
      walletAddress={id}
      showBack
      backPath="/"
      backLabel="Logout"
    >
      {/* Doctor Info */}
      <div className="mb-8">
        <h2 className="font-display text-3xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
          Welcome, Dr. {doctor}
        </h2>
        <p className="font-mono text-sm" style={{ color: 'var(--text-tertiary)' }}>
          {id}
        </p>
      </div>

      {/* Patients Section */}
      <section className="mb-10">
        <h3 className="section-title">Your Patients</h3>

        {patients.length === 0 ? (
          <EmptyState
            title="No patients assigned"
            description="Patients need to grant you access before they appear here."
            icon={
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--obsidian-400)" strokeWidth="1">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            }
          />
        ) : (
          <div className="grid gap-3 stagger-children">
            {patients.map(patient => (
              <div key={patient.id}>
                {/* Patient Card */}
                <button
                  className={`
                    w-full flex items-center gap-4 p-4
                    glass rounded-lg text-left
                    transition-all duration-250 cursor-pointer
                    hover-glow
                    ${selectedPatient?.id === patient.id
                      ? 'border-accent-500/50 shadow-glow'
                      : ''
                    }
                  `}
                  onClick={() => setSelectedPatient(
                    selectedPatient?.id === patient.id ? null : patient
                  )}
                  style={{ outline: 'none' }}
                >
                  {/* Patient Avatar */}
                  <div
                    className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-display font-bold text-sm"
                    style={{
                      background: 'var(--accent-glow)',
                      color: 'var(--accent-500)',
                      border: '1px solid var(--border-accent)',
                    }}
                  >
                    {patient.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                      {patient.name}
                    </p>
                    <p className="font-mono text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                      {patient.id}
                    </p>
                  </div>

                  <Badge variant={patient.records.length > 0 ? 'accent' : 'neutral'}>
                    {patient.records.length} record{patient.records.length !== 1 ? 's' : ''}
                  </Badge>

                  <svg
                    width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{
                      transition: 'transform 200ms var(--ease-out)',
                      transform: selectedPatient?.id === patient.id ? 'rotate(90deg)' : 'rotate(0deg)',
                    }}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>

                {/* Expandable Records */}
                {selectedPatient?.id === patient.id && (
                  <div className="mt-2 ml-6 pl-4 animate-fade-in-up" style={{ borderLeft: '2px solid var(--border-subtle)' }}>
                    <h4 className="font-display text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>
                      Medical Records
                    </h4>
                    <div className="space-y-2">
                      {patient.records.map((record, idx) => (
                        <div key={idx} className="glass rounded-md p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="font-body text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                                {record[3]}
                              </p>
                              <p className="font-mono text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                                {record[2]} • {new Date(Number(record.timestamp) * 1000).toLocaleString()}
                              </p>
                            </div>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => viewFile(record[0])}
                            >
                              View
                            </Button>
                          </div>
                          {record[4] && (
                            <p className="text-xs mt-2 pt-2" style={{ color: 'var(--text-tertiary)', borderTop: '1px solid var(--border-subtle)' }}>
                              {record[4]}
                            </p>
                          )}
                          <div id={`folder-content-${record[0]}`} className="mt-2" />
                        </div>
                      ))}
                      {patient.records.length === 0 && (
                        <p className="text-sm py-2" style={{ color: 'var(--text-tertiary)' }}>No records yet</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Add Record Form */}
      {selectedPatient && (
        <section className="animate-fade-in-up">
          <h3 className="section-title">Add Record for {selectedPatient.name}</h3>
          <Card>
            <form onSubmit={addRecord} className="space-y-4">
              <div className="form-group">
                <label className="form-label">Record Title</label>
                <input
                  type="text"
                  placeholder="e.g. Blood Test Results — March 2025"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="form-input"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">File</label>
                <div className={`form-file-zone ${file ? 'has-file' : ''}`}>
                  <input
                    type="file"
                    onChange={(e) => setFile(e.target.files[0])}
                    required={!file}
                  />
                  {file ? (
                    <div className="flex items-center gap-2">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                      <span className="text-sm font-medium" style={{ color: 'var(--color-success)' }}>
                        {file.name}
                      </span>
                    </div>
                  ) : (
                    <>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      <p className="text-sm mt-2" style={{ color: 'var(--text-tertiary)' }}>
                        Click to upload or drag & drop
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description (optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Additional notes about this medical record..."
                  className="form-textarea"
                  rows="3"
                />
              </div>

              <Button type="submit" variant="primary" fullWidth loading={uploading}>
                {uploading ? 'Uploading...' : 'Add Medical Record'}
              </Button>
            </form>
          </Card>
        </section>
      )}
    </PageLayout>
  );
};