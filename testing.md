# MedVault V2 Testing Guide

This guide covers how to verify all builds, run the comprehensive testing suite, calculate real-world gas costs, and estimate L2 transaction fees for the optimized V2 medical blockchain system.

## 1. Prerequisites

Ensure you are in the `blockchain` directory before running any of the following commands:

```bash
cd blockchain
```

Install dependencies if you haven't already:

```bash
npm install
```

## 2. Compilation and Build Verification

Before running tests, ensure that all Solidity contracts compile successfully using the configured Solidity compiler (0.8.26) and the optimizer (runs: 200).

```bash
npm run compile
```

**Expected Output:**
```
Compiled 21 Solidity files successfully (evm target: paris).
```
*Note: The 21 files include OpenZeppelin dependencies, interfaces, and your core V2 contracts (`IdentityRegistryV2`, `ConsentLedgerV2`, `RecordRegistryV2`).*

## 3. Running the Test Suite

The V2 architecture includes a comprehensive unit testing suite that asserts functional correctness, access control, and strict gas consumption ceilings.

To run the entire test suite:

```bash
npm run test
```

### What is tested:
- **`IdentityRegistryV2.test.js`**: Verifies role assignments, monotonic ID generation, and packed identity storage.
- **`ConsentLedgerV2.test.js`**: Verifies patient-to-doctor consent grants, revokes, batch operations, and nonce monotonicity within the single packed word.
- **`RecordRegistryV2.test.js`**: Verifies record creation, versioning (update), revocation, head pointer mapping, and 3-slot storage packing logic.

**Expected Output:**
```
111 passing (4s)
```

## 4. Gas Cost Benchmarking

We have implemented a custom benchmarking script that measures the exact gas units consumed by each primary operation and compares it against the legacy (V1) and unoptimized UUPS proxy (V1.5) deployments.

Run the gas benchmark:

```bash
npm run benchmark:v2
# Or run the script directly:
node scripts/v2-gas.js
```

### Typical Gas Unit Savings (V2 vs Baseline):
- `registerIdentity`: ~74,500 gas (-24%)
- `grantConsent`: ~59,600 gas (-36%)
- `createRecord`: ~141,200 gas (-47%)
- `updateRecord`: ~130,000 gas 

The output is also automatically saved to `blockchain/data/v2-gas-results.json`.

## 5. L2 Fee Estimation (Phase 7)

To translate raw gas units into real-world fiat costs, we use an L2 Fee Estimation script. This script fetches live ETH and MATIC prices and calculates the projected transaction cost on modern Layer 2 networks like Base Sepolia or Polygon Amoy.

Run the fee estimator:

```bash
node scripts/l2-fee-estimation.js
```

### Estimated L2 Costs (Approximate)

| Operation              | Base (ETH)       | Polygon (MATIC)  | Ethereum Mainnet |
|------------------------|------------------|------------------|------------------|
| registerIdentity       | ~$0.0022         | ~$0.0016         | ~$3.35           |
| grantConsent           | ~$0.0018         | ~$0.0013         | ~$2.68           |
| createRecord           | ~$0.0042         | ~$0.0030         | ~$6.35           |
| updateRecord           | ~$0.0039         | ~$0.0027         | ~$5.85           |

*Conclusion: Deploying MedVault V2 to an L2 like Base or Polygon reduces operational costs to fractions of a cent per transaction, making it highly viable for production healthcare environments.*

## 6. Deploying to L2 Testnets (Polygon Amoy / Base Sepolia)

We have configured `hardhat.config.js` to support popular L2 networks. To deploy the V2 stack directly to an L2 testnet, you must configure your `.env` file first.

1. Create a `.env` file in the `blockchain/` directory:
```bash
touch .env
```

2. Add your RPC URLs and a deployment private key:
```env
PRIVATE_KEY=your_wallet_private_key_here
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
POLYGON_AMOY_RPC_URL=https://rpc-amoy.polygon.technology
```

3. Run the V2 deployment script targeted at the specific network:

**Base Sepolia:**
```bash
npx hardhat run scripts/deploy-v2.js --network base_sepolia
```

**Polygon Amoy:**
```bash
npx hardhat run scripts/deploy-v2.js --network polygon_amoy
```

*Note: The `deploy-v2.js` script will automatically output the compiled ABIs and the deployed contract addresses into `Web App/src/config/`, allowing your frontend to immediately connect to the new L2 deployment.*

## 7. Frontend Testing

Once contracts are deployed (either locally via `npm run deploy:v2` or to an L2), you can test the frontend locally:

```bash
cd "../Web App"
npm install
npm start
```

Ensure your MetaMask wallet is connected to the corresponding network (e.g., Hardhat Localhost 8545 or Base Sepolia). You will need testnet ETH/MATIC to interact with the DApp on public testnets.
