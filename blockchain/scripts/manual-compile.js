const fs = require("fs");
const path = require("path");
const wrapper = require("solc/wrapper");
const soljson = require("solc/soljson.js");

const contractsDir = path.join(__dirname, "..", "contracts");
const artifactsDir = path.join(__dirname, "..", "artifacts", "contracts");

function loadSources() {
  const sources = {};

  for (const entry of fs.readdirSync(contractsDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".sol")) {
      const relative = `contracts/${entry.name}`;
      sources[relative] = {
        content: fs.readFileSync(path.join(contractsDir, entry.name), "utf8"),
      };
    }
  }

  const testDir = path.join(contractsDir, "test");
  if (fs.existsSync(testDir)) {
    for (const entry of fs.readdirSync(testDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".sol")) {
        const relative = `contracts/test/${entry.name}`;
        sources[relative] = {
          content: fs.readFileSync(path.join(testDir, entry.name), "utf8"),
        };
      }
    }
  }

  return sources;
}

function findImport(importPath) {
  const candidates = [
    path.join(__dirname, "..", importPath),
    path.join(contractsDir, importPath),
    path.join(contractsDir, "test", importPath),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { contents: fs.readFileSync(candidate, "utf8") };
    }
  }

  return { error: `File not found: ${importPath}` };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeArtifact(sourceName, contractName, output) {
  const artifact = {
    _format: "hh-sol-artifact-1",
    contractName,
    sourceName,
    abi: output.abi,
    bytecode: `0x${output.evm.bytecode.object}`,
    deployedBytecode: `0x${output.evm.deployedBytecode.object}`,
    linkReferences: output.evm.bytecode.linkReferences,
    deployedLinkReferences: output.evm.deployedBytecode.linkReferences,
  };

  const sourceFolder = sourceName.replace(/^contracts\//, "");
  const targetDir = path.join(artifactsDir, sourceFolder);
  ensureDir(targetDir);
  fs.writeFileSync(
    path.join(targetDir, `${contractName}.json`),
    JSON.stringify(artifact, null, 2)
  );
}

function main() {
  const solc = wrapper(soljson);
  const input = {
    language: "Solidity",
    sources: loadSources(),
    settings: {
      optimizer: {
        enabled: false,
        runs: 200,
      },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode", "evm.deployedBytecode"],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));

  const errors = (output.errors || []).filter((item) => item.severity === "error");
  if (errors.length > 0) {
    for (const error of output.errors) {
      console.error(error.formattedMessage);
    }
    process.exitCode = 1;
    return;
  }

  for (const [sourceName, contracts] of Object.entries(output.contracts || {})) {
    for (const [contractName, contractOutput] of Object.entries(contracts)) {
      writeArtifact(sourceName, contractName, contractOutput);
    }
  }

  console.log("Artifacts updated from local solc");
}

main();
