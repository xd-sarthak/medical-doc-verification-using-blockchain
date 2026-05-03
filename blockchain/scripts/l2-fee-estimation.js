const fs = require('fs');
const path = require('path');
const https = require('https');

// Helper to fetch live crypto prices
function fetchPrice(id) {
    return new Promise((resolve) => {
        https.get(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed[id].usd);
                } catch(e) {
                    // Fallback prices if API fails or rate limits
                    resolve(id === 'ethereum' ? 3000 : 0.70);
                }
            });
        }).on('error', () => {
            resolve(id === 'ethereum' ? 3000 : 0.70);
        });
    });
}

async function main() {
    console.log("Fetching live ETH and MATIC prices...");
    const ethPrice = await fetchPrice('ethereum');
    const maticPrice = await fetchPrice('matic-network');
    
    console.log(`Current ETH Price: $${ethPrice.toFixed(2)}`);
    console.log(`Current MATIC Price: $${maticPrice.toFixed(2)}\n`);

    // Load V2 Gas Results
    const resultsPath = path.join(__dirname, '..', 'data', 'v2-gas-results.json');
    if (!fs.existsSync(resultsPath)) {
        console.error("v2-gas-results.json not found! Please run the benchmark script first.");
        process.exit(1);
    }
    const resultsData = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    const operations = resultsData.results;

    // L2 Gas Parameters (Typical estimates)
    // Ethereum Mainnet
    const mainnetL1GasPriceGwei = 15; // 15 Gwei
    // Base (L2)
    const baseL2GasPriceGwei = 0.01; // 0.01 Gwei (very cheap L2)
    // Polygon (Sidechain/L2)
    const polygonGasPriceGwei = 30; // 30 Gwei (MATIC)

    function calculateCost(gasUsed, gasPriceGwei, tokenPriceUSD) {
        if (typeof gasUsed !== 'number') return "N/A";
        // Cost = Gas Used * Gas Price (in ETH/MATIC) * Token Price USD
        // 1 Gwei = 1e-9 Tokens
        const costUSD = gasUsed * (gasPriceGwei * 1e-9) * tokenPriceUSD;
        return `$${costUSD.toFixed(4)}`;
    }

    console.log("╔══════════════════════════════════════════════════════════════════════════════════════════╗");
    console.log("║                          L2 DEPLOYMENT & TRANSACTION FEE ESTIMATION                      ║");
    console.log("╠════════════════════════╦══════════════════╦══════════════════╦═══════════════════════════╣");
    console.log("║ Operation              ║ Base (ETH)       ║ Polygon (MATIC)  ║ Ethereum Mainnet (Ref)    ║");
    console.log("╠════════════════════════╬══════════════════╬══════════════════╬═══════════════════════════╣");

    const tableKeys = [
        "registerIdentity_Doctor",
        "registerIdentity_Patient",
        "grantConsent",
        "createRecord",
        "updateRecord",
        "revokeRecord",
        "revokeConsent"
    ];

    for (const key of tableKeys) {
        const gas = operations[key];
        const baseCost = calculateCost(gas, baseL2GasPriceGwei, ethPrice).padEnd(16);
        const polyCost = calculateCost(gas, polygonGasPriceGwei, maticPrice).padEnd(16);
        const ethCost = calculateCost(gas, mainnetL1GasPriceGwei, ethPrice).padEnd(25);
        
        console.log(`║ ${key.padEnd(22)} ║ ${baseCost} ║ ${polyCost} ║ ${ethCost} ║`);
    }
    
    console.log("╚════════════════════════╩══════════════════╩══════════════════╩═══════════════════════════╝");
    console.log("\nNote: Base network estimates L2 execution fees only. L1 data publication fees on Base are typically minimal due to EIP-4844 (blobs).");
}

main().catch(console.error);
