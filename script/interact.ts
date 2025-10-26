import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

const ETH = "0x0000000000000000000000000000000000000000";

async function main() {
  const addr = process.env.CONTRACT_ADDRESS;
  if (!addr) throw new Error("Set CONTRACT_ADDRESS in .env");

  const [signer] = await ethers.getSigners();
  const bank = await ethers.getContractAt("KipuBankV2", addr);

  console.log("Signer:", await signer.getAddress());
  console.log("Contract:", await bank.getAddress());

  // Deposit a bit of ETH
  const dep = await bank.depositETH({ value: ethers.parseEther("0.001") });
  await dep.wait();
  console.log("Deposited 0.001 ETH");

  const [bal, deps, withds] = await bank.getVault(ETH, await signer.getAddress());
  console.log("Vault:", { balance: bal.toString(), deposits: deps.toString(), withdrawals: withds.toString() });

  // Withdraw a smaller amount
  const wd = await bank.withdrawETH(ethers.parseEther("0.0001"));
  await wd.wait();
  console.log("Withdrawn 0.0001 ETH");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
