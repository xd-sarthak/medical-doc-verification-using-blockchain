import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import PageLayout from "./layout/PageLayout";
import Card from "./common/Card";
import Button from "./common/Button";
import { useToast } from "./common/Toast";
import { ROLE_DOCTOR, ROLE_PATIENT, saveProfile } from "../utils/optimizedRegistry";
import "../App.css";

export const DoctorRegister = ({ getSignedContracts }) => {
  const [doctorId, setDoctorId] = useState("");
  const [doctorUsername, setDoctorUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const registerDoctor = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      const { identityRegistry } = await getSignedContracts();
      const tx = await identityRegistry.registerIdentity(doctorId, ROLE_DOCTOR);
      toast.info("Transaction submitted — waiting for confirmation...");
      await tx.wait();
      saveProfile(doctorId, ROLE_DOCTOR, doctorUsername);
      toast.success("Doctor registered successfully!");
      setDoctorId("");
      setDoctorUsername("");
    } catch (error) {
      toast.error(error.message || "Error registering doctor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageLayout title="Register Doctor" role="admin" showBack backPath="/admin" backLabel="Admin Dashboard">
      <div className="max-w-md mx-auto">
        <Card accent>
          <div className="text-center mb-6">
            <h2 className="font-display text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
              Register New Doctor
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--text-tertiary)" }}>
              Identity is stored on-chain. Display name is kept in this browser for demo use.
            </p>
          </div>

          <form onSubmit={registerDoctor} className="space-y-4">
            <div className="form-group">
              <label className="form-label">Display Name</label>
              <input
                type="text"
                placeholder="Dr. Alice Smith"
                value={doctorUsername}
                onChange={(event) => setDoctorUsername(event.target.value)}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Wallet Address</label>
              <input
                type="text"
                placeholder="0x..."
                value={doctorId}
                onChange={(event) => setDoctorId(event.target.value)}
                className="form-input"
                style={{ fontFamily: "var(--font-mono)" }}
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

export const PatientRegister = ({ getSignedContracts }) => {
  const [patientId, setPatientId] = useState("");
  const [patientUsername, setPatientUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const registerPatient = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      const { identityRegistry } = await getSignedContracts();
      const tx = await identityRegistry.registerIdentity(patientId, ROLE_PATIENT);
      toast.info("Transaction submitted — waiting for confirmation...");
      await tx.wait();
      saveProfile(patientId, ROLE_PATIENT, patientUsername);
      toast.success("Patient registered successfully!");
      setPatientId("");
      setPatientUsername("");
    } catch (error) {
      toast.error(error.message || "Error registering patient");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageLayout title="Register Patient" role="admin" showBack backPath="/admin" backLabel="Admin Dashboard">
      <div className="max-w-md mx-auto">
        <Card accent>
          <div className="text-center mb-6">
            <h2 className="font-display text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
              Register New Patient
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--text-tertiary)" }}>
              Identity is stored on-chain. Display name is kept in this browser for demo use.
            </p>
          </div>

          <form onSubmit={registerPatient} className="space-y-4">
            <div className="form-group">
              <label className="form-label">Display Name</label>
              <input
                type="text"
                placeholder="Bob Johnson"
                value={patientUsername}
                onChange={(event) => setPatientUsername(event.target.value)}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Wallet Address</label>
              <input
                type="text"
                placeholder="0x..."
                value={patientId}
                onChange={(event) => setPatientId(event.target.value)}
                className="form-input"
                style={{ fontFamily: "var(--font-mono)" }}
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

export const Admin = () => {
  const navigate = useNavigate();

  const actions = [
    {
      id: "register-doctor",
      title: "Register Doctor",
      desc: "Create a doctor identity in IdentityRegistry",
      onClick: () => navigate("/register-doctor"),
    },
    {
      id: "register-patient",
      title: "Register Patient",
      desc: "Create a patient identity in IdentityRegistry",
      onClick: () => navigate("/register-patient"),
    },
  ];

  return (
    <PageLayout title="Admin Dashboard" role="admin" showBack backPath="/" backLabel="Logout">
      <div className="max-w-2xl mx-auto">
        <div className="grid gap-4 stagger-children">
          {actions.map((action) => (
            <Card key={action.id} hover accent>
              <button className="w-full text-left" onClick={action.onClick}>
                <h3 className="font-display text-xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                  {action.title}
                </h3>
                <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                  {action.desc}
                </p>
              </button>
            </Card>
          ))}
        </div>
      </div>
    </PageLayout>
  );
};
