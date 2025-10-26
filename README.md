# 🏦 KipuBankV2

KipuBankV2 es una evolución de **KipuBank**, diseñada como una versión más cercana a producción, integrando **soporte multi-token (ETH + ERC-20)**, **contabilidad en USD(6)** mediante **Chainlink Data Feeds**, y mejores prácticas de **seguridad, arquitectura y documentación** en Solidity.

---

## ✨ Mejoras y Características Clave

| Categoría | Descripción |
|------------|-------------|
| 🔐 **Control de Acceso** | Uso de `AccessControl` con roles `DEFAULT_ADMIN_ROLE` y `FEED_MANAGER_ROLE` para restringir funciones críticas. |
| 💰 **Multi-Token Vault** | Soporta ETH y múltiples tokens ERC-20 con `SafeERC20`. Cada usuario tiene una bóveda por token (`mapping(address => mapping(address => uint256))`). |
| 🧮 **Contabilidad en USD(6)** | Todos los montos internos se contabilizan en unidades de 1e6 (USD6) usando Chainlink Data Feeds (ETH/USD y por token). |
| ⛓️ **Oráculos Chainlink** | Integra `AggregatorV3Interface` para obtener precios actualizados en tiempo real. |
| ⚖️ **Límites Globales y por Transacción** | Define `i_bankCapUsd6` y `i_withdrawCapUsd6` para mantener topes seguros en USD(6). |
| 🧱 **Patrones de Seguridad** | Implementa CEI (Checks–Effects–Interactions), `ReentrancyGuard`, `Pausable`, `immutable`, `constant` y errores personalizados. |
| 🔍 **Documentación NatSpec** | Comentarios estándar en funciones, eventos y errores para auditores y desarrolladores. |
| 🧾 **Eventos Personalizados** | Emite logs de depósitos, retiros y gestión de feeds para trazabilidad completa. |

---

## ⚙️ Setup del Proyecto

```bash
npm install
npm run compile
npm test
```

---

## 🔑 Variables de Entorno (.env)

Crea un archivo `.env` en la raíz del proyecto siguiendo este formato:

```ini
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/TU_API_KEY
PRIVATE_KEY=tu_clave_privada_sin_0x
ETHERSCAN_API_KEY=tu_api_key_de_etherscan
ADMIN=0xTuDireccion
ETH_USD_FEED=0x694AA1769357215DE4FAC081bf1f309aDC325306
BANK_CAP_USD6=1000000000      # 1,000,000 USD
WITHDRAW_CAP_USD6=500000      # 500 USD
CONTRACT_ADDRESS=0xDeployedContract
```

> 🧠 Nota: el `ETH_USD_FEED` de Sepolia proviene de los **Chainlink Data Feeds oficiales**:
> [https://docs.chain.link/data-feeds/price-feeds/addresses](https://docs.chain.link/data-feeds/price-feeds/addresses)

---

## 🚀 Despliegue en Sepolia

### 1️⃣ Compilar el contrato
```bash
npm run compile
```

### 2️⃣ Desplegar
```bash
npm run deploy:sepolia
```

Ejemplo de salida:
```
Deploy tx: 0x1d86ebafd24d618ef91576b77857a8ec9e5c51ae15bd129b84875bdfcdd6af22
KipuBankV2 deployed at: 0xc63fEe3e331D64ecC1AbC8C53cEfdb9EC84443ab
```

### 3️⃣ Verificar el contrato
```bash
npx hardhat verify --network sepolia   0xc63fEe3e331D64ecC1AbC8C53cEfdb9EC84443ab   0xF6678BCF3956Bdad25F00E9E8E9C6e837d1C97dE   0x694AA1769357215DE4FAC081bf1f309aDC325306   1000000000   500000
```

Verificación automática vía script:
```bash
npm run verify:sepolia
```

📜 **Contrato verificado en Etherscan:**
🔗 [https://sepolia.etherscan.io/address/0xc63fEe3e331D64ecC1AbC8C53cEfdb9EC84443ab#code](https://sepolia.etherscan.io/address/0xc63fEe3e331D64ecC1AbC8C53cEfdb9EC84443ab#code)

---

## 💰 Interacción

Podés interactuar con el contrato desde:

- **Etherscan → Write Contract**
- O ejecutando scripts locales:
  ```bash
  npx hardhat run script/interact.ts --network sepolia
  ```

### Ejemplo de Interacción
```bash
npx hardhat console --network sepolia
> const kipu = await ethers.getContractAt("KipuBankV2", process.env.CONTRACT_ADDRESS)
> await kipu.depositETH({ value: ethers.parseEther("0.01") })
> await kipu.withdrawETH(ethers.parseEther("0.005"))
```

---

## 🧠 Decisiones de Diseño y Trade-offs

| Tema | Decisión |
|------|-------------------------|
| 🏗️ **Control de Acceso** | Se eligió `AccessControl` (más flexible que `Ownable`) para permitir futuros roles adicionales. |
| 💵 **Unidad de Contabilidad USD6** | Se normaliza todo a 6 decimales para uniformidad (similar a USDC/USDT). |
| ⛽ **Optimización de Gas** | Uso de `immutable` para constantes de constructor y `unchecked` donde no hay riesgo de overflow. |
| 🧱 **Seguridad CEI + ReentrancyGuard** | Mitiga ataques de reentrada en depósitos y retiros. |
| ⛓️ **Oráculos Chainlink** | Permite límites en USD actualizados dinámicamente en función del precio ETH/USD o token/USD. |
| 🔒 **Pausable** | Permite congelar depósitos y retiros ante eventos inesperados. |
| 💬 **NatSpec Completo** | Facilita auditorías y comprensión del contrato. |

---

## 🧪 Tests y Cobertura

Ejecutar pruebas unitarias:
```bash
npm test
```

Opcional:
```bash
npm run coverage
npm run gas
```

**Cobertura esperada:**
- `depositETH / withdrawETH`
- `depositERC20 / withdrawERC20`
- `setTokenFeed` (solo FEED_MANAGER_ROLE)
- `pause/unpause`
- `feed staleness / error handling`

---

## 📜 Información de Despliegue

| Atributo | Valor |
|-----------|-------|
| **Red** | Sepolia Testnet |
| **Contrato** | 0xc63fEe3e331D64ecC1AbC8C53cEfdb9EC84443ab |
| **Compilador** | Solidity 0.8.26 |
| **Framework** | Hardhat + TypeScript |
| **Oráculo ETH/USD** | 0x694AA1769357215DE4FAC081bf1f309aDC325306 |
| **Autor** | @KamusDroid |
| **Mentoría** | ETH Kipu – Módulo Final |

---

## 🧾 Licencia

Este proyecto forma parte del **Ethereum Developer Pack (ETH Kipu)**  
y se distribuye bajo licencia **MIT**.

> 🚫 No desplegar en mainnet sin auditoría previa.

---

## 🌐 Contacto

Desarrollado con 💜 por **KamusDroid**  
ETH Kipu – 77 Innovation Labs
