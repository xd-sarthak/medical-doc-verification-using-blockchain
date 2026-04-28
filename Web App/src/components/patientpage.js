import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useNavigate, useParams } from "react-router-dom";
import { fetchIpfsBlob } from "../ipfs";
import PageLayout from "./layout/PageLayout";
import Card from "./common/Card";
import Button from "./common/Button";
import Badge from "./common/Badge";
import Modal from "./common/Modal";
import EmptyState from "./common/EmptyState";
import { useToast } from "./common/Toast";
import {
  CONSENT_DURATION_SECONDS,
  ROLE_DOCTOR,
  ROLE_PATIENT,
  SCOPE_UPLOAD,
  getConsentSecret,
  getDisplayName,
  getRecordMetadata,
  getRecordMetadataByHash,
  revokeConsentSecret,
  saveConsentSecret,
  verifyMetadataSignature,
} from "../utils/optimizedRegistry";
import { decryptBytes, decryptJson, generateConsentSecret } from "../utils/crypto";
import "../App.css";

function statusLabel(status) {
  if (status === 1) return { label: "Active", variant: "success" };
  if (status === 2) return { label: "Superseded", variant: "warning" };
  if (status === 3) return { label: "Revoked", variant: "danger" };
  return { label: "Unknown", variant: "neutral" };
}

async function openEncryptedDocument(documentCid, mimeType, fileName, secret) {
  const blob = await fetchIpfsBlob(documentCid);
  const plainBytes = await decryptBytes(blob, secret);
  const fileBlob = new Blob([plainBytes], { type: mimeType || "application/octet-stream" });
  const url = window.URL.createObjectURL(fileBlob);
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.download = fileName || "medical-record";
  link.click();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

async function fetchPatientRecords(recordRegistry, patientAddress) {
  const latestRecordId = Number(await recordRegistry.nextRecordId());
  const records = [];

  for (let recordId = 1; recordId <= latestRecordId; recordId += 1) {
    try {
      const record = await recordRegistry.getRecord(recordId);
      if (record.patient.toLowerCase() !== patientAddress.toLowerCase()) {
        continue;
      }

      const cached = getRecordMetadata(recordId) || getRecordMetadataByHash(record.metadataHash);
      if (!cached || ethers.id(cached.documentCid) !== record.documentHash || ethers.id(cached.metadataCid) !== record.metadataHash) {
        records.push({
          recordId,
          rootId: Number(record.rootId),
          parentId: Number(record.parentId),
          doctor: record.doctor,
          title: `Encrypted Record #${recordId}`,
          description: "",
          fileName: "Missing or invalid local CID registry",
          documentCid: "",
          mimeType: "",
          updatedAt: Number(record.updatedAt),
          status: Number(record.status),
          verified: false,
          availability: "missing-cids",
        });
        continue;
      }

      const secret = getConsentSecret(patientAddress, record.doctor);
      if (!secret) {
        records.push({
          recordId,
          rootId: Number(record.rootId),
          parentId: Number(record.parentId),
          doctor: record.doctor,
          title: `Encrypted Record #${recordId}`,
          description: "",
          fileName: "Consent secret unavailable on this device",
          documentCid: cached.documentCid,
          mimeType: "",
          updatedAt: Number(record.updatedAt),
          status: Number(record.status),
          verified: false,
          availability: "missing-secret",
        });
        continue;
      }

      try {
        const metadataBlob = await fetchIpfsBlob(cached.metadataCid);
        const metadata = await decryptJson(metadataBlob, secret);
        const metadataPayload = {
          patient: metadata.patient,
          doctor: metadata.doctor,
          documentCid: metadata.documentCid,
          documentHash: metadata.documentHash,
          fileName: metadata.fileName,
          mimeType: metadata.mimeType,
          title: metadata.title,
          description: metadata.description,
        };
        const signatureOk = verifyMetadataSignature(metadataPayload, metadata.signature, record.doctor);

        records.push({
          recordId,
          rootId: Number(record.rootId),
          parentId: Number(record.parentId),
          doctor: record.doctor,
          title: metadata.title,
          description: metadata.description,
          fileName: metadata.fileName,
          documentCid: metadata.documentCid,
          mimeType: metadata.mimeType,
          updatedAt: Number(record.updatedAt),
          status: Number(record.status),
          verified: signatureOk,
          availability: signatureOk ? "ready" : "bad-signature",
          secret,
        });
      } catch (error) {
        records.push({
          recordId,
          rootId: Number(record.rootId),
          parentId: Number(record.parentId),
          doctor: record.doctor,
          title: `Encrypted Record #${recordId}`,
          description: "",
          fileName: "Unable to decrypt metadata",
          documentCid: cached.documentCid,
          mimeType: "",
          updatedAt: Number(record.updatedAt),
          status: Number(record.status),
          verified: false,
          availability: "decrypt-failed",
        });
      }
    } catch (error) {
      // Ignore gaps.
    }
  }

  return records.sort((left, right) => right.recordId - left.recordId);
}

export const PatientLogin = ({ contract, connectWallet, account }) => {
  const [patientId, setPatientId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const verifyPatient = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const selectedAccount = account || await connectWallet();
      if (!selectedAccount) {
        setError("Connect your wallet first");
        return;
      }

      if (selectedAccount.toLowerCase() !== patientId.toLowerCase()) {
        setError("Connected wallet does not match the entered patient address");
        return;
      }

      const isPatient = await contract.hasRole(patientId, ROLE_PATIENT);
      if (isPatient) {
        navigate(`/patient-dashboard/${patientId}`);
      } else {
        setError("Invalid patient wallet — no active patient identity found");
      }
    } catch (error) {
      setError("Error verifying patient credentials");
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

      <div className="login-content animate-fade-in-up" style={{ maxWidth: "420px" }}>
        <div className="login-brand">
          <h1 className="font-display text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
            Patient Portal
          </h1>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            Wallet ownership and patient role are both required
          </p>
        </div>

        <Card className="w-full">
          <form onSubmit={verifyPatient} className="space-y-4">
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
              Sign In
            </Button>

            {error && <p className="login-error animate-fade-in">{error}</p>}
          </form>
        </Card>

        <Button variant="ghost" onClick={() => navigate("/")}>
          ← Back to Login
        </Button>
      </div>
    </div>
  );
};

export const PatientDashboard = ({ identityRegistry, consentLedger, recordRegistry, getSignedContracts }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [doctors, setDoctors] = useState([]);
  const [records, setRecords] = useState([]);
  const [patientName, setPatientName] = useState("");
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [loadingAction, setLoadingAction] = useState(null);

  const loadDoctors = async () => {
    const identityEvents = await identityRegistry.queryFilter(identityRegistry.filters.IdentityRegistered());
    const doctorAddresses = [
      ...new Set(
        identityEvents
          .filter((event) => Number(event.args.role) === ROLE_DOCTOR)
          .map((event) => event.args.account)
      ),
    ];

    const entries = [];
    for (const doctorAddress of doctorAddresses) {
      if (!(await identityRegistry.hasRole(doctorAddress, ROLE_DOCTOR))) {
        continue;
      }

      const hasAccess = await consentLedger.hasValidConsent(id, doctorAddress, SCOPE_UPLOAD);
      entries.push({
        id: doctorAddress,
        name: getDisplayName(doctorAddress, "Dr."),
        hasAccess,
      });
    }

    setDoctors(entries);
  };

  const loadRecords = async () => {
    setRecords(await fetchPatientRecords(recordRegistry, id));
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const isPatient = await identityRegistry.hasRole(id, ROLE_PATIENT);
        if (!isPatient) {
          toast.error("Address is not an active patient identity");
          navigate("/patient-login");
          return;
        }

        setPatientName(getDisplayName(id));
        await Promise.all([loadDoctors(), loadRecords()]);
      } catch (error) {
        console.error("Error fetching data:", error);
        toast.error("Failed to load dashboard data");
      }
    };

    fetchData();
  }, [id, identityRegistry, consentLedger, recordRegistry]);

  const grantAccess = async (doctorId) => {
    setLoadingAction(doctorId);
    try {
      const { consentLedger: signedConsentLedger } = await getSignedContracts();
      const latestBlock = await signedConsentLedger.runner.provider.getBlock("latest");
      const expiry = Number(latestBlock.timestamp) + CONSENT_DURATION_SECONDS;
      const secret = generateConsentSecret();
      const tx = await signedConsentLedger.grantConsent(doctorId, SCOPE_UPLOAD, expiry);
      toast.info("Submitting consent grant...");
      await tx.wait();
      saveConsentSecret(id, doctorId, secret, expiry);
      await loadDoctors();
      toast.success("Access granted successfully!");
    } catch (error) {
      toast.error("Error granting access: " + error.message);
    } finally {
      setLoadingAction(null);
    }
  };

  const revokeAccess = async (doctorId) => {
    setRevokeTarget(null);
    setLoadingAction(doctorId);
    try {
      const { consentLedger: signedConsentLedger } = await getSignedContracts();
      const tx = await signedConsentLedger.revokeConsent(doctorId, ethers.id("patient-revoked"));
      toast.info("Submitting consent revocation...");
      await tx.wait();
      revokeConsentSecret(id, doctorId);
      await loadDoctors();
      await loadRecords();
      toast.success("Access revoked successfully");
    } catch (error) {
      toast.error("Error revoking access: " + error.message);
    } finally {
      setLoadingAction(null);
    }
  };

  const revokeDoctor = revokeTarget ? doctors.find((doctor) => doctor.id === revokeTarget) : null;

  return (
    <PageLayout title="Patient Dashboard" role="patient" walletAddress={id} showBack backPath="/" backLabel="Logout">
      <Modal
        isOpen={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        title="Revoke Access"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRevokeTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => revokeAccess(revokeTarget)}>
              Confirm Revoke
            </Button>
          </>
        }
      >
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Are you sure you want to revoke upload consent for <strong style={{ color: "var(--text-primary)" }}>{revokeDoctor?.name}</strong>?
        </p>
      </Modal>

      <div className="mb-8">
        <Card accent>
          <div className="flex items-center gap-4">
            <div
              className="flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center font-display font-bold text-xl"
              style={{
                background: "var(--color-success-bg)",
                color: "var(--color-success)",
                border: "1px solid rgba(34, 197, 94, 0.3)",
              }}
            >
              {patientName?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                {patientName}
              </h2>
              <p className="font-mono text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                {id}
              </p>
            </div>
            <Badge variant="success" className="ml-auto">
              Patient
            </Badge>
          </div>
        </Card>
      </div>

      <section className="mb-10">
        <h3 className="section-title">Available Doctors</h3>

        {doctors.length === 0 ? (
          <EmptyState title="No doctors registered" description="The administrator has not registered any doctors yet." />
        ) : (
          <div className="grid gap-3 stagger-children">
            {doctors.map((doctor) => (
              <div key={doctor.id} className="glass rounded-lg p-4 flex items-center gap-4">
                <div
                  className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-display font-bold text-sm"
                  style={{
                    background: "var(--color-info-bg)",
                    color: "var(--color-info)",
                    border: "1px solid rgba(59, 130, 246, 0.2)",
                  }}
                >
                  {doctor.name?.charAt(0)?.toUpperCase() || "?"}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-display font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                    {doctor.name}
                  </p>
                  <p className="font-mono text-xs truncate" style={{ color: "var(--text-tertiary)" }}>
                    {doctor.id}
                  </p>
                </div>

                {doctor.hasAccess ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="success">Consent Active</Badge>
                    <Button variant="danger" size="sm" onClick={() => setRevokeTarget(doctor.id)} loading={loadingAction === doctor.id}>
                      Revoke
                    </Button>
                  </div>
                ) : (
                  <Button variant="primary" size="sm" onClick={() => grantAccess(doctor.id)} loading={loadingAction === doctor.id}>
                    Grant Access
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="section-title">Medical Records</h3>

        {records.length === 0 ? (
          <EmptyState
            title="No medical records"
            description="Doctors will add encrypted records here after you grant consent."
          />
        ) : (
          <div className="grid gap-3 stagger-children">
            {records.map((record) => {
              const state = statusLabel(record.status);
              return (
                <Card key={record.recordId} hover>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-display font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                          {record.title}
                        </h4>
                        <Badge variant={state.variant}>{state.label}</Badge>
                      </div>

                      <div className="flex items-center gap-3 text-xs flex-wrap" style={{ color: "var(--text-tertiary)" }}>
                        <span>{getDisplayName(record.doctor, "Dr.")}</span>
                        <span>•</span>
                        <span className="font-mono">#{record.recordId}</span>
                        <span>•</span>
                        <span className="font-mono">root {record.rootId}</span>
                        {record.parentId > 0 && (
                          <>
                            <span>•</span>
                            <span className="font-mono">parent {record.parentId}</span>
                          </>
                        )}
                        <span>•</span>
                        <span>{new Date(record.updatedAt * 1000).toLocaleString()}</span>
                      </div>

                      <p className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>
                        {record.fileName}
                      </p>

                      <p className="text-xs mt-1" style={{ color: record.verified ? "var(--color-success)" : "var(--color-danger)" }}>
                        {record.verified ? "Metadata signature verified" : `Encrypted state: ${record.availability}`}
                      </p>

                      {record.description && (
                        <p className="text-xs mt-2 pt-2" style={{ color: "var(--text-tertiary)", borderTop: "1px solid var(--border-subtle)" }}>
                          {record.description}
                        </p>
                      )}
                    </div>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openEncryptedDocument(record.documentCid, record.mimeType, record.fileName, record.secret)}
                      disabled={!record.verified || !record.documentCid || !record.secret}
                    >
                      View
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </PageLayout>
  );
};
