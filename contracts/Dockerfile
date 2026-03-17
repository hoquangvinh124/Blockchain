FROM node:20-slim

# Install pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY . .

# Compile contracts
RUN pnpm exec hardhat compile

EXPOSE 8545

# Default command can be overridden in docker-compose
CMD ["pnpm", "exec", "hardhat", "node", "--hostname", "0.0.0.0"]
