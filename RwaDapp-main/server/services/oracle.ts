import { Wallet, Contract, JsonRpcProvider, parseEther, formatEther } from 'ethers';
import { getProvider, ORACLE_FACTORY_ADDRESS, SEPOLIA_CHAIN_ID } from '../providers/eth';
import type { RevenueAsset } from '@shared/schema';

/**
 * Oracle ERC20 ABI - 包含Chainlink Automation函数
 * 注意：确保ABI与智能合约完全匹配
 */
const ORACLE_TOKEN_ABI = [
  // 基础ERC20
  'function name() public view returns (string)',
  'function symbol() public view returns (string)',
  'function totalSupply() public view returns (uint256)',
  'function owner() public view returns (address)',
  'function balanceOf(address account) public view returns (uint256)',
  
  // Chainlink配置
  'function setChainlinkConfig(bytes32 _donId, uint64 _subscriptionId, uint32 _gasLimit) external',
  'function setRevenueSource(string calldata source) external',
  'function setAutoRevenueEnabled(bool enabled) external',
  
  // 查询
  'function donId() public view returns (bytes32)',
  'function subscriptionId() public view returns (uint64)',
  'function gasLimit() public view returns (uint32)',
  'function autoRevenueEnabled() public view returns (bool)',
  'function revenueSource() public view returns (string)',
  'function updateInterval() public view returns (uint256)',
  'function lastRevenueUpdate() public view returns (uint256)',
  
  // Oracle功能
  'function updateRevenue(uint256 newRevenue) external',
  'function checkUpkeep(bytes calldata) external view returns (bool upkeepNeeded, bytes memory)',
  'function performUpkeep(bytes calldata) external',
  
  // Revenue相关
  'function operatingRevenue() public view returns (uint256)',
  'function operatingDistributed() public view returns (uint256)',
  'function getPendingOperatingRevenue() public view returns (uint256)',
];

let cachedSigner: Wallet | null = null;
let cachedProvider: any = null;

// 添加调试配置
const DEBUG_MODE = process.env.ORACLE_DEBUG === 'true';

function debugLog(message: string, ...args: any[]) {
  if (DEBUG_MODE) {
    console.log(`[Oracle Debug] ${new Date().toISOString()} - ${message}`, ...args);
  }
}

/**
 * 获取后端Signer（使用PRIVATE_KEY）
 * 增强版：包含详细的状态检查和错误处理
 */
export async function getSigner(): Promise<Wallet | null> {
  const privateKey = process.env.PRIVATE_KEY;
  
  if (!privateKey) {
    console.warn('⚠️  PRIVATE_KEY not configured - Oracle functions will run in MVP mode (database only)');
    console.log('   To enable blockchain interaction:');
    console.log('   1. Generate a private key (without 0x prefix)');
    console.log('   2. Set it in environment: PRIVATE_KEY=your_64_char_hex_key');
    console.log('   3. Send test ETH to the wallet address on Sepolia');
    return null;
  }
  
  try {
    // 验证私钥格式
    if (!/^[0-9a-fA-F]{64}$/.test(privateKey)) {
      throw new Error('Invalid private key format. Should be 64 hex characters without 0x prefix');
    }
    
    if (cachedSigner) {
      // 验证缓存的signer是否仍然有效
      try {
        const address = await cachedSigner.getAddress();
        const balance = await cachedProvider.getBalance(address);
        debugLog('Using cached signer', { 
          address: address,
          balance: formatEther(balance) + ' ETH'
        });
        return cachedSigner;
      } catch (error) {
        console.log('🔄 Cached signer invalid, recreating...');
        cachedSigner = null;
        cachedProvider = null;
      }
    }
    
    // 创建新的provider连接
    if (!cachedProvider) {
      console.log('🔗 Connecting to Sepolia network...');
      cachedProvider = await getProvider();
      
      // 验证网络
      const network = await cachedProvider.getNetwork();
      if (network.chainId !== BigInt(SEPOLIA_CHAIN_ID)) {
        throw new Error(`Wrong network! Expected Sepolia (${SEPOLIA_CHAIN_ID}), got ${network.chainId}`);
      }
    }
    
    cachedSigner = new Wallet(privateKey, cachedProvider);
    
    // 获取并显示钱包信息
    const address = await cachedSigner.getAddress();
    const balance = await cachedProvider.getBalance(address);
    const network = await cachedProvider.getNetwork();
    
    console.log('✅ Oracle Backend Signer Initialized');
    console.log('   ├─ Address:', address);
    console.log('   ├─ Balance:', formatEther(balance), 'ETH');
    console.log('   ├─ Network:', network.name, `(chainId: ${network.chainId})`);
    console.log('   └─ Status:', balance > 0 ? 'Ready' : '⚠️  Need ETH for gas fees!');
    
    if (balance === BigInt(0)) {
      console.warn('');
      console.warn('⚠️  WARNING: Wallet has 0 ETH balance!');
      console.warn(`   Please send Sepolia ETH to: ${address}`);
      console.warn('   Get free testnet ETH from: https://sepolia-faucet.pk910.de');
      console.warn('');
    } else if (balance < parseEther('0.01')) {
      console.warn('⚠️  Low balance warning: Less than 0.01 ETH remaining');
    }
    
    return cachedSigner;
  } catch (error) {
    console.error('❌ Failed to create signer:', error instanceof Error ? error.message : 'Unknown error');
    if (error instanceof Error) {
      if (error.message.includes('invalid private key')) {
        console.error('   Please check your PRIVATE_KEY format:');
        console.error('   - Should be 64 hex characters');
        console.error('   - No 0x prefix');
        console.error('   - Example: a1b2c3d4e5f6...  (64 characters total)');
      } else if (error.message.includes('network')) {
        console.error('   Network connection issue. Please check your internet connection.');
      }
    }
    // Reset cache on error
    cachedSigner = null;
    cachedProvider = null;
    return null;
  }
}

/**
 * 获取Oracle Token合约实例
 */
export async function getOracleTokenContract(
  tokenAddress: string,
  useSigner: boolean = true
): Promise<Contract> {
  if (useSigner) {
    const signer = await getSigner();
    if (!signer) {
      throw new Error('Signer not available - PRIVATE_KEY not configured');
    }
    return new Contract(tokenAddress, ORACLE_TOKEN_ABI, signer);
  } else {
    // Reuse cached provider
    if (!cachedProvider) {
      cachedProvider = await getProvider();
    }
    return new Contract(tokenAddress, ORACLE_TOKEN_ABI, cachedProvider);
  }
}

/**
 * 转换DON ID字符串为bytes32
 * 改进版：处理不同格式的输入
 */
function donIdToBytes32(donIdString: string): string {
  debugLog('Converting DON ID to bytes32', { input: donIdString });
  
  // 如果已经是 0x 开头的十六进制，验证并返回
  if (donIdString.startsWith('0x')) {
    const hex = donIdString.slice(2);
    if (hex.length === 64) {
      debugLog('DON ID already in bytes32 format');
      return donIdString;
    }
    // 补齐到64字符
    const padded = '0x' + hex.padEnd(64, '0');
    debugLog('Padded existing hex DON ID', { result: padded });
    return padded;
  }
  
  // 将字符串转换为十六进制并填充到64字符（32字节）
  const hex = Buffer.from(donIdString, 'utf8').toString('hex');
  const result = '0x' + hex.padEnd(64, '0');
  debugLog('Converted DON ID to bytes32', { result });
  return result;
}

/**
 * Oracle服务响应接口
 */
export interface OracleServiceResponse {
  success: boolean;
  mode: 'blockchain' | 'mvp';
  transactionHash?: string;
  message: string;
  error?: string;
}

/**
 * 启用Oracle功能
 * 当前MVP：只更新数据库
 * 完整版：还需调用智能合约的setChainlinkConfig（需要先配置）
 */
export async function enableOracleService(
  asset: RevenueAsset
): Promise<OracleServiceResponse> {
  const signer = await getSigner();
  
  if (!signer) {
    return {
      success: true,
      mode: 'mvp',
      message: 'Oracle已在数据库中启用（MVP模式）。配置PRIVATE_KEY后可启用链上功能。',
    };
  }
  
  if (!asset.erc20ContractAddress) {
    return {
      success: false,
      mode: 'mvp',
      message: '资产尚未分割化，无法启用Oracle',
    };
  }
  
  // 链上启用暂不需要单独交易，配置时一并处理
  return {
    success: true,
    mode: 'blockchain',
    message: 'Oracle已启用，请配置Chainlink参数以激活自动化',
  };
}

/**
 * 配置Oracle参数（调用智能合约）
 * 增强版：包含详细调试信息和错误处理
 */
export async function configureOracleService(
  asset: RevenueAsset,
  config: {
    subscriptionId: string;
    donId: string;
    updateInterval: number;
    revenueSource: string;
  }
): Promise<OracleServiceResponse> {
  console.log('\n📋 Starting Oracle Configuration');
  console.log('   Asset:', asset.name);
  console.log('   Token Address:', asset.erc20ContractAddress);
  console.log('   Config:', {
    subscriptionId: config.subscriptionId,
    donId: config.donId,
    updateInterval: config.updateInterval,
    revenueSourceLength: config.revenueSource?.length || 0
  });
  
  const signer = await getSigner();
  
  if (!signer) {
    return {
      success: true,
      mode: 'mvp',
      message: 'Oracle配置已保存到数据库（MVP模式）。配置PRIVATE_KEY后可同步到区块链。',
    };
  }
  
  if (!asset.erc20ContractAddress) {
    return {
      success: false,
      mode: 'mvp',
      message: '资产尚未分割化，无法配置Oracle',
    };
  }
  
  try {
    // 获取合约实例
    const tokenContract = await getOracleTokenContract(asset.erc20ContractAddress, true);
    
    // 验证合约状态
    console.log('🔍 Verifying contract state...');
    try {
      const owner = await tokenContract.owner();
      const signerAddress = await signer.getAddress();
      console.log('   Contract Owner:', owner);
      console.log('   Signer Address:', signerAddress);
      
      if (owner.toLowerCase() !== signerAddress.toLowerCase()) {
        console.warn('⚠️  Warning: Signer is not the contract owner!');
        console.warn('   Some operations may fail if only owner can call them.');
      }
    } catch (verifyError) {
      console.warn('⚠️  Could not verify contract ownership:', verifyError);
    }
    
    // 转换参数
    const donIdBytes = donIdToBytes32(config.donId);
    const subId = BigInt(config.subscriptionId); // 使用BigInt确保精度
    const gasLimit = 300000; // 默认gas限制
    
    console.log('📝 Prepared parameters:');
    console.log('   DON ID (bytes32):', donIdBytes);
    console.log('   Subscription ID:', subId.toString());
    console.log('   Gas Limit:', gasLimit);
    
    // Step 1: 设置Chainlink配置
    console.log('\n🚀 Step 1: Setting Chainlink configuration...');
    
    let configReceipt: any;
    
    try {
      // 估算Gas
      const estimatedGas = await tokenContract.setChainlinkConfig.estimateGas(
        donIdBytes,
        subId,
        gasLimit
      );
      console.log('   Estimated gas:', estimatedGas.toString());
      
      // 发送交易
      const configTx = await tokenContract.setChainlinkConfig(
        donIdBytes,
        subId,
        gasLimit,
        {
          gasLimit: estimatedGas * BigInt(120) / BigInt(100) // 增加20%的gas余量
        }
      );
      
      console.log('   ✅ Transaction sent:', configTx.hash);
      console.log('   ⏳ Waiting for confirmation...');
      
      configReceipt = await configTx.wait();
      console.log('   ✅ Confirmed in block:', configReceipt.blockNumber);
      console.log('   Gas used:', configReceipt.gasUsed.toString());
      
    } catch (configError: any) {
      console.error('   ❌ Failed to set Chainlink config:', configError);
      
      // 解析具体错误
      if (configError.reason) {
        console.error('   Error reason:', configError.reason);
      }
      if (configError.code === 'CALL_EXCEPTION') {
        console.error('   Contract call failed. Check if contract method exists and parameters are correct.');
      }
      
      throw configError;
    }
    
    // Step 2: 设置Revenue Source
    if (config.revenueSource) {
      console.log('\n🚀 Step 2: Setting revenue source...');
      console.log('   Source length:', config.revenueSource.length, 'characters');
      
      try {
        const sourceTx = await tokenContract.setRevenueSource(config.revenueSource);
        console.log('   ✅ Transaction sent:', sourceTx.hash);
        
        const sourceReceipt = await sourceTx.wait();
        console.log('   ✅ Confirmed in block:', sourceReceipt.blockNumber);
      } catch (sourceError: any) {
        console.error('   ⚠️  Failed to set revenue source:', sourceError);
        // 不要因为这个失败而中断整个流程
      }
    }
    
    // Step 3: 验证配置
    console.log('\n🔍 Verifying on-chain configuration...');
    try {
      const [savedSubId, savedDonId, savedSource] = await Promise.all([
        tokenContract.subscriptionId(),
        tokenContract.donId(),
        tokenContract.revenueSource().catch(() => ''),
      ]);
      
      console.log('   Saved Subscription ID:', savedSubId.toString());
      console.log('   Saved DON ID:', savedDonId);
      console.log('   Saved Revenue Source:', savedSource ? 'Yes' : 'No');
    } catch (verifyError) {
      console.warn('   ⚠️  Could not verify configuration:', verifyError);
    }
    
    console.log('\n✅ Oracle configuration complete!');
    
    return {
      success: true,
      mode: 'blockchain',
      transactionHash: configReceipt.hash,
      message: `Oracle配置成功！交易: ${configReceipt.hash.substring(0, 10)}...`,
    };
    
  } catch (error: any) {
    console.error('\n❌ Oracle configuration failed:', error);
    
    // 详细错误分析
    let errorMessage = '配置失败: ';
    let errorDetails = error.message || 'Unknown error';
    
    if (error.code === 'INSUFFICIENT_FUNDS') {
      errorMessage = 'Gas费不足，请确保账户有足够的Sepolia ETH';
    } else if (error.code === 'NONCE_EXPIRED') {
      errorMessage = 'Nonce错误，请稍后重试';
    } else if (error.code === 'CALL_EXCEPTION') {
      errorMessage = '合约调用失败，可能是ABI不匹配或参数错误';
      if (error.reason) {
        errorDetails = error.reason;
      }
    } else if (error.message?.includes('bad result from backend')) {
      errorMessage = 'RPC节点返回错误，可能是方法不存在';
    } else if (error.message?.includes('BAD_DATA')) {
      errorMessage = '数据格式错误，请检查合约ABI是否正确';
    }
    
    return {
      success: false,
      mode: 'blockchain',
      message: errorMessage,
      error: errorDetails,
    };
  }
}

/**
 * 切换Oracle自动化开关（调用智能合约）
 */
export async function toggleOracleAutomationService(
  asset: RevenueAsset,
  enabled: boolean
): Promise<OracleServiceResponse> {
  const signer = await getSigner();
  
  if (!signer) {
    return {
      success: true,
      mode: 'mvp',
      message: `自动化${enabled ? '已启用' : '已禁用'}（MVP模式）。配置PRIVATE_KEY后可同步到区块链。`,
    };
  }
  
  if (!asset.erc20ContractAddress) {
    return {
      success: false,
      mode: 'mvp',
      message: '资产尚未分割化，无法切换自动化',
    };
  }
  
  try {
    const tokenContract = await getOracleTokenContract(asset.erc20ContractAddress, true);
    
    console.log(`切换Oracle自动化: ${enabled ? '启用' : '禁用'}`);
    
    const tx = await tokenContract.setAutoRevenueEnabled(enabled);
    console.log(`自动化切换交易已发送: ${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`自动化切换已确认 (block ${receipt.blockNumber})`);
    
    return {
      success: true,
      mode: 'blockchain',
      transactionHash: tx.hash,
      message: `自动化${enabled ? '已启用' : '已禁用'}！交易: ${tx.hash.substring(0, 10)}...`,
    };
  } catch (error: any) {
    console.error('切换自动化失败:', error);
    
    let errorMessage = '切换失败';
    if (error.message?.includes('insufficient funds')) {
      errorMessage = 'Gas费不足，请确保账户有足够的Sepolia ETH';
    } else if (error.message?.includes('execution reverted')) {
      errorMessage = '合约执行失败，请先配置Oracle参数';
    }
    
    return {
      success: false,
      mode: 'blockchain',
      message: errorMessage,
      error: error.message,
    };
  }
}

/**
 * 查询链上Oracle配置状态
 * 增强版：包含更多调试信息
 */
export async function getOracleConfigFromChain(
  tokenAddress: string
): Promise<{
  subscriptionId?: number;
  donId?: string;
  autoEnabled?: boolean;
  revenueSource?: string;
  gasLimit?: number;
  updateInterval?: number;
  lastRevenueUpdate?: number;
  operatingRevenue?: string;
  owner?: string;
} | null> {
  try {
    debugLog('Fetching Oracle config from chain', { tokenAddress });
    const tokenContract = await getOracleTokenContract(tokenAddress, false);
    
    const [
      subId, 
      donIdBytes, 
      autoEnabled, 
      source,
      gasLimit,
      updateInterval,
      lastRevenueUpdate,
      operatingRevenue,
      owner
    ] = await Promise.all([
      tokenContract.subscriptionId().catch(() => 0),
      tokenContract.donId().catch(() => '0x'),
      tokenContract.autoRevenueEnabled().catch(() => false),
      tokenContract.revenueSource().catch(() => ''),
      tokenContract.gasLimit().catch(() => 0),
      tokenContract.updateInterval().catch(() => 0),
      tokenContract.lastRevenueUpdate().catch(() => 0),
      tokenContract.operatingRevenue().catch(() => BigInt(0)),
      tokenContract.owner().catch(() => '0x0'),
    ]);
    
    // 转换bytes32回字符串
    const donIdString = donIdBytes.startsWith('0x') 
      ? Buffer.from(donIdBytes.slice(2), 'hex')
          .toString('utf8')
          .replace(/\0/g, '') // 移除填充的null字符
      : '';
    
    const result = {
      subscriptionId: Number(subId),
      donId: donIdString,
      autoEnabled,
      revenueSource: source,
      gasLimit: Number(gasLimit),
      updateInterval: Number(updateInterval),
      lastRevenueUpdate: Number(lastRevenueUpdate),
      operatingRevenue: formatEther(operatingRevenue),
      owner,
    };
    
    debugLog('Oracle config fetched', result);
    return result;
  } catch (error) {
    console.error('查询链上Oracle配置失败:', error);
    return null;
  }
}

/**
 * Oracle调试信息接口
 */
export interface OracleDebugInfo {
  walletStatus: {
    configured: boolean;
    address?: string;
    balance?: string;
    network?: string;
    chainId?: number;
  };
  contractStatus?: {
    address: string;
    owner?: string;
    isOwner?: boolean;
    config?: any;
  };
  error?: string;
}

/**
 * 获取Oracle调试信息
 * 用于诊断Oracle服务状态
 */
export async function getOracleDebugInfo(tokenAddress?: string): Promise<OracleDebugInfo> {
  const debugInfo: OracleDebugInfo = {
    walletStatus: {
      configured: false
    }
  };
  
  try {
    // 检查钱包配置
    const signer = await getSigner();
    
    if (!signer) {
      debugInfo.walletStatus.configured = false;
      debugInfo.error = 'PRIVATE_KEY not configured';
      return debugInfo;
    }
    
    // 获取钱包信息
    const address = await signer.getAddress();
    const provider = signer.provider;
    if (!provider) {
      debugInfo.error = 'Provider not available';
      return debugInfo;
    }
    const balance = await provider.getBalance(address);
    const network = await provider.getNetwork();
    
    debugInfo.walletStatus = {
      configured: true,
      address,
      balance: formatEther(balance),
      network: network.name,
      chainId: Number(network.chainId)
    };
    
    // 如果提供了token地址，检查合约状态
    if (tokenAddress) {
      try {
        const config = await getOracleConfigFromChain(tokenAddress);
        const signerAddress = address.toLowerCase();
        
        debugInfo.contractStatus = {
          address: tokenAddress,
          owner: config?.owner,
          isOwner: config?.owner?.toLowerCase() === signerAddress,
          config
        };
      } catch (contractError) {
        debugInfo.contractStatus = {
          address: tokenAddress,
          owner: 'Error fetching contract data'
        };
      }
    }
    
  } catch (error) {
    debugInfo.error = error instanceof Error ? error.message : 'Unknown error';
  }
  
  return debugInfo;
}

/**
 * 手动触发Oracle更新
 * 用于测试和调试
 */
export async function triggerOracleUpdate(
  tokenAddress: string,
  newRevenue: string
): Promise<OracleServiceResponse> {
  console.log('\n🔄 Manual Oracle Update Triggered');
  console.log('   Token:', tokenAddress);
  console.log('   New Revenue:', newRevenue, 'ETH');
  
  const signer = await getSigner();
  
  if (!signer) {
    return {
      success: false,
      mode: 'mvp',
      message: 'PRIVATE_KEY not configured - cannot update on-chain',
    };
  }
  
  try {
    const tokenContract = await getOracleTokenContract(tokenAddress, true);
    
    // 转换revenue为wei
    const revenueWei = parseEther(newRevenue);
    
    console.log('📊 Updating revenue on-chain...');
    console.log('   Revenue (wei):', revenueWei.toString());
    
    // 调用updateRevenue
    const tx = await tokenContract.updateRevenue(revenueWei);
    console.log('   ✅ Transaction sent:', tx.hash);
    
    const receipt = await tx.wait();
    console.log('   ✅ Confirmed in block:', receipt.blockNumber);
    
    return {
      success: true,
      mode: 'blockchain',
      transactionHash: tx.hash,
      message: `Revenue updated to ${newRevenue} ETH`,
    };
  } catch (error: any) {
    console.error('❌ Failed to update revenue:', error);
    
    let errorMessage = 'Update failed: ';
    if (error.code === 'INSUFFICIENT_FUNDS') {
      errorMessage = 'Insufficient gas funds';
    } else if (error.message?.includes('Only owner')) {
      errorMessage = 'Only contract owner can update revenue';
    } else {
      errorMessage += error.message || 'Unknown error';
    }
    
    return {
      success: false,
      mode: 'blockchain',
      message: errorMessage,
      error: error.message,
    };
  }
}

/**
 * 检查Oracle自动化是否需要执行
 */
export async function checkOracleUpkeep(
  tokenAddress: string
): Promise<{ upkeepNeeded: boolean; performData?: string }> {
  try {
    const tokenContract = await getOracleTokenContract(tokenAddress, false);
    
    // 调用checkUpkeep查看是否需要更新
    const [upkeepNeeded, performData] = await tokenContract.checkUpkeep('0x');
    
    debugLog('Upkeep check result', { tokenAddress, upkeepNeeded });
    
    return {
      upkeepNeeded,
      performData: performData || '0x'
    };
  } catch (error) {
    console.error('Failed to check upkeep:', error);
    return { upkeepNeeded: false };
  }
}

/**
 * 执行Oracle自动化更新
 */
export async function performOracleUpkeep(
  tokenAddress: string,
  performData: string = '0x'
): Promise<OracleServiceResponse> {
  const signer = await getSigner();
  
  if (!signer) {
    return {
      success: false,
      mode: 'mvp',
      message: 'PRIVATE_KEY not configured',
    };
  }
  
  try {
    const tokenContract = await getOracleTokenContract(tokenAddress, true);
    
    console.log('🤖 Performing Oracle upkeep...');
    const tx = await tokenContract.performUpkeep(performData);
    console.log('   Transaction sent:', tx.hash);
    
    const receipt = await tx.wait();
    console.log('   Confirmed in block:', receipt.blockNumber);
    
    return {
      success: true,
      mode: 'blockchain',
      transactionHash: tx.hash,
      message: 'Upkeep performed successfully',
    };
  } catch (error: any) {
    console.error('Failed to perform upkeep:', error);
    return {
      success: false,
      mode: 'blockchain',
      message: 'Upkeep failed',
      error: error.message,
    };
  }
}
