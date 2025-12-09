import React, { useState, useEffect } from 'react';
import { BrowserProvider, Contract, Log } from 'ethers';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Admin, DoctorRegister, PatientRegister} from './components/adminpage';
import { DoctorLogin, DoctorDashboard } from './components/doctorpage';
import { PatientLogin, PatientDashboard } from './components/patientpage';
import doctorContractABI from "./ABI/doctorContractABI.json";
import patientContractABI from "./ABI/patientContractABI.json";
import auditContractABI from "./ABI/auditContractABI.json";
import userLogo from './imgs/user_logo.png';


const doctorContractAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const patientContractAddress = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
const auditContractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";


const Home = ({ doctorContract, patientContract, account, connectWallet }) => {
	const [error, setError] = useState('');
	const navigate = useNavigate();
	
	const connectAsAdmin = async () => {
	  try {
		
		const selectedAccount = await connectWallet();
		console.log('Selected account from wallet:', selectedAccount);

		if (!selectedAccount) {
			setError('No account selected in wallet');
			return;
		}

		const doctorOwner = await doctorContract.admin();
		const patientOwner = await patientContract.admin();
		console.log('Doctor admin:', doctorOwner);
		console.log('Patient admin:', patientOwner);
		
		const normalizedAccount = selectedAccount.toLowerCase();

		if (doctorOwner.toLowerCase() !== normalizedAccount 
			|| patientOwner.toLowerCase() !== normalizedAccount) 
		{
		  setError('Not authorized as admin');
		  return;
		}
		navigate('/admin');

	  } catch (err) {
		console.error('Error verifying admin:', err);
		setError('Error verifying admin. See console for details.');
	  }
	};
  
	return (
	  <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
		<div className="space-y-4 flex flex-col items-center justify-center">

			<h1 className=''> Login Page </h1>
			<img src={userLogo} alt="Login Illustration" className="w-50 h-60 mb-4 py-3"/>

		  	<button onClick={connectAsAdmin} className="w-full px-6 py-3 bg-blue-600 text-white rounded">
				Connect as Admin
		  	</button>
			
		  	<button onClick={() => navigate('/doctor-login')} className="w-full px-6 py-3 bg-green-600 text-white rounded">
				Connect as Doctor
		  	</button>

		  	<button onClick={() => navigate('/patient-login')} className="w-full px-6 py-3 bg-purple-600 text-white rounded">
				Connect as Patient
		  	</button>

		  	{error && <p className="text-red-500">{error}</p>}
		</div>
	  </div>
	);
  };


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
  
	if (!doctorContract || !patientContract) return <div>Loading...</div>;
  
	return (
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

		  <Route path="/admin" element={ <Admin /> } />

		<Route path="/register-doctor" element={
			<DoctorRegister getSignedContracts={getSignedContracts} />
		} />

		<Route path="/register-patient" element={
			<PatientRegister getSignedContracts={getSignedContracts} 
		/>} />


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
	);
  };
  
export default App;  