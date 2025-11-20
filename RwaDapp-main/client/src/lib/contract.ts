import { BrowserProvider, Contract, parseEther, formatEther, JsonRpcProvider } from 'ethers';

// Contract addresses deployed on Sepolia testnet
// Read from environment variables, fall back to empty string for Demo mode
// Set VITE_NFT_CONTRACT_ADDRESS and VITE_ORACLE_FACTORY_ADDRESS in .env file
// Default addresses (from server/providers/eth.ts) - used if env vars not set
const DEFAULT_NFT_CONTRACT = '0xbc6a1736772386109D764E17d1080Fb76cCc4c48';
const DEFAULT_ORACLE_FACTORY = '0x639ACBe3c067840aeD22cf1F9DCab0F78CF7e848';
const DEFAULT_STANDARD_FACTORY = '0x58d6417535ae4F6EeA529850458ceF810D0ADbdf';

export const NFT_CONTRACT_ADDRESS = import.meta.env.VITE_NFT_CONTRACT_ADDRESS || DEFAULT_NFT_CONTRACT;
export const ORACLE_FACTORY_ADDRESS = import.meta.env.VITE_ORACLE_FACTORY_ADDRESS || DEFAULT_ORACLE_FACTORY;

// Also support standard factory (non-oracle version) if needed
export const STANDARD_FACTORY_ADDRESS = import.meta.env.VITE_STANDARD_FACTORY_ADDRESS || DEFAULT_STANDARD_FACTORY;

// Check if using real contracts or demo mode
// Use demo mode only if explicitly set to empty string in env
const IS_DEMO_MODE = import.meta.env.VITE_USE_DEMO_MODE === 'true' || 
                     (import.meta.env.VITE_NFT_CONTRACT_ADDRESS === '' && import.meta.env.VITE_ORACLE_FACTORY_ADDRESS === '');
const IS_USING_REAL_CONTRACTS = !IS_DEMO_MODE && Boolean(NFT_CONTRACT_ADDRESS && (ORACLE_FACTORY_ADDRESS || STANDARD_FACTORY_ADDRESS));

// Only log in development environment
if (import.meta.env.DEV) {
  console.log('Contract Mode:', IS_USING_REAL_CONTRACTS ? 'REAL BLOCKCHAIN' : 'DEMO MODE');
  if (IS_USING_REAL_CONTRACTS) {
    console.log('NFT Contract:', NFT_CONTRACT_ADDRESS);
    console.log('Oracle Factory Contract:', ORACLE_FACTORY_ADDRESS);
  }
}

// Complete ABIs from compiled contracts (Oracle版本)
const NFT_ABI = [
  'function mintRevenueAsset(string name, string assetType, string description, string imageUrl, uint256 estimatedValue) public returns (uint256)',
  'function requestAssetVerification(uint8 assetType, string externalId, string ownerProof, string name, string description, string imageUrl, uint256 estimatedValue) external returns (bytes32)',
  'function setFragmentalized(uint256 tokenId, address erc20Token) external',
  'function getAssetMetadata(uint256 tokenId) external view returns (tuple(string name, uint8 assetType, string description, string imageUrl, uint256 estimatedValue, address creator, bool isFragmentalized, address erc20TokenAddress, bool isVerified, string externalId))',
  'function getVerificationRequest(bytes32 requestId) external view returns (tuple(uint8 assetType, string externalId, string ownerProof, string name, string description, string imageUrl, uint256 estimatedValue, address requester, bool fulfilled, uint256 tokenId))',
  'function ownerOf(uint256 tokenId) public view returns (address)',
  'function getTotalSupply() external view returns (uint256)',
  'event AssetMinted(uint256 indexed tokenId, string name, string assetType, address indexed creator)',
  'event AssetFragmentalized(uint256 indexed tokenId, address indexed erc20Token)',
  'event VerificationRequested(bytes32 indexed requestId, address indexed requester, uint8 assetType, string externalId)',
  'event VerificationFulfilled(bytes32 indexed requestId, uint256 indexed tokenId, bool verified)',
];

const ORACLE_FACTORY_ABI = [
  'function nftContract() external view returns (address)',
  'function createOracleRevenueToken(uint256 nftTokenId, string tokenName, string tokenSymbol, uint256 totalSupply, uint256 pricePerToken) external returns (address)',
  'function getTokenByNFT(uint256 nftTokenId) external view returns (address)',
  'function getNFTByToken(address tokenAddress) external view returns (uint256)',
  'function nftToToken(uint256) external view returns (address)',
  'function tokenToNft(address) external view returns (uint256)',
  'function getFunctionsRouter() external view returns (address)',
];

// V2: Updated function names for operating revenue (Oracle版本)
const ORACLE_ERC20_ABI = [
  'function name() public view returns (string)',
  'function symbol() public view returns (string)',
  'function totalSupply() public view returns (uint256)',
  'function balanceOf(address account) public view returns (uint256)',
  'function purchaseTokens(uint256 tokenAmount) external payable',
  'function recordOperatingRevenue() external payable',
  'function distributeOperatingRevenue() external',
  'function withdrawOperatingRevenue() external',
  'function getHolderOperatingRevenue(address holder) external view returns (uint256)',
  'function pricePerToken() public view returns (uint256)',
  'function operatingRevenue() public view returns (uint256)',
  'function operatingDistributed() public view returns (uint256)',
  'function getPendingOperatingRevenue() public view returns (uint256)',
  'function saleProceeds() public view returns (uint256)',
  'function withdrawSaleProceeds() external',
];

// 旧版合约 ABI (非Oracle版本)
const OLD_ERC20_ABI = [
  'function name() public view returns (string)',
  'function symbol() public view returns (string)',
  'function totalSupply() public view returns (uint256)',
  'function balanceOf(address account) public view returns (uint256)',
  'function purchaseTokens(uint256 tokenAmount) external payable',
  'function recordRevenue() external payable',
  'function distributeRevenue() external',
  'function withdrawRevenue() external',
  'function getHolderRevenue(address holder) external view returns (uint256)',
  'function pricePerToken() public view returns (uint256)',
  'function totalRevenue() public view returns (uint256)',
  'function distributedRevenue() public view returns (uint256)',
  'function withdrawSaleProceeds() external',
];

// 向后兼容的 ERC20_ABI 指向 Oracle 版本
const ERC20_ABI = ORACLE_ERC20_ABI;

export interface MintNFTResult {
  tokenId: string;
  transactionHash: string;
  contractAddress?: string;
  receipt?: any;
}

export interface VerificationRequestResult {
  requestId: string;
  transactionHash: string;
  contractAddress: string;
}

export interface VerificationStatus {
  assetType: number;
  externalId: string;
  ownerProof: string;
  name: string;
  description: string;
  imageUrl: string;
  estimatedValue: string;
  requester: string;
  fulfilled: boolean;
  tokenId: string;
}

export interface FractionalizeResult {
  erc20ContractAddress?: string;
  erc20Address?: string;
  transactionHash: string;
  receipt?: any;
}

export interface PurchaseTokensResult {
  transactionHash: string;
  amount: number;
  receipt: any; // TransactionReceipt from ethers
}

export interface DistributeRevenueResult {
  transactionHash: string;
  totalAmount: string;
  perTokenAmount: string;
  receipt: any; // TransactionReceipt from ethers
}

export interface RecordRevenueResult {
  transactionHash: string;
  receipt: any; // TransactionReceipt from ethers
}

// Get provider and signer with automatic network switching
async function getProviderAndSigner() {
  if (typeof window.ethereum === 'undefined') {
    throw new Error('请安装 MetaMask 钱包');
  }

  const provider = new BrowserProvider(window.ethereum);
  const network = await provider.getNetwork();

  // Automatically switch to Sepolia if not on correct network
  if (Number(network.chainId) !== 11155111) {
    try {
      const { ensureCorrectNetwork } = await import('./switchNetwork');
      await ensureCorrectNetwork();
      // Wait a bit for network switch to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      // Re-fetch network after switch
      const newNetwork = await provider.getNetwork();
      if (Number(newNetwork.chainId) !== 11155111) {
        throw new Error('请切换到 Sepolia 测试网');
      }
    } catch (error: any) {
      if (error.message?.includes('用户取消')) {
        throw new Error('用户取消了网络切换，请手动切换到 Sepolia 测试网');
      }
      throw new Error('请切换到 Sepolia 测试网: ' + (error.message || '网络切换失败'));
    }
  }

  const signer = await provider.getSigner();
  return { provider, signer };
}

// Convert asset type string to enum value
function getAssetTypeValue(assetType: string): number {
  const types: Record<string, number> = {
    'SPOTIFY_SONG': 0,
    'PATENT': 1,
    'GPU': 2,
    'OTHER': 3,
    'song': 0,
    'patent': 1,
    'gpu': 2,
    'other': 3
  };
  return types[assetType] || 3;
}

// Get read-only provider (for reading from blockchain without signing)
async function getReadOnlyProvider() {
  // Try to use injected provider first
  if (typeof window.ethereum !== 'undefined') {
    const provider = new BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();
    if (Number(network.chainId) === 11155111) {
      return provider;
    }
  }
  
  // Fallback to public RPC
  return new JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
}

// 检测合约是否是 Oracle 版本（V2合约）
// V2合约使用operatingRevenue()，旧版使用totalRevenue()
async function isOracleContract(contractAddress: string): Promise<boolean> {
  try {
    const provider = await getReadOnlyProvider();
    
    // Try to call V2 method first (more reliable)
    try {
      const v2Contract = new Contract(contractAddress, ['function operatingRevenue() public view returns (uint256)'], provider);
      await v2Contract.operatingRevenue();
      return true; // V2/Oracle contract
    } catch (v2Error) {
      // Try old version method
      try {
        const oldContract = new Contract(contractAddress, ['function totalRevenue() public view returns (uint256)'], provider);
        await oldContract.totalRevenue();
        return false; // Old version contract
      } catch (oldError) {
        // If both fail, assume V2 (default for new deployments)
        console.warn(`Could not determine contract version for ${contractAddress}, assuming V2`);
        return true;
      }
    }
  } catch (error) {
    // On error, default to V2 (safer assumption for new contracts)
    console.warn(`Error detecting contract version for ${contractAddress}:`, error);
    return true;
  }
}

// Mint NFT for revenue asset
export async function mintNFT(
  name: string,
  assetType: string,
  description: string,
  imageUrl: string,
  estimatedValue: string
): Promise<MintNFTResult> {
  if (IS_USING_REAL_CONTRACTS) {
    const { signer } = await getProviderAndSigner();
    const nftContract = new Contract(NFT_CONTRACT_ADDRESS, NFT_ABI, signer);
    
    const estimatedValueWei = parseEther(estimatedValue);
    const tx = await nftContract.mintRevenueAsset(
      name,
      assetType,
      description,
      imageUrl,
      estimatedValueWei
    );
    
    const receipt = await tx.wait();
    
    // Extract tokenId from AssetMinted event
    const mintEvent = receipt.logs.find((log: any) => {
      try {
        const parsed = nftContract.interface.parseLog(log);
        return parsed?.name === 'AssetMinted';
      } catch {
        return false;
      }
    });
    
    const tokenId = mintEvent ? 
      nftContract.interface.parseLog(mintEvent)?.args[0].toString() || 'unknown' : 
      'unknown';
    
    return {
      tokenId,
      transactionHash: receipt.hash,
      contractAddress: NFT_CONTRACT_ADDRESS
    };
  } else {
    // Demo mode implementation
    return {
      tokenId: Math.floor(Math.random() * 1000000).toString(),
      transactionHash: '0x' + Math.random().toString(36).substring(2, 15),
      contractAddress: '0x' + Math.random().toString(36).substring(2, 15)
    };
  }
}

// Request asset verification (Chainlink)
export async function requestAssetVerification(
  assetType: string,
  externalId: string,
  ownerProof: string,
  name: string,
  description: string,
  imageUrl: string,
  estimatedValue: string
): Promise<VerificationRequestResult> {
  if (IS_USING_REAL_CONTRACTS) {
    const { signer } = await getProviderAndSigner();
    const nftContract = new Contract(NFT_CONTRACT_ADDRESS, NFT_ABI, signer);
    
    const assetTypeValue = getAssetTypeValue(assetType);
    const estimatedValueWei = parseEther(estimatedValue);
    
    const tx = await nftContract.requestAssetVerification(
      assetTypeValue,
      externalId,
      ownerProof,
      name,
      description,
      imageUrl,
      estimatedValueWei
    );
    
    const receipt = await tx.wait();
    
    // Extract requestId from VerificationRequested event
    const requestEvent = receipt.logs.find((log: any) => {
      try {
        const parsed = nftContract.interface.parseLog(log);
        return parsed?.name === 'VerificationRequested';
      } catch {
        return false;
      }
    });
    
    const requestId = requestEvent ? 
      nftContract.interface.parseLog(requestEvent)?.args[0] || 'unknown' : 
      'unknown';
    
    return {
      requestId,
      transactionHash: receipt.hash,
      contractAddress: NFT_CONTRACT_ADDRESS
    };
  } else {
    // Demo mode
    return {
      requestId: '0x' + Math.random().toString(36).substring(2, 15),
      transactionHash: '0x' + Math.random().toString(36).substring(2, 15),
      contractAddress: '0x' + Math.random().toString(36).substring(2, 15)
    };
  }
}

// Check verification status
export async function checkVerificationStatus(requestId: string): Promise<VerificationStatus | null> {
  if (IS_USING_REAL_CONTRACTS) {
    const provider = await getReadOnlyProvider();
    const nftContract = new Contract(NFT_CONTRACT_ADDRESS, NFT_ABI, provider);
    
    try {
      const result = await nftContract.getVerificationRequest(requestId);
      
      return {
        assetType: Number(result.assetType),
        externalId: result.externalId,
        ownerProof: result.ownerProof,
        name: result.name,
        description: result.description,
        imageUrl: result.imageUrl,
        estimatedValue: formatEther(result.estimatedValue),
        requester: result.requester,
        fulfilled: result.fulfilled,
        tokenId: result.tokenId.toString()
      };
    } catch (error) {
      // Silently fail and return null
      return null;
    }
  } else {
    // Demo mode
    return {
      assetType: 0,
      externalId: 'demo-external-id',
      ownerProof: 'demo-proof',
      name: 'Demo Asset',
      description: 'Demo description',
      imageUrl: 'https://example.com/image.jpg',
      estimatedValue: '1000',
      requester: '0x' + Math.random().toString(36).substring(2, 15),
      fulfilled: Math.random() > 0.5,
      tokenId: Math.floor(Math.random() * 1000).toString()
    };
  }
}

// Get NFT metadata
export async function getNFTMetadata(tokenId: string): Promise<any | null> {
  if (IS_USING_REAL_CONTRACTS) {
    const provider = await getReadOnlyProvider();
    const nftContract = new Contract(NFT_CONTRACT_ADDRESS, NFT_ABI, provider);
    
    try {
      const result = await nftContract.getAssetMetadata(tokenId);
      
      return {
        name: result.name,
        assetType: Number(result.assetType),
        description: result.description,
        imageUrl: result.imageUrl,
        estimatedValue: formatEther(result.estimatedValue),
        creator: result.creator,
        isFragmentalized: result.isFragmentalized,
        erc20TokenAddress: result.erc20TokenAddress,
        isVerified: result.isVerified,
        externalId: result.externalId
      };
    } catch (error) {
      // Silently fail and return null
      return null;
    }
  } else {
    // Demo mode
    return {
      name: 'Demo NFT',
      assetType: 0,
      description: 'This is a demo NFT',
      imageUrl: 'https://example.com/demo.jpg',
      estimatedValue: '1000',
      creator: '0x' + Math.random().toString(36).substring(2, 15),
      isFragmentalized: false,
      erc20TokenAddress: '0x0000000000000000000000000000000000000000',
      isVerified: false,
      externalId: ''
    };
  }
}

// Fractionalize NFT into ERC-20 tokens (Oracle version)
export async function fractionalizeNFT(
  nftTokenId: string,
  tokenName: string,
  tokenSymbol: string,
  totalSupply: string, // Already in tokens (e.g. "100" for 100 tokens)
  pricePerToken: string // In ETH (e.g. "0.0001")
): Promise<FractionalizeResult> {
  if (IS_USING_REAL_CONTRACTS) {
    const { signer } = await getProviderAndSigner();
    
    // Factory creates the token contract
    const factoryContract = new Contract(ORACLE_FACTORY_ADDRESS, ORACLE_FACTORY_ABI, signer);
    
    // Convert totalSupply to wei (token amount to wei)
    const totalSupplyWei = parseEther(totalSupply);
    // Convert price to wei (ETH to wei)
    const pricePerTokenWei = parseEther(pricePerToken);
    
    const tx = await factoryContract.createOracleRevenueToken(
      nftTokenId,
      tokenName,
      tokenSymbol,
      totalSupplyWei,
      pricePerTokenWei
    );
    
    const receipt = await tx.wait();
    
    // Get ERC20 token address from factory mapping
    // Note: Factory contract already calls setFragmentalized on the NFT contract
    const erc20Address = await factoryContract.getTokenByNFT(nftTokenId);
    
    if (!erc20Address || erc20Address === '0x0000000000000000000000000000000000000000') {
      throw new Error('Failed to get ERC20 token address from factory');
    }
    
    return {
      erc20ContractAddress: erc20Address,
      transactionHash: receipt.hash
    };
  } else {
    // Demo mode
    return {
      erc20ContractAddress: '0x' + Math.random().toString(36).substring(2, 15),
      transactionHash: '0x' + Math.random().toString(36).substring(2, 15)
    };
  }
}

// Purchase tokens
export async function purchaseTokens(
  erc20ContractAddress: string, 
  tokenAmount: string, // Already in tokens (e.g. "10" for 10 tokens)  
  pricePerToken: string, // In ETH (e.g. "0.0001")
  assetId?: string // Optional asset ID for Demo mode backend update
): Promise<PurchaseTokensResult> {
  if (IS_USING_REAL_CONTRACTS) {
    const { signer } = await getProviderAndSigner();
    const isOracle = await isOracleContract(erc20ContractAddress);
    const tokenContract = new Contract(erc20ContractAddress, isOracle ? ORACLE_ERC20_ABI : OLD_ERC20_ABI, signer);
    
    // Convert token amount to wei (tokens to wei representation)
    const tokenAmountWei = parseEther(tokenAmount);
    
    // Calculate total ETH needed (token amount * price per token)
    const totalEthWei = parseEther((parseFloat(tokenAmount) * parseFloat(pricePerToken)).toFixed(18));
    
    const tx = await tokenContract.purchaseTokens(tokenAmountWei, {
      value: totalEthWei
    });
    
    const receipt = await tx.wait();
    
    return {
      transactionHash: receipt.hash,
      amount: parseFloat(tokenAmount),
      receipt: receipt
    };
  } else {
    // Demo mode - also update backend
    const transactionHash = '0x' + Math.random().toString(36).substring(2, 15);
    
    // If assetId is provided, update the backend in Demo mode
    if (assetId) {
      try {
        // Use a demo wallet address in Demo mode
        const demoAddress = '0xDemo' + Math.random().toString(36).substring(2, 15).padEnd(38, '0');
        
        const response = await fetch(`/api/assets/${assetId}/purchase-tokens`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            holderAddress: demoAddress,
            tokenAmount: tokenAmount
          }),
        });
        
        if (!response.ok) {
          throw new Error('Failed to update backend in Demo mode');
        }
      } catch (error) {
        // Re-throw error to show to user
        throw error;
      }
    }
    
    return {
      transactionHash: transactionHash,
      amount: parseFloat(tokenAmount),
      receipt: {}
    };
  }
}

// Record revenue to smart contract
export async function recordRevenue(
  erc20ContractAddress: string,
  revenueAmount: string // In ETH
): Promise<RecordRevenueResult> {
  if (IS_USING_REAL_CONTRACTS) {
    const { signer } = await getProviderAndSigner();
    const isOracle = await isOracleContract(erc20ContractAddress);
    const tokenContract = new Contract(erc20ContractAddress, isOracle ? ORACLE_ERC20_ABI : OLD_ERC20_ABI, signer);
    
    const revenueWei = parseEther(revenueAmount);
    
    // 根据合约版本调用不同的方法
    const methodName = isOracle ? 'recordOperatingRevenue' : 'recordRevenue';
    const tx = await tokenContract[methodName]({
      value: revenueWei
    });
    
    const receipt = await tx.wait();
    
    return {
      transactionHash: receipt.hash,
      receipt: receipt
    };
  } else {
    // Demo mode
    return {
      transactionHash: '0x' + Math.random().toString(36).substring(2, 15),
      receipt: {}
    };
  }
}

// Distribute revenue to token holders
export async function distributeRevenue(erc20ContractAddress: string): Promise<DistributeRevenueResult> {
  if (IS_USING_REAL_CONTRACTS) {
    const { signer } = await getProviderAndSigner();
    const provider = await getReadOnlyProvider();
    const isOracle = await isOracleContract(erc20ContractAddress);
    const tokenContract = new Contract(erc20ContractAddress, isOracle ? ORACLE_ERC20_ABI : OLD_ERC20_ABI, signer);
    const readContract = new Contract(erc20ContractAddress, isOracle ? ORACLE_ERC20_ABI : OLD_ERC20_ABI, provider);
    
    // Get pending revenue before distribution
    let pendingRevenue = '0';
    
    if (isOracle) {
      try {
        const pending = await readContract.getPendingOperatingRevenue();
        pendingRevenue = formatEther(pending);
      } catch (error) {
        // Silently catch error and use default value
      }
    } else {
      // 旧版合约计算待分配收益
      try {
        const total = await readContract.totalRevenue();
        const distributed = await readContract.distributedRevenue();
        const pending = total - distributed;
        pendingRevenue = formatEther(pending);
      } catch (error) {
        // Silently catch error and use default value
      }
    }
    
    // 根据合约版本调用不同的方法
    const methodName = isOracle ? 'distributeOperatingRevenue' : 'distributeRevenue';
    const tx = await tokenContract[methodName]();
    const receipt = await tx.wait();
    
    // Calculate per token amount (approximate)
    const totalSupply = await readContract.totalSupply();
    const perTokenAmount = parseFloat(pendingRevenue) / parseFloat(formatEther(totalSupply));
    
    return {
      transactionHash: receipt.hash,
      totalAmount: pendingRevenue,
      perTokenAmount: perTokenAmount.toFixed(8),
      receipt: receipt
    };
  } else {
    // Demo mode - need to get asset ID from ERC20 address
    try {
      // First, find the asset by ERC20 contract address
      const response = await fetch('/api/assets');
      const assets = await response.json();
      const asset = assets.find((a: any) => 
        a.erc20ContractAddress?.toLowerCase() === erc20ContractAddress.toLowerCase()
      );
      
      if (!asset) {
        throw new Error('Asset not found for this token contract');
      }

      // Call the distribute-revenue API
      const distributeResponse = await fetch(`/api/assets/${asset.id}/distribute-revenue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transactionHash: '0xdemo' + Math.random().toString(36).substring(2, 15)
        })
      });

      if (!distributeResponse.ok) {
        const error = await distributeResponse.json();
        throw new Error(error.error || 'Failed to distribute revenue');
      }

      const result = await distributeResponse.json();
      
      return {
        transactionHash: result.distribution?.transactionHash || '0xdemo',
        totalAmount: result.distribution?.totalAmount || '0',
        perTokenAmount: result.distribution?.perTokenAmount || '0',
        receipt: {}
      };
    } catch (error) {
      // Re-throw error to show to user
      throw error;
    }
  }
}

// Withdraw revenue
export async function withdrawRevenue(erc20ContractAddress: string): Promise<string> {
  if (IS_USING_REAL_CONTRACTS) {
    const { signer } = await getProviderAndSigner();
    const isOracle = await isOracleContract(erc20ContractAddress);
    const tokenContract = new Contract(erc20ContractAddress, isOracle ? ORACLE_ERC20_ABI : OLD_ERC20_ABI, signer);
    
    // 根据合约版本调用不同的方法
    const methodName = isOracle ? 'withdrawOperatingRevenue' : 'withdrawRevenue';
    const tx = await tokenContract[methodName]();
    const receipt = await tx.wait();
    
    return receipt.hash;
  } else {
    // Demo mode
    return '0x' + Math.random().toString(36).substring(2, 15);
  }
}

// Get token balance
export async function getTokenBalance(erc20ContractAddress: string, holderAddress: string): Promise<string> {
  try {
    const provider = await getReadOnlyProvider();
    const isOracle = await isOracleContract(erc20ContractAddress);
    const tokenContract = new Contract(erc20ContractAddress, isOracle ? ORACLE_ERC20_ABI : OLD_ERC20_ABI, provider);
    
    const balance = await tokenContract.balanceOf(holderAddress);
    return formatEther(balance);
  } catch (error: any) {
    // Return default value on error
    return '0';
  }
}

// Get available revenue for a token holder
export async function getAvailableRevenue(erc20ContractAddress: string, holderAddress: string): Promise<string> {
  try {
    const provider = await getReadOnlyProvider();
    const isOracle = await isOracleContract(erc20ContractAddress);
    const tokenContract = new Contract(erc20ContractAddress, isOracle ? ORACLE_ERC20_ABI : OLD_ERC20_ABI, provider);
    
    // 根据合约版本调用不同的方法
    if (isOracle) {
      const revenue = await tokenContract.getHolderOperatingRevenue(holderAddress);
      return formatEther(revenue);
    } else {
      // 旧版合约方法
      try {
        const revenue = await tokenContract.getHolderRevenue(holderAddress);
        return formatEther(revenue);
      } catch {
        // 如果旧版也没有这个方法，返回 0
        return '0';
      }
    }
  } catch (error: any) {
    // Return default value on error
    return '0';
  }
}

// Withdraw sale proceeds (owner only)
export async function withdrawSaleProceeds(erc20ContractAddress: string): Promise<string> {
  if (IS_USING_REAL_CONTRACTS) {
    const { signer } = await getProviderAndSigner();
    const isOracle = await isOracleContract(erc20ContractAddress);
    const tokenContract = new Contract(erc20ContractAddress, isOracle ? ORACLE_ERC20_ABI : OLD_ERC20_ABI, signer);
    
    const tx = await tokenContract.withdrawSaleProceeds();
    const receipt = await tx.wait();
    
    return receipt.hash;
  } else {
    // Demo mode
    return '0x' + Math.random().toString(36).substring(2, 15);
  }
}

// Get sale proceeds
export async function getSaleProceeds(erc20ContractAddress: string): Promise<string> {
  if (IS_USING_REAL_CONTRACTS) {
    const provider = await getReadOnlyProvider();
    const isOracle = await isOracleContract(erc20ContractAddress);
    const tokenContract = new Contract(erc20ContractAddress, isOracle ? ORACLE_ERC20_ABI : OLD_ERC20_ABI, provider);
    
    const proceeds = await tokenContract.saleProceeds();
    return formatEther(proceeds);
  } else {
    // Demo mode
    return (Math.random() * 10).toFixed(4);
  }
}


// Get verification status (stub implementation)
export async function getVerificationStatus(requestId: string): Promise<VerificationStatus> {
  // TODO: 实现真正的验证状态查询
  return {
    assetType: 3, // Default to OTHER
    externalId: '',
    ownerProof: '',
    name: '',
    description: '',
    imageUrl: '',
    estimatedValue: '0',
    requester: '',
    fulfilled: false,
    tokenId: ''
  };
}


// Mint Revenue Asset NFT
export async function mintRevenueAssetNFT(
  name: string,
  assetType: string,
  description: string,
  imageUrl: string,
  estimatedValue: string
): Promise<MintNFTResult> {
  if (IS_USING_REAL_CONTRACTS) {
    const { signer } = await getProviderAndSigner();
    const nftContract = new Contract(NFT_CONTRACT_ADDRESS, NFT_ABI, signer);
    const estimatedValueWei = parseEther(estimatedValue);
    
    const tx = await nftContract.mintRevenueAsset(
      name,
      assetType,
      description,
      imageUrl,
      estimatedValueWei
    );
    
    const receipt = await tx.wait();
    
    // Extract tokenId from events
    const transferEvent = receipt.logs.find((log: any) => {
      try {
        const parsed = nftContract.interface.parseLog({
          topics: log.topics,
          data: log.data
        });
        return parsed && parsed.name === 'Transfer';
      } catch {
        return false;
      }
    });
    
    const tokenId = transferEvent ? 
      nftContract.interface.parseLog({
        topics: transferEvent.topics,
        data: transferEvent.data
      })?.args?.tokenId?.toString() : '0';
    
    return {
      tokenId,
      transactionHash: receipt.hash,
      receipt
    };
  } else {
    // Demo mode
    return {
      tokenId: Math.floor(Math.random() * 10000).toString(),
      transactionHash: '0x' + Math.random().toString(36).substring(2, 15),
      receipt: {}
    };
  }
}

// Check if NFT is fractionalized
export async function isNFTFragmentalized(
  nftTokenId: string
): Promise<boolean> {
  if (IS_USING_REAL_CONTRACTS) {
    const provider = await getReadOnlyProvider();
    const factoryContract = new Contract(ORACLE_FACTORY_ADDRESS, ORACLE_FACTORY_ABI, provider);
    
    try {
      const tokenAddress = await factoryContract.getTokenByNFT(NFT_CONTRACT_ADDRESS, nftTokenId);
      return tokenAddress !== '0x0000000000000000000000000000000000000000';
    } catch {
      return false;
    }
  } else {
    // Demo mode - randomly return true or false based on tokenId
    return parseInt(nftTokenId) % 2 === 0;
  }
}

// Fractionalize Asset
export async function fractionalizeAsset(
  nftTokenId: string,
  tokenName: string,
  tokenSymbol: string,
  totalSupply: number,
  pricePerToken: string
): Promise<FractionalizeResult> {
  if (IS_USING_REAL_CONTRACTS) {
    const { signer } = await getProviderAndSigner();
    const factoryContract = new Contract(ORACLE_FACTORY_ADDRESS, ORACLE_FACTORY_ABI, signer);
    
    const totalSupplyWei = parseEther(totalSupply.toString());
    const pricePerTokenWei = parseEther(pricePerToken);
    
    const tx = await factoryContract.createRevenueToken(
      NFT_CONTRACT_ADDRESS,
      nftTokenId,
      tokenName,
      tokenSymbol,
      totalSupplyWei,
      pricePerTokenWei
    );
    
    const receipt = await tx.wait();
    
    // Extract ERC20 address from events
    const creationEvent = receipt.logs.find((log: any) => {
      try {
        const parsed = factoryContract.interface.parseLog({
          topics: log.topics,
          data: log.data
        });
        return parsed && parsed.name === 'RevenueTokenCreated';
      } catch {
        return false;
      }
    });
    
    const erc20Address = creationEvent ? 
      factoryContract.interface.parseLog({
        topics: creationEvent.topics,
        data: creationEvent.data
      })?.args?.tokenAddress : '0x0';
    
    return {
      erc20Address,
      transactionHash: receipt.hash,
      receipt
    };
  } else {
    // Demo mode
    return {
      erc20Address: '0x' + Math.random().toString(36).substring(2, 42),
      transactionHash: '0x' + Math.random().toString(36).substring(2, 15),
      receipt: {}
    };
  }
}