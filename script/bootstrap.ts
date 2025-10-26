import { ethers } from "hardhat";

const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const ethUsdFeed = process.env.ETH_USD_FEED;              // ej: 0x694A...5306 (Sepolia)
  const feedDecimals = Number(process.env.FEED_DECIMALS ?? "8"); // ETH/USD en testnets suele ser 8
  const staleSeconds = Number(process.env.FEED_STALE_SECONDS ?? "3600");
  const doDemo = (process.env.DEMO_TXS ?? "false").toLowerCase() === "true";

  if (!contractAddress) throw new Error("Falta CONTRACT_ADDRESS en .env");
  if (!ethUsdFeed) throw new Error("Falta ETH_USD_FEED en .env");

  const [signer] = await ethers.getSigners();
  console.log("[bootstrap] Signer:", signer.address);
  console.log("[bootstrap] Contract:", contractAddress);

  const bank = await ethers.getContractAt("KipuBankV2", contractAddress);

  console.log("[bootstrap] setTokenFeed(ETH, aggregator, decimals, staleSeconds)...");
  const tx = await bank.setTokenFeed(ADDRESS_ZERO, ethUsdFeed, feedDecimals, staleSeconds);
  await tx.wait();
  console.log("[bootstrap] Feed seteado ✔");

  if (doDemo) {
    console.log("[bootstrap] DEMO_TXS habilitado → depósito y retiro de prueba");

    // Depósito 0.01 ETH
    const dep = await bank.depositETH({ value: ethers.parseEther("0.01") });
    await dep.wait();
    console.log("[bootstrap] depositETH(0.01) ✔");

    // Vault del usuario para ETH
    const vault1 = await bank.getUserVault(ADDRESS_ZERO, signer.address);
    console.log("[bootstrap] Vault (post-dep):", vault1);

    // Retiro 0.005 ETH
    const wit = await bank.withdrawETH(ethers.parseEther("0.005"));
    await wit.wait();
    console.log("[bootstrap] withdrawETH(0.005) ✔");

    const vault2 = await bank.getUserVault(ADDRESS_ZERO, signer.address);
    console.log("[bootstrap] Vault (post-wit):", vault2);
  } else {
    console.log("[bootstrap] DEMO_TXS=false → sólo se registró el feed (sin txs de demo).");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});