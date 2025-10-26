import { expect } from "chai";
import { ethers } from "hardhat";

describe("KipuBankV2", function () {
  const USD6 = (n: number) => BigInt(Math.floor(n * 1_000_000));
  const parseEth = (v: string) => ethers.parseEther(v);
  const ETH = "0x0000000000000000000000000000000000000000";

  async function deployFixture() {
    const [admin, user, other] = await ethers.getSigners();

    // Mock ETH/USD = 2000 * 1e8
    const Agg = await ethers.getContractFactory("MockAggregatorV3");
    const ethFeed = await Agg.deploy(2000n * 10n ** 8n, 8);
    await ethFeed.waitForDeployment();

    const Bank = await ethers.getContractFactory("KipuBankV2");
    const bank = await Bank.deploy(
      admin.address,
      await ethFeed.getAddress(),
      USD6(1000),  // bank cap 1000 USD
      USD6(10)     // withdraw cap 10 USD
    );
    await bank.waitForDeployment();

    return { admin, user, other, bank, ethFeed };
  }

  it("depositETH respects bank cap and updates balances/counters", async () => {
    const { user, bank } = await deployFixture();
    // 0.01 ETH ~ 20 USD (with price 2000 USD)
    const tx = await bank.connect(user).depositETH({ value: parseEth("0.01") });
    await expect(tx).to.emit(bank, "KipuBank_Deposited");

    const [bal, dep, withdr] = await bank.getVault(ETH, user.address);
    expect(bal).to.equal(parseEth("0.01"));
    expect(dep).to.equal(1n);
    expect(withdr).to.equal(0n);

    const remaining = await bank.getRemainingBankCapacityUsd6();
    // bank cap 1000 USD - deposited ~20 USD ≈ 980 USD
    expect(remaining).to.be.closeTo(USD6(980), USD6(1)); // within 1 USD tolerance
  });

  it("withdrawETH enforces per-tx USD cap", async () => {
    const { user, bank } = await deployFixture();
    await bank.connect(user).depositETH({ value: parseEth("0.02") }); // ~40 USD

    // withdraw 0.02 ETH (~40 USD) should exceed 10 USD cap -> revert
    await expect(
      bank.connect(user).withdrawETH(parseEth("0.02"))
    ).to.be.revertedWithCustomError(bank, "KipuBank_ExceedsWithdrawCap");

    // withdraw 0.004 ETH (~8 USD) should succeed
    await expect(
      bank.connect(user).withdrawETH(parseEth("0.004"))
    ).to.emit(bank, "KipuBank_Withdrawn");
  });

  it("depositERC20 works with feed and allowance", async () => {
    const { admin, user, bank } = await deployFixture();

    // Deploy Mock Token (18 decimals) and price feed = 2 USD per token
    const ERC = await ethers.getContractFactory("MockERC20");
    const token = await ERC.deploy("MockToken", "MTK", 18);
    await token.waitForDeployment();

    const Agg = await ethers.getContractFactory("MockAggregatorV3");
    const tokFeed = await Agg.deploy(2n * 10n ** 8n, 8); // 2 USD

    // Register feed
    await (await bank.connect(admin).setTokenFeed(await token.getAddress(), await tokFeed.getAddress())).wait();

    // Mint to user and approve
    await (await token.mint(user.address, ethers.parseUnits("100", 18))).wait();
    await (await token.connect(user).approve(await bank.getAddress(), ethers.parseUnits("10", 18))).wait();

    // Deposit 10 tokens => ~20 USD, under caps
    await expect(
      bank.connect(user).depositERC20(await token.getAddress(), ethers.parseUnits("10", 18))
    ).to.emit(bank, "KipuBank_Deposited");

    const [bal] = await bank.getVault(await token.getAddress(), user.address);
    expect(bal).to.equal(ethers.parseUnits("10", 18));
  });

  it("only FEED_MANAGER_ROLE can setTokenFeed (AccessControl)", async () => {
    const { admin, user, bank } = await deployFixture();

    const role = await bank.FEED_MANAGER_ROLE();
    const ERC = await ethers.getContractFactory("MockERC20");
    const token = await ERC.deploy("MockToken", "MTK", 6);
    await token.waitForDeployment();

    const Agg = await ethers.getContractFactory("MockAggregatorV3");
    const tokFeed = await Agg.deploy(1n * 10n ** 8n, 8);

    // user (no role) should fail with AccessControl custom error
    await expect(
      bank.connect(user).setTokenFeed(await token.getAddress(), await tokFeed.getAddress())
    ).to.be.revertedWithCustomError(bank, "AccessControlUnauthorizedAccount")
     .withArgs(user.address, role);

    // admin succeeds
    await expect(
      bank.connect(admin).setTokenFeed(await token.getAddress(), await tokFeed.getAddress())
    ).to.emit(bank, "KipuBank_TokenFeedSet");
  });

  it("Pausable: admin can pause and block deposits/withdrawals", async () => {
    const { admin, user, bank } = await deployFixture();

    // Pause
    await (await bank.connect(admin).setPaused(true)).wait();

    await expect(
      bank.connect(user).depositETH({ value: parseEth("0.001") })
    ).to.be.revertedWithCustomError(bank, "EnforcedPause");

    // fund first to try withdraw
    await (await bank.connect(admin).setPaused(false)).wait();
    await (await bank.connect(user).depositETH({ value: parseEth("0.001") })).wait();
    await (await bank.connect(admin).setPaused(true)).wait();

    await expect(
      bank.connect(user).withdrawETH(parseEth("0.0005"))
    ).to.be.revertedWithCustomError(bank, "EnforcedPause");

    // Unpause should allow again
    await (await bank.connect(admin).setPaused(false)).wait();
    await expect(
      bank.connect(user).withdrawETH(parseEth("0.0005"))
    ).to.emit(bank, "KipuBank_Withdrawn");
  });

  it("decimal conversion: ERC20 with 6 decimals @ $1.50 -> USD6 correct", async () => {
    const { admin, bank } = await deployFixture();

    const ERC = await ethers.getContractFactory("MockERC20");
    const token6 = await ERC.deploy("Mock6", "M6", 6);
    await token6.waitForDeployment();

    const Agg = await ethers.getContractFactory("MockAggregatorV3");
    const feed = await Agg.deploy(150000000n, 8); // $1.50 with 8 decimals
    await feed.waitForDeployment();

    await (await bank.connect(admin).setTokenFeed(await token6.getAddress(), await feed.getAddress())).wait();

    // 1 token (1e6 units) should be 1.5 USD => 1_500_000 in USD6
    const quote = await bank.quoteTokenToUsd6(await token6.getAddress(), 1_000_000n);
    expect(quote).to.equal(1_500_000n);
  });

  it("decimal conversion: ERC20 with 8 decimals @ $2.25 -> USD6 correct", async () => {
    const { admin, bank } = await deployFixture();

    const ERC = await ethers.getContractFactory("MockERC20");
    const token8 = await ERC.deploy("Mock8", "M8", 8);
    await token8.waitForDeployment();

    const Agg = await ethers.getContractFactory("MockAggregatorV3");
    const feed = await Agg.deploy(225000000n, 8); // $2.25
    await feed.waitForDeployment();

    await (await bank.connect(admin).setTokenFeed(await token8.getAddress(), await feed.getAddress())).wait();

    // 1 token (1e8 units) should be 2.25 USD => 2_250_000 in USD6
    const quote = await bank.quoteTokenToUsd6(await token8.getAddress(), 100_000_000n);
    expect(quote).to.equal(2_250_000n);
  });

  it("reverts: insufficient balance on withdraw", async () => {
    const { user, bank } = await deployFixture();
    await expect(
      bank.connect(user).withdrawETH(ethers.parseEther("0.001"))
    ).to.be.revertedWithCustomError(bank, "KipuBank_InsufficientBalance");
  });

  it("reverts: token not supported on depositERC20 without feed", async () => {
    const { user, bank } = await deployFixture();

    const ERC = await ethers.getContractFactory("MockERC20");
    const token = await ERC.deploy("MockToken", "MTK", 18);
    await token.waitForDeployment();

    await (await token.mint(user.address, ethers.parseUnits("1", 18))).wait();
    await (await token.connect(user).approve(await bank.getAddress(), ethers.parseUnits("1", 18))).wait();

    await expect(
      bank.connect(user).depositERC20(await token.getAddress(), ethers.parseUnits("1", 18))
    ).to.be.revertedWithCustomError(bank, "KipuBank_TokenNotSupported");
  });

  it("reverts: invalid feed params when setting token feed", async () => {
    const { admin, bank } = await deployFixture();

    const ERC = await ethers.getContractFactory("MockERC20");
    const token = await ERC.deploy("MockToken", "MTK", 18);
    await token.waitForDeployment();

    await expect(
      bank.connect(admin).setTokenFeed(await token.getAddress(), ethers.ZeroAddress as any)
    ).to.be.revertedWithCustomError(bank, "KipuBank_InvalidFeed");
  });

  it("reverts: price stale/negative on depositETH when feed < 0", async () => {
    const { user, bank, ethFeed } = await deployFixture();

    // Set negative price
    const mock = await ethers.getContractAt("MockAggregatorV3", await ethFeed.getAddress());
    await (await mock.setPrice(-1)).wait();

    await expect(
      bank.connect(user).depositETH({ value: ethers.parseEther("0.001") })
    ).to.be.revertedWithCustomError(bank, "KipuBank_PriceStaleOrNegative");
  });

  it("withdrawERC20: success and reverts (cap, balance, feed)", async () => {
    const { admin, user, bank } = await deployFixture();

    // Token @ $2 with 18 decimals
    const ERC = await ethers.getContractFactory("MockERC20");
    const token = await ERC.deploy("MockToken", "MTK", 18);
    await token.waitForDeployment();

    const Agg = await ethers.getContractFactory("MockAggregatorV3");
    const tokFeed = await Agg.deploy(2n * 10n ** 8n, 8); // $2
    await tokFeed.waitForDeployment();

    // Register feed
    await (await bank.connect(admin).setTokenFeed(await token.getAddress(), await tokFeed.getAddress())).wait();

    // Mint + approve user
    await (await token.mint(user.address, ethers.parseUnits("10", 18))).wait();
    await (await token.connect(user).approve(await bank.getAddress(), ethers.parseUnits("10", 18))).wait();

    // Deposit 10 => $20
    await (await bank.connect(user).depositERC20(await token.getAddress(), ethers.parseUnits("10", 18))).wait();

    // Revert: exceed per-tx cap (cap=10 USD, try $12 = 6 tokens)
    await expect(
      bank.connect(user).withdrawERC20(await token.getAddress(), ethers.parseUnits("6", 18))
    ).to.be.revertedWithCustomError(bank, "KipuBank_ExceedsWithdrawCap");

    // Success: withdraw $8 = 4 tokens
    await expect(
      bank.connect(user).withdrawERC20(await token.getAddress(), ethers.parseUnits("4", 18))
    ).to.emit(bank, "KipuBank_Withdrawn");

    // Revert: insufficient balance (only 6 tokens left)
    await expect(
      bank.connect(user).withdrawERC20(await token.getAddress(), ethers.parseUnits("7", 18))
    ).to.be.revertedWithCustomError(bank, "KipuBank_InsufficientBalance");
  });

  it("remaining bank capacity adjusts after ERC20 deposit and withdraw", async () => {
    const { admin, user, bank } = await deployFixture();
    // Initial remaining = 1000 USD
    let remaining0 = await bank.getRemainingBankCapacityUsd6();
    expect(remaining0).to.equal(USD6(1000));

    // Token @ $2 with 6 decimals
    const ERC = await ethers.getContractFactory("MockERC20");
    const token6 = await ERC.deploy("Mock6", "M6", 6);
    await token6.waitForDeployment();

    const Agg = await ethers.getContractFactory("MockAggregatorV3");
    const feed = await Agg.deploy(2n * 10n ** 8n, 8); // $2
    await feed.waitForDeployment();

    await (await bank.connect(admin).setTokenFeed(await token6.getAddress(), await feed.getAddress())).wait();

    // Mint + approve
    await (await token6.mint(user.address, 100_000_000n)).wait(); // 100 tokens @ 1e6
    await (await token6.connect(user).approve(await bank.getAddress(), 10_000_000n)).wait(); // 10 tokens

    // Deposit 10 tokens => $20
    await (await bank.connect(user).depositERC20(await token6.getAddress(), 10_000_000n)).wait();
    let remaining1 = await bank.getRemainingBankCapacityUsd6();
    expect(remaining1).to.equal(USD6(980));

    // Withdraw 4 tokens => $8
    await (await bank.connect(user).withdrawERC20(await token6.getAddress(), 4_000_000n)).wait();
    let remaining2 = await bank.getRemainingBankCapacityUsd6();
    expect(remaining2).to.equal(USD6(988));
  });
});
