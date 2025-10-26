import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const admin = process.env.ADMIN;
  const ethFeed = process.env.ETH_USD_FEED;
  const bankCap = process.env.BANK_CAP_USD6;
  const withdrawCap = process.env.WITHDRAW_CAP_USD6;
  if (!admin || !ethFeed || !bankCap || !withdrawCap) {
    throw new Error("Missing ADMIN / ETH_USD_FEED / BANK_CAP_USD6 / WITHDRAW_CAP_USD6 in .env");
  }

  const Kipu = await ethers.getContractFactory("KipuBankV2");
  const contract = await Kipu.deploy(admin, ethFeed, BigInt(bankCap), BigInt(withdrawCap));

  console.log("Deploy tx:", contract.deploymentTransaction()?.hash);
  await contract.waitForDeployment();
  console.log("KipuBankV2 deployed at:", await contract.getAddress());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
