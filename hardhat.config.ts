// hardhat.config.ts
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "solidity-coverage";
import "hardhat-gas-reporter";
import * as dotenv from "dotenv";
dotenv.config();

// --- Sanitizar PRIVATE_KEY ---
const RAW_PK = (process.env.PRIVATE_KEY || "").trim();
// quitar "0x" si viene con prefijo
const PK = RAW_PK.replace(/^0x/i, "");
const PK_OK = /^[0-9a-fA-F]{64}$/.test(PK);

// Si la PK no es válida, no pasamos accounts para evitar HH8
const ACCOUNTS = PK_OK ? [PK] : [];

if (!PK_OK) {
  console.warn(
    "[WARN] PRIVATE_KEY ausente o inválida. " +
      "Las tareas que requieran firmar en red fallarán hasta que la corrijas."
  );
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  paths: {
    sources: "src",
  },
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: ACCOUNTS, // <- tolerante
    },
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY || "",
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    coinmarketcap: process.env.CMC_API_KEY || undefined,
  },
};

export default config;
