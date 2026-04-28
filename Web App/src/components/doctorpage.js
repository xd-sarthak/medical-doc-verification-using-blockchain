import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useNavigate, useParams } from "react-router-dom";
import { fetchIpfsBlob, uploadFileToIPFS } from "../ipfs";
import PageLayout from "./layout/PageLayout";
import Card from "./common/Card";
import Button from "./common/Button";
import Badge from "./common/Badge";
import EmptyState from "./common/EmptyState";
import { useToast } from "./common/Toast";
import {
  CONSENT_DURATION_SECONDS,
  ROLE_DOCTOR,
  ROLE_PATIENT,
  SCOPE_UPLOAD,
  buildMetadataDigest,
  getConsentSecret,
  getDisplayName,
  getRecordMetadata,
  getRecordMetadataByHash,
  saveRecordMetadata,
  verifyMetadataSignature,
} from "../utils/optimizedRegistry";
import { decryptBytes, decryptJson, encryptBytes, encryptJson } from "../utils/crypto";
import "../App.css";

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

async function resolveRecordView(recordRegistry, patientAddress, doctorAddress, recordId) {
  const record = await recordRegistry.getRecord(recordId);
  if (record.patient.toLowerCase() !== patientAddress.toLowerCase()) {
    return null;
  }
  if (record.doctor.toLowerCase() !== doctorAddress.toLowerCase()) {
    return null;
  }

  const cached = getRecordMetadata(recordId) || getRecordMetadataByHash(record.metadataHash);
  if (!cached) {
    return {
      recordId,
      patient: record.patient,
      doctor: record.doctor,
      title: `Encrypted Record #${recordId}`,
      description: "",
      fileName: "Missing local CID registry",
      documentCid: "",
      metadataCid: "",
      mimeType: "",
      timestamp: Number(record.updatedAt),
      status: Number(record.status),
      verified: false,
      availability: "missing-cids",
    };
  }

  if (ethers.id(cached.documentCid) !== record.documentHash || ethers.id(cached.metadataCid) !== record.metadataHash) {
    return {
      recordId,
      patient: record.patient,
      doctor: record.doctor,
      title: `Encrypted Record #${recordId}`,
      description: "",
      fileName: "CID mismatch detected",
      documentCid: "",
      metadataCid: "",
      mimeType: "",
      timestamp: Number(record.updatedAt),
      status: Number(record.status),
      verified: false,
      availability: "cid-mismatch",
    };
  }

  const secret = getConsentSecret(patientAddress, doctorAddress);
  if (!secret) {
    return {
      recordId,
      patient: record.patient,
      doctor: record.doctor,
      title: `Encrypted Record #${recordId}`,
      description: "",
      fileName: "Consent secret unavailable on this device",
      documentCid: cached.documentCid,
      metadataCid: cached.metadataCid,
      mimeType: "",
      timestamp: Number(record.updatedAt),
      status: Number(record.status),
      verified: false,
      availability: "missing-secret",
    };
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
    const signatureOk = verifyMetadataSignature(metadataPayload, metadata.signature, doctorAddress);

    return {
      recordId,
      patient: record.patient,
      doctor: record.doctor,
      title: metadata.title,
      description: metadata.description,
      fileName: metadata.fileName,
      documentCid: metadata.documentCid,
      metadataCid: cached.metadataCid,
      mimeType: metadata.mimeType,
      timestamp: Number(record.updatedAt),
      status: Number(record.status),
      verified: signatureOk,
      availability: signatureOk ? "ready" : "bad-signature",
      secret,
    };
  } catch (error) {
    return {
      recordId,
      patient: record.patient,
      doctor: record.doctor,
      title: `Encrypted Record #${recordId}`,
      description: "",
      fileName: "Unable to decrypt metadata",
      documentCid: cached.documentCid,
      metadataCid: cached.metadataCid,
      mimeType: "",
      timestamp: Number(record.updatedAt),
      status: Number(record.status),
      verified: false,
      availability: "decrypt-failed",
    };
  }
}

async function fetchRecordsForPatient(recordRegistry, patientAddress, doctorAddress) {
  const latestRecordId = Number(await recordRegistry.nextRecordId());
  const records = [];

  for (let recordId = 1; recordId <= latestRecordId; recordId += 1) {
    try {
      const resolved = await resolveRecordView(recordRegistry, patientAddress, doctorAddress, recordId);
      if (resolved) {
        records.push(resolved);
      }
    } catch (error) {
      // Ignore missing IDs.
    }
  }

  return records.sort((left, right) => right.recordId - left.recordId);
}

export const DoctorLogin = ({ contract, connectWallet, account }) => {
  const [doctorId, setDoctorId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const verifyDoctor = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const selectedAccount = account || await connectWallet();
      if (!selectedAccount) {
        setError("Connect your wallet first");
        return;
      }

      if (selectedAccount.toLowerCase() !== doctorId.toLowerCase()) {
        setError("Connected wallet does not match the entered doctor address");
        return;
      }

      const isDoctor = await contract.hasRole(doctorId, ROLE_DOCTOR);
      if (isDoctor) {
        navigate(`/doctor-dashboard/${doctorId}`);
      } else {
        setError("Invalid doctor wallet — no active doctor identity found");
      }
    } catch (error) {
      setError("Error verifying doctor credentials");
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
            Doctor Portal
          </h1>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            Wallet ownership and doctor role are both required
          </p>
        </div>

        <Card className="w-full">
          <form onSubmit={verifyDoctor} className="space-y-4">
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

export const DoctorDashboard = ({ identityRegistry, consentLedger, recordRegistry, getSignedContracts }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [doctorName, setDoctorName] = useState("");
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);

  const loadPatients = async () => {
    const identityEvents = await identityRegistry.queryFilter(identityRegistry.filters.IdentityRegistered());
    const patientAddresses = [
      ...new Set(
        identityEvents
          .filter((event) => Number(event.args.role) === ROLE_PATIENT)
          .map((event) => event.args.account)
      ),
    ];

    const entries = [];
    for (const patientAddress of patientAddresses) {
      const hasConsent = await consentLedger.hasValidConsent(patientAddress, id, SCOPE_UPLOAD);
      if (!hasConsent) {
        continue;
      }

      const records = await fetchRecordsForPatient(recordRegistry, patientAddress, id);
      entries.push({
        id: patientAddress,
        name: getDisplayName(patientAddress),
        records,
      });
    }

    setPatients(entries);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const isDoctor = await identityRegistry.hasRole(id, ROLE_DOCTOR);
        if (!isDoctor) {
          toast.error("Address is not an active doctor identity");
          navigate("/doctor-login");
          return;
        }

        setDoctorName(getDisplayName(id, "Dr."));
        await loadPatients();
      } catch (error) {
        console.error("Error fetching data:", error);
        toast.error("Failed to load patient data");
      }
    };

    fetchData();
  }, [id, identityRegistry, consentLedger, recordRegistry]);

  const addRecord = async (event) => {
    event.preventDefault();

    if (!selectedPatient || !file || !title.trim()) {
      toast.warning("Select a patient, file, and title first");
      return;
    }

    const secret = getConsentSecret(selectedPatient.id, id);
    if (!secret) {
      toast.error("No local consent secret found. The patient must grant access from this browser session.");
      return;
    }

    setUploading(true);
    try {
      const encryptedFile = await encryptBytes(await file.arrayBuffer(), secret);
      const documentCid = await uploadFileToIPFS(encryptedFile);
      const documentHash = ethers.id(documentCid);

      const { recordRegistry: signedRecordRegistry } = await getSignedContracts();
      const metadataCore = {
        patient: selectedPatient.id,
        doctor: id,
        documentCid,
        documentHash,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        title: title.trim(),
        description: description.trim(),
      };
      const signature = await signedRecordRegistry.runner.signMessage(
        ethers.getBytes(buildMetadataDigest(metadataCore))
      );
      const encryptedMetadata = await encryptJson(
        {
          ...metadataCore,
          signature,
        },
        secret
      );
      const metadataCid = await uploadFileToIPFS(encryptedMetadata);
      const metadataHash = ethers.id(metadataCid);

      const tx = await signedRecordRegistry.createRecord(selectedPatient.id, documentHash, metadataHash);
      toast.info("Submitting optimized record transaction...");
      const receipt = await tx.wait();
      const created = receipt.logs
        .map((log) => {
          try {
            return signedRecordRegistry.interface.parseLog(log);
          } catch (error) {
            return null;
          }
        })
        .find((log) => log && log.name === "RecordCreated");

      if (created) {
        saveRecordMetadata({
          recordId: Number(created.args.recordId),
          patient: selectedPatient.id,
          doctor: id,
          documentCid,
          metadataCid,
          documentHash,
          metadataHash,
        });
      }

      await loadPatients();
      setFile(null);
      setTitle("");
      setDescription("");
      toast.success("Encrypted medical record added successfully!");
    } catch (error) {
      console.error("Add record error:", error);
      toast.error(error.message || "Failed to add record");
    } finally {
      setUploading(false);
    }
  };

  return (
    <PageLayout title="Doctor Dashboard" role="doctor" walletAddress={id} showBack backPath="/" backLabel="Logout">
      <div className="mb-8">
        <h2 className="font-display text-3xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
          Welcome, {doctorName}
        </h2>
        <p className="font-mono text-sm" style={{ color: "var(--text-tertiary)" }}>
          {id}
        </p>
      </div>

      <section className="mb-10">
        <h3 className="section-title">Patients With Active Consent</h3>

        {patients.length === 0 ? (
          <EmptyState
            title="No patients assigned"
            description={`Patients must grant upload consent to you. Default grant duration in this demo is ${Math.floor(CONSENT_DURATION_SECONDS / 86400)} days.`}
          />
        ) : (
          <div className="grid gap-3 stagger-children">
            {patients.map((patient) => (
              <div key={patient.id}>
                <button
                  className={`w-full flex items-center gap-4 p-4 glass rounded-lg text-left transition-all duration-250 cursor-pointer hover-glow ${
                    selectedPatient?.id === patient.id ? "border-accent-500/50 shadow-glow" : ""
                  }`}
                  onClick={() => setSelectedPatient(selectedPatient?.id === patient.id ? null : patient)}
                  style={{ outline: "none" }}
                >
                  <div
                    className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-display font-bold text-sm"
                    style={{
                      background: "var(--accent-glow)",
                      color: "var(--accent-500)",
                      border: "1px solid var(--border-accent)",
                    }}
                  >
                    {patient.name?.charAt(0)?.toUpperCase() || "?"}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-display font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                      {patient.name}
                    </p>
                    <p className="font-mono text-xs truncate" style={{ color: "var(--text-tertiary)" }}>
                      {patient.id}
                    </p>
                  </div>

                  <Badge variant={patient.records.length > 0 ? "accent" : "neutral"}>
                    {patient.records.length} record{patient.records.length !== 1 ? "s" : ""}
                  </Badge>
                </button>

                {selectedPatient?.id === patient.id && (
                  <div className="mt-2 ml-6 pl-4 animate-fade-in-up" style={{ borderLeft: "2px solid var(--border-subtle)" }}>
                    <h4 className="font-display text-sm font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>
                      Uploaded Records
                    </h4>
                    <div className="space-y-2">
                      {patient.records.map((record) => (
                        <div key={record.recordId} className="glass rounded-md p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="font-body text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                                {record.title}
                              </p>
                              <p className="font-mono text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                                #{record.recordId} • {record.fileName} • {new Date(record.timestamp * 1000).toLocaleString()}
                              </p>
                              <p className="text-xs mt-1" style={{ color: record.verified ? "var(--color-success)" : "var(--color-danger)" }}>
                                {record.verified ? "Metadata signature verified" : `Encrypted state: ${record.availability}`}
                              </p>
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
                          {record.description && (
                            <p className="text-xs mt-2 pt-2" style={{ color: "var(--text-tertiary)", borderTop: "1px solid var(--border-subtle)" }}>
                              {record.description}
                            </p>
                          )}
                        </div>
                      ))}
                      {patient.records.length === 0 && (
                        <p className="text-sm py-2" style={{ color: "var(--text-tertiary)" }}>
                          No records yet
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {selectedPatient && (
        <section className="animate-fade-in-up">
          <h3 className="section-title">Add Record for {selectedPatient.name}</h3>
          <Card>
            <form onSubmit={addRecord} className="space-y-4">
              <div className="form-group">
                <label className="form-label">Record Title</label>
                <input
                  type="text"
                  placeholder="e.g. Blood Test Results"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="form-input"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">File</label>
                <div className={`form-file-zone ${file ? "has-file" : ""}`}>
                  <input type="file" onChange={(event) => setFile(event.target.files[0])} required={!file} />
                  {file ? <span className="text-sm font-medium">{file.name}</span> : <p className="text-sm mt-2">Encrypted before IPFS upload</p>}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description (optional)</label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Additional notes about this medical record..."
                  className="form-textarea"
                  rows="3"
                />
              </div>

              <Button type="submit" variant="primary" fullWidth loading={uploading}>
                {uploading ? "Uploading..." : "Add Encrypted Medical Record"}
              </Button>
            </form>
          </Card>
        </section>
      )}
    </PageLayout>
  );
};
