const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 开始部署 RevShare 智能合约到 Sepolia 测试网...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 部署账户:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("💰 账户余额:", hre.ethers.formatEther(balance), "ETH\n");

  console.log("1️⃣  部署 RevenueAssetNFT 合约...");
  const RevenueAssetNFT = await hre.ethers.getContractFactory("RevenueAssetNFT");
  const nftContract = await RevenueAssetNFT.deploy();
  await nftContract.waitForDeployment();
  const nftAddress = await nftContract.getAddress();
  console.log("✅ RevenueAssetNFT 部署成功:", nftAddress);

  console.log("\n2️⃣  部署 RevenueTokenFactory 合约...");
  const RevenueTokenFactory = await hre.ethers.getContractFactory("RevenueTokenFactory");
  const factoryContract = await RevenueTokenFactory.deploy(nftAddress);
  await factoryContract.waitForDeployment();
  const factoryAddress = await factoryContract.getAddress();
  console.log("✅ RevenueTokenFactory 部署成功:", factoryAddress);

  console.log("\n3️⃣  授权工厂合约...");
  const setFactoryTx = await nftContract.setFactoryContract(factoryAddress);
  await setFactoryTx.wait();
  console.log("✅ 工厂合约授权成功");

  console.log("\n📄 生成合约地址配置文件...");
  const config = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    contracts: {
      RevenueAssetNFT: nftAddress,
      RevenueTokenFactory: factoryAddress,
    },
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
  };

  const configPath = path.join(__dirname, "..", "deployed-contracts.json");
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

  updateEnvVar("VITE_NFT_CONTRACT_ADDRESS", nftAddress);
  updateEnvVar("VITE_FACTORY_CONTRACT_ADDRESS", factoryAddress);

  fs.writeFileSync(envPath, envContent);
  console.log("✅ 环境变量已更新\n");

  console.log("🎉 部署完成！\n");
  console.log("📋 合约地址汇总:");
  console.log("   - RevenueAssetNFT:", nftAddress);
  console.log("   - RevenueTokenFactory:", factoryAddress);
  console.log("\n📝 下一步:");
  console.log("   1. 在 Etherscan 上验证合约:");
  console.log(`      npx hardhat verify --network sepolia ${nftAddress}`);
  console.log(`      npx hardhat verify --network sepolia ${factoryAddress} ${nftAddress}`);
  console.log("   2. 重启应用以加载新的合约地址");
  console.log("   3. 在 MetaMask 中切换到 Sepolia 测试网");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 部署失败:", error);
    process.exit(1);
  });
