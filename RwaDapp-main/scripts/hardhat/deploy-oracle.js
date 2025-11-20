// Hardhat deployment script for RevenueAssetNFT_Oracle
const hre = require("hardhat");

async function main() {
  console.log("🚀 开始部署 RevenueAssetNFT_Oracle 合约...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 部署账户:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("💰 账户余额:", hre.ethers.formatEther(balance), "ETH\n");

  if (balance === 0n) {
    console.error("❌ 错误：账户余额为 0");
    process.exit(1);
  }

  // Chainlink Functions Router (Sepolia)
  const ROUTER_ADDRESS = "0xb83E47C2bC239B3bf370bc41e1459A34b41238D0";
  console.log("📍 Chainlink Router:", ROUTER_ADDRESS);

  console.log("\n⏳ 部署合约...");
  const RevenueAssetNFT = await hre.ethers.getContractFactory("RevenueAssetNFT_Oracle");
  const contract = await RevenueAssetNFT.deploy(ROUTER_ADDRESS);
  
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();

  console.log("\n🎉 合约部署成功！");
  console.log("   合约地址:", contractAddress);
  console.log("   查看合约: https://sepolia.etherscan.io/address/" + contractAddress);

  // 等待几个区块以确保合约被索引
  console.log("\n⏳ 等待区块确认...");
  await contract.deploymentTransaction().wait(5);

  console.log("\n✅ 部署完成！");
  console.log("\n📋 下一步：");
  console.log("   1. 在 Chainlink Functions 添加此合约为 Consumer");
  console.log("   2. 运行: CONTRACT_ADDRESS=" + contractAddress + " node scripts/setVerificationSource-secure.mjs");
  console.log("   3. 配置 Chainlink: node scripts/setupChainlinkConfig.mjs");
  console.log("   4. 测试: node scripts/requestAssetVerification.mjs");

  return contractAddress;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ 部署失败:", error.message);
    process.exit(1);
  });
