const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// 读取编译后的合约ABI和bytecode
function loadContract(contractName) {
  const artifactPath = path.join(__dirname, '..', 'artifacts', 'contracts', `${contractName}.sol`, `${contractName}.json`);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Contract artifact not found: ${artifactPath}`);
  }
  return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
}

async function main() {
  console.log("🚀 开始部署 Oracle 合约到 Sepolia 测试网...\n");

  // 连接到Sepolia
  const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");
  
  // 使用环境变量中的私钥
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("请在环境变量中设置 PRIVATE_KEY");
  }
  
  const wallet = new ethers.Wallet(privateKey, provider);
  console.log("📝 部署账户:", wallet.address);
  
  const balance = await provider.getBalance(wallet.address);
  console.log("💰 账户余额:", ethers.formatEther(balance), "ETH\n");

  // 已部署的NFT合约地址
  const nftAddress = "0xbc6a1736772386109D764E17d1080Fb76cCc4c48";
  console.log("📍 使用已部署的 NFT 合约:", nftAddress);

  // Chainlink Functions Router for Sepolia
  const functionsRouter = "0xb83E47C2bC239B3bf370bc41e1459A34b41238D0";
  console.log("📍 Chainlink Functions Router:", functionsRouter);

  // 加载合约
  console.log("\n📦 加载合约 artifacts...");
  const OracleFactory = loadContract('RevenueTokenOracleFactory');
  
  // 部署 RevenueTokenOracleFactory
  console.log("\n1️⃣  部署 RevenueTokenOracleFactory 合约...");
  const factory = new ethers.ContractFactory(
    OracleFactory.abi,
    OracleFactory.bytecode,
    wallet
  );
  
  const oracleFactoryContract = await factory.deploy(nftAddress, functionsRouter);
  console.log("⏳ 等待交易确认...");
  await oracleFactoryContract.waitForDeployment();
  
  const oracleFactoryAddress = await oracleFactoryContract.getAddress();
  console.log("✅ RevenueTokenOracleFactory 部署成功:", oracleFactoryAddress);

  // 更新配置文件
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

  console.log("\n🎉 部署完成！\n");
  console.log("📋 Oracle 合约地址汇总:");
  console.log("   - RevenueTokenOracleFactory:", oracleFactoryAddress);
  console.log("   - Chainlink Functions Router:", functionsRouter);
  console.log("   - NFT Contract (existing):", nftAddress);
  console.log("\n📝 下一步:");
  console.log("   1. 在 Etherscan 上验证合约:");
  console.log(`      https://sepolia.etherscan.io/address/${oracleFactoryAddress}#code`);
  console.log("   2. 更新 server/providers/eth.ts 中的合约地址");
  console.log("   3. 重启应用以加载新的合约地址");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 部署失败:", error);
    process.exit(1);
  });
