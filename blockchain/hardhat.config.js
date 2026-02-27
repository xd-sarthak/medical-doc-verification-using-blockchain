require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: "0.8.20",
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545"
    }
  },
  mocha: {
    reporter: "mochawesome",
    reporterOptions: {
      reportDir: "mochawesome-report",
      reportFilename: "test-report",
      overwrite: true,
      html: false,
      json: true,
      quiet: true
    },
    timeout: 30000
  }
};
