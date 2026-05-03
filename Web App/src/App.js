import React, { useEffect, useState } from "react";
import { BrowserProvider, Contract } from "ethers";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { Admin, DoctorRegister, PatientRegister } from "./components/adminpage";
import { DoctorDashboard, DoctorLogin } from "./components/doctorpage";
import { PatientDashboard, PatientLogin } from "./components/patientpage";
import { ToastProvider, useToast } from "./components/common/Toast";
import { PageLoader } from "./components/common/Loader";
import identityRegistryABI from "./ABI/identityRegistryABI.json";
import consentLedgerABI from "./ABI/consentLedgerABI.json";
import recordRegistryABI from "./ABI/recordRegistryABI.json";
import { contractAddresses } from "./config/contracts";
import "./App.css";

const Home = ({ identityRegistry, account, connectWallet }) => {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const connectAsAdmin = async () => {
    try {
      setLoading(true);
      setError("");
      const selectedAccount = await connectWallet();

      if (!selectedAccount) {
        setError("No account selected in wallet");
        toast.warning("No account selected — please unlock MetaMask");
        return;
      }

      const admin = await identityRegistry.owner();
      if (admin.toLowerCase() !== selectedAccount.toLowerCase()) {
        setError("Not authorized as admin");
        toast.error("Wallet is not authorized as admin");
        return;
      }

      toast.success("Admin access verified!");
      navigate("/admin");
    } catch (error) {
      console.error("Error verifying admin:", error);
      setError("Error verifying admin. See console for details.");
      toast.error("Failed to verify admin — check console");
    } finally {
      setLoading(false);
    }
  };

  const roleCards = [
    {
      id: "admin",
      title: "Administrator",
      desc: "System management & user registration",
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      ),
      color: "var(--accent-500)",
      action: connectAsAdmin,
    },
    {
      id: "doctor",
      title: "Doctor",
      desc: "Consent-aware uploads & patient verification",
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
      ),
      color: "var(--color-info)",
      action: () => navigate("/doctor-login"),
    },
    {
      id: "patient",
      title: "Patient",
      desc: "Consent control & provenance-aware records",
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
      color: "var(--color-success)",
      action: () => navigate("/patient-login"),
    },
  ];

  return (
    <div className="login-page">
      <div className="login-bg" aria-hidden="true">
        <div className="login-bg-orb login-bg-orb--1" />
        <div className="login-bg-orb login-bg-orb--2" />
        <div className="login-bg-orb login-bg-orb--3" />
        <div className="login-grid" />
      </div>

      <div className="login-content animate-fade-in-up">
        <div className="login-brand">
          <div className="login-logo">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent-500)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h1 className="login-title">MedVault</h1>
          <p className="login-subtitle">Gas-Optimized Medical Verification</p>
          <p className="login-tagline">Compact on-chain state  •  IPFS metadata  •  Patient-managed consent</p>
        </div>

        <div className="login-roles stagger-children">
          {roleCards.map((role) => (
            <button
              key={role.id}
              className="role-card hover-lift hover-glow"
              onClick={role.action}
              disabled={loading && role.id === "admin"}
              style={{ "--role-color": role.color }}
            >
              <div className="role-card__icon" style={{ color: role.color }}>
                {role.icon}
              </div>
              <div className="role-card__text">
                <h3 className="role-card__title">{role.title}</h3>
                <p className="role-card__desc">{role.desc}</p>
              </div>
              <svg className="role-card__arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          ))}
        </div>

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

        <div className="login-footer">
          <p>Current wallet: {account || "not connected"}</p>
        </div>
      </div>
    </div>
  );
};

const App = () => {
  const [identityRegistry, setIdentityRegistry] = useState(null);
  const [consentLedger, setConsentLedger] = useState(null);
  const [recordRegistry, setRecordRegistry] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");

  const connectWallet = async () => {
    if (!window.ethereum || !provider) {
      return null;
    }

    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const selected = accounts?.[0];
      if (!selected) {
        return null;
      }

      const nextSigner = await provider.getSigner();
      setSigner(nextSigner);
      setAccount(selected);
      return selected;
    } catch (error) {
      console.error("Error connecting wallet:", error);
      return null;
    }
  };

  useEffect(() => {
    let providerRef = null;

    const handleAccountsChanged = async (accounts) => {
      setAccount(accounts[0] || "");
      if (accounts[0] && providerRef) {
        setSigner(await providerRef.getSigner());
      } else {
        setSigner(null);
      }
    };

    const init = async () => {
      if (!window.ethereum) {
        return;
      }

      const nextProvider = new BrowserProvider(window.ethereum);
      providerRef = nextProvider;
      setProvider(nextProvider);
      setIdentityRegistry(new Contract(contractAddresses.identityRegistry, identityRegistryABI, nextProvider));
      setConsentLedger(new Contract(contractAddresses.consentLedger, consentLedgerABI, nextProvider));
      setRecordRegistry(new Contract(contractAddresses.recordRegistry, recordRegistryABI, nextProvider));

      window.ethereum.on("accountsChanged", handleAccountsChanged);
    };

    init();

    return () => {
      if (window.ethereum?.removeListener) {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      }
    };
  }, []);

  const getSignedContracts = async () => {
    const activeSigner = signer || (provider ? await provider.getSigner() : null);
    if (!activeSigner) {
      throw new Error("Wallet signer unavailable");
    }

    if (!signer) {
      setSigner(activeSigner);
    }

    return {
      identityRegistry: identityRegistry.connect(activeSigner),
      consentLedger: consentLedger.connect(activeSigner),
      recordRegistry: recordRegistry.connect(activeSigner),
    };
  };

  if (!identityRegistry || !consentLedger || !recordRegistry) {
    return <PageLoader />;
  }

  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home identityRegistry={identityRegistry} account={account} connectWallet={connectWallet} />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/register-doctor" element={<DoctorRegister getSignedContracts={getSignedContracts} />} />
          <Route path="/register-patient" element={<PatientRegister getSignedContracts={getSignedContracts} />} />
          <Route
            path="/doctor-login"
            element={<DoctorLogin contract={identityRegistry} connectWallet={connectWallet} account={account} />}
          />
          <Route
            path="/doctor-dashboard/:id"
            element={
              <DoctorDashboard
                identityRegistry={identityRegistry}
                consentLedger={consentLedger}
                recordRegistry={recordRegistry}
                getSignedContracts={getSignedContracts}
              />
            }
          />
          <Route
            path="/patient-login"
            element={<PatientLogin contract={identityRegistry} connectWallet={connectWallet} account={account} />}
          />
          <Route
            path="/patient-dashboard/:id"
            element={
              <PatientDashboard
                identityRegistry={identityRegistry}
                consentLedger={consentLedger}
                recordRegistry={recordRegistry}
                getSignedContracts={getSignedContracts}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
};

export default App;
