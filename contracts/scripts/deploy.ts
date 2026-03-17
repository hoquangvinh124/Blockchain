import hre from "hardhat";
import { keccak256, toUtf8Bytes, parseEther } from "ethers";
import * as fs from "fs";
import * as path from "path";

// Deploy TrustMarket V2: TrustToken, MarketCollection, JuryDAO, PhygitalEscrow
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const allSigners = await hre.ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  console.log("=== TrustMarket V2 — Deploy UUPS Proxies ===");
  console.log("Deployer:", deployerAddress);
  console.log("Network:", hre.network.name);
  console.log("");

  // 1. TrustToken (no changes)
  console.log("[1/4] Deploying TrustToken...");
  const TrustToken = await hre.ethers.getContractFactory("TrustToken");
  const trustToken = await hre.upgrades.deployProxy(
    TrustToken,
    [deployerAddress],
    { initializer: "initialize", kind: "uups" }
  );
  await trustToken.waitForDeployment();
  const trustTokenAddress = await trustToken.getAddress();
  console.log("  Proxy  :", trustTokenAddress);
  console.log("  Impl   :", await hre.upgrades.erc1967.getImplementationAddress(trustTokenAddress));

  // 2. MarketCollection (replaces ItemNFT)
  console.log("[2/4] Deploying MarketCollection...");
  const MarketCollection = await hre.ethers.getContractFactory("MarketCollection");
  const marketCollection = await hre.upgrades.deployProxy(
    MarketCollection,
    [deployerAddress],
    { initializer: "initialize", kind: "uups", unsafeAllow: ["constructor"] }
  );
  await marketCollection.waitForDeployment();
  const marketCollectionAddress = await marketCollection.getAddress();
  console.log("  Proxy  :", marketCollectionAddress);
  console.log("  Impl   :", await hre.upgrades.erc1967.getImplementationAddress(marketCollectionAddress));

  // 3. JuryDAO
  console.log("[3/4] Deploying JuryDAO...");
  const JuryDAO = await hre.ethers.getContractFactory("JuryDAO");
  const juryDAO = await hre.upgrades.deployProxy(
    JuryDAO,
    [trustTokenAddress, deployerAddress],
    { initializer: "initialize", kind: "uups", unsafeAllow: ["constructor"] }
  );
  await juryDAO.waitForDeployment();
  const juryDAOAddress = await juryDAO.getAddress();
  console.log("  Proxy  :", juryDAOAddress);
  console.log("  Impl   :", await hre.upgrades.erc1967.getImplementationAddress(juryDAOAddress));

  // 4. PhygitalEscrow (replaces MarketEscrow)
  console.log("[4/4] Deploying PhygitalEscrow...");
  const PhygitalEscrow = await hre.ethers.getContractFactory("PhygitalEscrow");
  const phygitalEscrow = await hre.upgrades.deployProxy(
    PhygitalEscrow,
    [marketCollectionAddress, juryDAOAddress, deployerAddress],
    { initializer: "initialize", kind: "uups", unsafeAllow: ["constructor"] }
  );
  await phygitalEscrow.waitForDeployment();
  const phygitalEscrowAddress = await phygitalEscrow.getAddress();
  console.log("  Proxy  :", phygitalEscrowAddress);
  console.log("  Impl   :", await hre.upgrades.erc1967.getImplementationAddress(phygitalEscrowAddress));

  // 5. Wire: grant ESCROW_ROLE on MarketCollection to PhygitalEscrow
  console.log("\n[5] Granting ESCROW_ROLE to PhygitalEscrow on MarketCollection...");
  const ESCROW_ROLE = keccak256(toUtf8Bytes("ESCROW_ROLE"));
  const grantTx = await marketCollection.grantRole(ESCROW_ROLE, phygitalEscrowAddress);
  await grantTx.wait();
  console.log("  Done. Tx:", grantTx.hash);

  // 6. Wire: setPhygitalEscrow on JuryDAO
  console.log("[6] Setting PhygitalEscrow address on JuryDAO...");
  const wireTx = await juryDAO.setPhygitalEscrow(phygitalEscrowAddress);
  await wireTx.wait();
  console.log("  Done. Tx:", wireTx.hash);

  // 7. Wire: setPhygitalEscrow on MarketCollection
  console.log("[7] Setting PhygitalEscrow address on MarketCollection...");
  const wireCollTx = await marketCollection.setPhygitalEscrow(phygitalEscrowAddress);
  await wireCollTx.wait();
  console.log("  Done. Tx:", wireCollTx.hash);

  // 8. Auto-update frontend/.env
  console.log("\n[8] Writing addresses to frontend/.env ...");
  const frontendEnvPath = process.env.FRONTEND_ENV_PATH || path.resolve(__dirname, "../../frontend/.env");

  console.log(`Target .env path: ${frontendEnvPath}`);

  let envContent = "";
  if (fs.existsSync(frontendEnvPath)) {
    envContent = fs.readFileSync(frontendEnvPath, "utf-8");
  }

  const addressMap: Record<string, string> = {
    VITE_MARKET_COLLECTION_ADDRESS: marketCollectionAddress,
    VITE_PHYGITAL_ESCROW_ADDRESS: phygitalEscrowAddress,
    VITE_JURY_DAO_ADDRESS: juryDAOAddress,
    VITE_TRUST_TOKEN_ADDRESS: trustTokenAddress,
  };

  for (const [key, value] of Object.entries(addressMap)) {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
  }

  // Remove old V1 env vars
  envContent = envContent.replace(/^VITE_MARKET_ESCROW_ADDRESS=.*$/m, "");
  envContent = envContent.replace(/^VITE_ITEM_NFT_ADDRESS=.*$/m, "");

  // Preserve WalletConnect project ID
  if (!envContent.includes("VITE_WALLETCONNECT_PROJECT_ID")) {
    envContent += "\nVITE_WALLETCONNECT_PROJECT_ID=8e85639044d88bf8218d29bb8c8c350e";
  }

  // Ensure directory exists
  const envDir = path.dirname(frontendEnvPath);
  if (!fs.existsSync(envDir)) {
    fs.mkdirSync(envDir, { recursive: true });
  }

  // Clean up empty lines from removal
  envContent = envContent.replace(/\n{3,}/g, "\n\n");

  fs.writeFileSync(frontendEnvPath, envContent.trim() + "\n");
  console.log("  Written:", frontendEnvPath);

  // 9. Seed 3 juror accounts (accounts 3,4,5) so disputes can be opened immediately
  console.log("\n[9] Seeding 3 juror accounts for local testing...");
  const jurorSigners = allSigners.slice(3, 6); // accounts idx 3,4,5
  const trustTokenContract = await hre.ethers.getContractAt("TrustToken", trustTokenAddress);
  const juryDAOContract = await hre.ethers.getContractAt("JuryDAO", juryDAOAddress);
  const stakeAmount = parseEther("100"); // minStake = 100 TRUST

  for (const juror of jurorSigners) {
    const jurorAddr = await juror.getAddress();
    // Mint 100 TRUST to juror
    const mintTx = await trustTokenContract.connect(deployer).mint(jurorAddr, stakeAmount);
    await mintTx.wait();
    // Approve JuryDAO to spend TRUST
    const approveTx = await trustTokenContract.connect(juror).approve(juryDAOAddress, stakeAmount);
    await approveTx.wait();
    // Register as juror
    const regTx = await juryDAOContract.connect(juror).registerJuror();
    await regTx.wait();
    console.log("  Juror registered:", jurorAddr);
  }
  console.log("  Jury pool ready (3 jurors).");

  // Summary
  console.log("\n=== Deployment Complete ===");
  console.log("TrustToken       :", trustTokenAddress);
  console.log("MarketCollection :", marketCollectionAddress);
  console.log("JuryDAO          :", juryDAOAddress);
  console.log("PhygitalEscrow   :", phygitalEscrowAddress);
  console.log("\nfrontend/.env has been updated automatically.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
