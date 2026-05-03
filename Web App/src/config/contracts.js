import deployment from "./contracts.json";

const fallbackAddresses = {
  identityRegistry: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  consentLedger: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  recordRegistry: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
};

export const contractAddresses = {
  identityRegistry:
    process.env.REACT_APP_IDENTITY_REGISTRY_ADDRESS ||
    deployment.identityRegistry ||
    fallbackAddresses.identityRegistry,
  consentLedger:
    process.env.REACT_APP_CONSENT_LEDGER_ADDRESS ||
    deployment.consentLedger ||
    fallbackAddresses.consentLedger,
  recordRegistry:
    process.env.REACT_APP_RECORD_REGISTRY_ADDRESS ||
    deployment.recordRegistry ||
    fallbackAddresses.recordRegistry,
};
