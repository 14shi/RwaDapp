const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 开始部署 Oracle 合约到 Sepolia 测试网...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 部署账户:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("💰 账户余额:", hre.ethers.formatEther(balance), "ETH\n");

  // 使用已部署的NFT合约地址
  const nftAddress = "0xbc6a1736772386109D764E17d1080Fb76cCc4c48";
  console.log("📍 使用已部署的 NFT 合约:", nftAddress);

  // Chainlink Functions Router for Sepolia
  const functionsRouter = "0xb83E47C2bC239B3bf370bc41e1459A34b41238D0";
  console.log("📍 Chainlink Functions Router:", functionsRouter);

  console.log("\n1️⃣  部署 RevenueTokenOracleFactory 合约...");
  const RevenueTokenOracleFactory = await hre.ethers.getContractFactory("RevenueTokenOracleFactory");
  const oracleFactoryContract = await RevenueTokenOracleFactory.deploy(nftAddress, functionsRouter);
  await oracleFactoryContract.waitForDeployment();
  const oracleFactoryAddress = await oracleFactoryContract.getAddress();
  console.log("✅ RevenueTokenOracleFactory 部署成功:", oracleFactoryAddress);

  console.log("\n📄 更新合约地址配置文件...");
  const configPath = path.join(__dirname, "..", "deployed-contracts.json");
  let config = {};
  
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  }
  
  config.contracts = config.contracts || {};
  config.contracts.RevenueTokenOracleFactory = oracleFactoryAddress;
  config.oracleDeployedAt = new Date().toISOString();
  config.functionsRouter = functionsRouter;
  
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log("✅ 配置已保存到:", configPath);

  const envPath = path.join(__dirname, "..", ".env");
  let envContent = "";
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf8");
  }

  const updateEnvVar = (key, value) => {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
  };

  updateEnvVar("VITE_ORACLE_FACTORY_ADDRESS", oracleFactoryAddress);
  updateEnvVar("VITE_FUNCTIONS_ROUTER", functionsRouter);

  fs.writeFileSync(envPath, envContent);
  console.log("✅ 环境变量已更新\n");

  console.log("🎉 部署完成！\n");
  console.log("📋 Oracle 合约地址汇总:");
  console.log("   - RevenueTokenOracleFactory:", oracleFactoryAddress);
  console.log("   - Chainlink Functions Router:", functionsRouter);
  console.log("   - NFT Contract (existing):", nftAddress);
  console.log("\n📝 下一步:");
  console.log("   1. 在 Etherscan 上验证合约:");
  console.log(`      npx hardhat verify --network sepolia ${oracleFactoryAddress} ${nftAddress} ${functionsRouter}`);
  console.log("   2. 重启应用以加载新的合约地址");
  console.log("   3. 在前端实现 Oracle 配置 UI");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 部署失败:", error);
    process.exit(1);
  });
