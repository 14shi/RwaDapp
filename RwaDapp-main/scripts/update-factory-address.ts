import { ethers } from 'ethers';

/**
 * 更新NFT合约的Factory地址到Oracle Factory
 * 
 * 这个脚本需要：
 * 1. PRIVATE_KEY 环境变量（NFT合约owner的私钥）
 * 2. SEPOLIA_RPC_URL 环境变量
 */

const NFT_CONTRACT = '0xbc6a1736772386109D764E17d1080Fb76cCc4c48';
const OLD_FACTORY = '0x58d6417535ae4F6EeA529850458ceF810D0ADbdf';
const ORACLE_FACTORY = '0x639ACBe3c067840aeD22cf1F9DCab0F78CF7e848';

const NFT_ABI = [
  'function factoryContract() public view returns (address)',
  'function setFactoryContract(address _factory) external',
  'function owner() public view returns (address)',
];

async function main() {
  // 检查环境变量
  const privateKey = process.env.PRIVATE_KEY;
  let rpcUrl = process.env.SEPOLIA_RPC_URL;

  if (!privateKey) {
    console.error('❌ 错误: 需要设置 PRIVATE_KEY 环境变量');
    console.log('\n请设置 PRIVATE_KEY 环境变量（NFT合约owner的私钥）');
    process.exit(1);
  }

  // 如果没有设置RPC URL，使用公共端点
  if (!rpcUrl) {
    console.log('ℹ️  未设置 SEPOLIA_RPC_URL，使用公共RPC端点');
    rpcUrl = 'https://ethereum-sepolia-rpc.publicnode.com';
  }

  console.log('🔧 连接到Sepolia测试网...');
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  
  console.log(`📝 使用账户: ${wallet.address}`);
  
  const nftContract = new ethers.Contract(NFT_CONTRACT, NFT_ABI, wallet);
  
  try {
    // 检查当前配置
    console.log('\n📋 检查当前配置...');
    const currentFactory = await nftContract.factoryContract();
    const owner = await nftContract.owner();
    
    console.log(`NFT合约地址: ${NFT_CONTRACT}`);
    console.log(`NFT合约Owner: ${owner}`);
    console.log(`当前Factory地址: ${currentFactory}`);
    console.log(`目标Oracle Factory: ${ORACLE_FACTORY}`);
    
    // 验证权限
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      console.error(`\n❌ 错误: 当前钱包 (${wallet.address}) 不是NFT合约的owner (${owner})`);
      console.log('请使用NFT合约owner的私钥');
      process.exit(1);
    }
    
    // 检查是否需要更新
    if (currentFactory.toLowerCase() === ORACLE_FACTORY.toLowerCase()) {
      console.log('\n✅ Factory地址已经是Oracle Factory，无需更新');
      return;
    }
    
    if (currentFactory.toLowerCase() !== OLD_FACTORY.toLowerCase() && currentFactory !== ethers.ZeroAddress) {
      console.log(`\n⚠️  警告: 当前Factory地址 ${currentFactory} 既不是旧Factory也不是Oracle Factory`);
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      await new Promise((resolve) => {
        readline.question('是否继续更新? (yes/no): ', (answer: string) => {
          readline.close();
          if (answer.toLowerCase() !== 'yes') {
            console.log('取消操作');
            process.exit(0);
          }
          resolve(null);
        });
      });
    }
    
    // 更新Factory地址
    console.log('\n🚀 开始更新Factory地址...');
    const tx = await nftContract.setFactoryContract(ORACLE_FACTORY);
    console.log(`交易已发送: ${tx.hash}`);
    console.log('等待确认...');
    
    const receipt = await tx.wait();
    console.log(`✅ 交易已确认! Gas used: ${receipt.gasUsed.toString()}`);
    
    // 验证更新
    const newFactory = await nftContract.factoryContract();
    console.log(`\n✅ Factory地址已更新为: ${newFactory}`);
    
    if (newFactory.toLowerCase() === ORACLE_FACTORY.toLowerCase()) {
      console.log('\n🎉 成功! NFT合约现在已授权Oracle Factory进行分割化操作');
      console.log('\n📋 在Etherscan查看交易:');
      console.log(`https://sepolia.etherscan.io/tx/${tx.hash}`);
    } else {
      console.error('\n❌ 错误: Factory地址更新失败');
    }
    
  } catch (error: any) {
    console.error('\n❌ 错误:', error.message);
    if (error.data) {
      console.error('错误数据:', error.data);
    }
    process.exit(1);
  }
}

main().catch(console.error);
