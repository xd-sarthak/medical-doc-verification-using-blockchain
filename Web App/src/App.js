import React, { useState, useEffect } from 'react';
import { BrowserProvider, Contract } from 'ethers';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Admin, DoctorRegister, PatientRegister } from './components/adminpage';
import { DoctorLogin, DoctorDashboard } from './components/doctorpage';
import { PatientLogin, PatientDashboard } from './components/patientpage';
import { ToastProvider, useToast } from './components/common/Toast';
import { PageLoader } from './components/common/Loader';
import doctorContractABI from "./ABI/doctorContractABI.json";
import patientContractABI from "./ABI/patientContractABI.json";
import auditContractABI from "./ABI/auditContractABI.json";
import './App.css';

const doctorContractAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const patientContractAddress = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
const auditContractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";


/* ── Home / Login Page ── */
const Home = ({ doctorContract, patientContract, account, connectWallet }) => {
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);
	const navigate = useNavigate();
	const toast = useToast();

	const connectAsAdmin = async () => {
		try {
			setLoading(true);
			setError('');
			const selectedAccount = await connectWallet();

			if (!selectedAccount) {
				setError('No account selected in wallet');
				toast.warning('No account selected — please unlock MetaMask');
				setLoading(false);
				return;
			}

			const doctorOwner = await doctorContract.admin();
			const patientOwner = await patientContract.admin();

			const normalizedAccount = selectedAccount.toLowerCase();

			if (
				doctorOwner.toLowerCase() !== normalizedAccount ||
				patientOwner.toLowerCase() !== normalizedAccount
			) {
				setError('Not authorized as admin');
				toast.error('Wallet is not authorized as admin');
				setLoading(false);
				return;
			}

			toast.success('Admin access verified!');
			navigate('/admin');
		} catch (err) {
			console.error('Error verifying admin:', err);
			setError('Error verifying admin. See console for details.');
			toast.error('Failed to verify admin — check console');
		} finally {
			setLoading(false);
		}
	};

	const roleCards = [
		{
			id: 'admin',
			title: 'Administrator',
			desc: 'System management & user registration',
			icon: (
				<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
					<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
					<path d="M9 12l2 2 4-4" />
				</svg>
			),
			color: 'var(--accent-500)',
			action: connectAsAdmin,
		},
		{
			id: 'doctor',
			title: 'Doctor',
			desc: 'View patients & manage medical records',
			icon: (
				<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
					<path d="M22 12h-4l-3 9L9 3l-3 9H2" />
				</svg>
			),
			color: 'var(--color-info)',
			action: () => navigate('/doctor-login'),
		},
		{
			id: 'patient',
			title: 'Patient',
			desc: 'Upload documents & control access',
			icon: (
				<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
					<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
					<circle cx="12" cy="7" r="4" />
				</svg>
			),
			color: 'var(--color-success)',
			action: () => navigate('/patient-login'),
		},
	];

	return (
		<div className="login-page">
			{/* Animated background */}
			<div className="login-bg" aria-hidden="true">
				<div className="login-bg-orb login-bg-orb--1" />
				<div className="login-bg-orb login-bg-orb--2" />
				<div className="login-bg-orb login-bg-orb--3" />
				<div className="login-grid" />
			</div>

			<div className="login-content animate-fade-in-up">
				{/* Branding */}
				<div className="login-brand">
					<div className="login-logo">
						<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent-500)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
							<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
						</svg>
					</div>
					<h1 className="login-title">MedVault</h1>
					<p className="login-subtitle">
						Decentralized Medical Document Management
					</p>
					<p className="login-tagline">
						Secured by Ethereum  •  Stored on IPFS  •  Controlled by You
					</p>
				</div>

				{/* Role Cards */}
				<div className="login-roles stagger-children">
					{roleCards.map((role) => (
						<button
							key={role.id}
							className="role-card hover-lift hover-glow"
							onClick={role.action}
							disabled={loading && role.id === 'admin'}
							style={{ '--role-color': role.color }}
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

				{/* Footer */}
				<div className="login-footer">
					<p>Requires MetaMask browser extension</p>
				</div>
			</div>
		</div>
	);
};


/* ── App Root ── */
const App = () => {
	const [doctorContract, setDoctorContract] = useState(null);
	const [patientContract, setPatientContract] = useState(null);
	const [account, setAccount] = useState('');
	const [provider, setProvider] = useState(null);
	const [signer, setSigner] = useState(null);

	const connectWallet = async () => {
		if (!window.ethereum) {
			console.error('No injected provider found');
			return null;
		}
		if (!provider) {
			console.error('Provider not initialized yet');
			return null;
		}

		try {
			const accounts = await window.ethereum.request({
				method: 'eth_requestAccounts'
			});
			const selected = accounts?.[0];
			if (!selected) {
				console.error('No account returned from wallet');
				return null;
			}

			setAccount(selected);
			const newSigner = await provider.getSigner();
			setSigner(newSigner);
			return selected;
		} catch (err) {
			console.error("Error connecting wallet:", err);
			return null;
		}
	};

	useEffect(() => {
		const init = async () => {
			if (window.ethereum) {
				const provider = new BrowserProvider(window.ethereum);
				setProvider(provider);

				const doctorContract = new Contract(doctorContractAddress, doctorContractABI, provider);
				const patientContract = new Contract(patientContractAddress, patientContractABI, provider);

				setDoctorContract(doctorContract);
				setPatientContract(patientContract);

				window.ethereum.on('accountsChanged', async (accounts) => {
					setAccount(accounts[0] || '');
					if (accounts[0]) {
						const newSigner = await provider.getSigner();
						setSigner(newSigner);
					} else {
						setSigner(null);
					}
				});
			}
		};

		init();
	}, []);

	const getSignedContracts = async () => {
		if (!signer) {
			const newSigner = await provider.getSigner();
			setSigner(newSigner);
			return {
				doctorContract: doctorContract.connect(newSigner),
				patientContract: patientContract.connect(newSigner)
			};
		}
		return {
			doctorContract: doctorContract.connect(signer),
			patientContract: patientContract.connect(signer)
		};
	};

	if (!doctorContract || !patientContract) return <PageLoader />;

	return (
		<ToastProvider>
			<BrowserRouter>
				<Routes>
					<Route path="/" element={
						<Home
							doctorContract={doctorContract}
							patientContract={patientContract}
							account={account}
							connectWallet={connectWallet}
						/>
					} />

					<Route path="/admin" element={<Admin />} />

					<Route path="/register-doctor" element={
						<DoctorRegister getSignedContracts={getSignedContracts} />
					} />

					<Route path="/register-patient" element={
						<PatientRegister getSignedContracts={getSignedContracts} />
					} />

					<Route path="/doctor-login" element={
						<DoctorLogin contract={doctorContract} />
					} />

					<Route path="/doctor-dashboard/:id" element={
						<DoctorDashboard
							doctorContract={doctorContract}
							patientContract={patientContract}
							getSignedContracts={getSignedContracts}
						/>
					} />

					<Route path="/patient-login" element={
						<PatientLogin contract={patientContract} />
					} />

					<Route path="/patient-dashboard/:id" element={
						<PatientDashboard
							doctorContract={doctorContract}
							patientContract={patientContract}
							getSignedContracts={getSignedContracts}
						/>
					} />

					<Route path="*" element={<Navigate to="/" />} />
				</Routes>
			</BrowserRouter>
		</ToastProvider>
	);
};

export default App;