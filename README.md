# 🏦 KipuBankV2

**KipuBankV2** es una evolución de KipuBank con soporte **multi-token (ETH + ERC-20)**, límites globales/por transacción en **USD(6)** usando **Chainlink Data Feeds**, y prácticas de **seguridad** y **mantenibilidad** (AccessControl, Pausable, ReentrancyGuard, SafeERC20, CEI, NatSpec).

<p align="center">
  <a href="https://github.com/OWNER/REPO/actions/workflows/ci.yml">
    <img src="https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg" alt="CI Status" />
  </a>
  <a href="#-coverage">
    <img src="https://img.shields.io/badge/coverage-local-green" alt="Coverage" />
  </a>
  <a href="#-gas---coverage---%F0%9F%A7%B9-lint">
    <img src="https://img.shields.io/badge/gas-report-blue" alt="Gas Report" />
  </a>
</p>

## ✨ Features
- **Depositar / retirar** ETH y ERC-20.
- **Capacidad Global** (`i_bankCapUsd6`) y **Cap por transacción** (`i_withdrawCapUsd6`) en **USD(6)**.
- **Feeds de precios** (ETH/USD + por token).
- **AccessControl** (admin + `FEED_MANAGER_ROLE`), **Pausable**, **ReentrancyGuard**.
- **Eventos y errores personalizados**, **mapeos anidados**, **NatSpec**.
- Conversión de decimales **token/feed → USD(6)**.

## ⚙️ Setup
```bash
npm i
npm run compile
npm test
```

## 🔑 .env
Ver `.env.example` y completa:
```
SEPOLIA_RPC_URL=
PRIVATE_KEY=
ETHERSCAN_API_KEY=
ADMIN=0xYourAdminEOA
ETH_USD_FEED=0xEthUsdFeedOnSepolia
BANK_CAP_USD6=1000000000
WITHDRAW_CAP_USD6=10000000
CONTRACT_ADDRESS=0xDeployedContract
```

## 🚀 Deploy (Sepolia)
```bash
npm run deploy:sepolia
npm run verify:sepolia -- <contract> $ADMIN $ETH_USD_FEED $BANK_CAP_USD6 $WITHDRAW_CAP_USD6
```

## 🧪 Tests
```bash
npm test
npm run gas
npm run coverage
```

## 📈 Gas • 📊 Coverage • 🧹 Lint
```bash
npm run gas
npm run coverage   # abre coverage/index.html
npm run lint:sol
npm run format
```

## 🔁 CI (GitHub Actions)
Workflow `ci.yml` ejecuta compile, lint, tests, gas y coverage, y sube artifacts.

> Reemplaza `KamusDroid` en el badge por tu repo real.
