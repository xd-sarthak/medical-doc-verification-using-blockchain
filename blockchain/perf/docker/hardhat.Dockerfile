# ============================================================================
# Hardhat Node — Performance Benchmarking Container
# ============================================================================
# Runs a local Hardhat node with 1000 pre-funded accounts for scalability
# testing. Each account starts with 10,000 ETH, enabling concurrent
# transaction submission from up to 1000 simulated users.
#
# The node auto-mines each transaction instantly (no block delay), which
# isolates smart contract execution performance from consensus overhead.
# This is intentional: we want to measure contract gas + execution time,
# not network propagation delays.
# ============================================================================

FROM node:20-alpine

WORKDIR /app

# Install wget for healthcheck
RUN apk add --no-cache wget

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci --production=false

# Copy contract sources and config
COPY hardhat.config.js ./
COPY contracts/ ./contracts/

# Compile contracts inside the container
RUN npx hardhat compile

# Expose the JSON-RPC port
EXPOSE 8545

# Start Hardhat node with 1000 accounts, each with 10000 ETH
# --hostname 0.0.0.0 allows connections from other Docker containers
CMD ["npx", "hardhat", "node", "--hostname", "0.0.0.0"]
