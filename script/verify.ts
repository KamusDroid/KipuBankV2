// script/verify.ts
import { run } from "hardhat";

async function main() {
  const address = process.env.CONTRACT_ADDRESS;
  const admin = process.env.ADMIN;
  const ethUsdFeed = process.env.ETH_USD_FEED;
  const bankCap = process.env.BANK_CAP_USD6;
  const withdrawCap = process.env.WITHDRAW_CAP_USD6;

  if (!address || !admin || !ethUsdFeed || !bankCap || !withdrawCap) {
    throw new Error(
      "Faltan CONTRACT_ADDRESS / ADMIN / ETH_USD_FEED / BANK_CAP_USD6 / WITHDRAW_CAP_USD6 en .env"
    );
  }

  console.log("[verify] Verifying", address);
  console.log("[verify] Args:", admin, ethUsdFeed, bankCap, withdrawCap);

  await run("verify:verify", {
    address,
    constructorArguments: [admin, ethUsdFeed, bankCap, withdrawCap],
  });

  console.log("[verify] Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
