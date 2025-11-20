import { JsonRpcProvider, WebSocketProvider, Contract } from 'ethers';

// Contract addresses deployed on Sepolia testnet
// Oracle版本合约（使用mintRevenueAsset直接铸造，跳过Chainlink验证）
export const NFT_CONTRACT_ADDRESS = '0xbc6a1736772386109D764E17d1080Fb76cCc4c48'; // Oracle合约（2025-11-08）
export const FACTORY_CONTRACT_ADDRESS = '0x58d6417535ae4F6EeA529850458ceF810D0ADbdf'; // FINAL V2 Factory (2025-10-29 最终版)
export const ORACLE_FACTORY_ADDRESS = '0x639ACBe3c067840aeD22cf1F9DCab0F78CF7e848'; // RevenueTokenOracleFactory (2025-11-08)
export const FUNCTIONS_ROUTER = '0xb83E47C2bC239B3bf370bc41e1459A34b41238D0'; // Chainlink Functions Router (Sepolia)
export const SEPOLIA_CHAIN_ID = 11155111;

// ABIs for contracts
export const NFT_ABI = [
  'function mintRevenueAsset(string name, string assetType, string description, string imageUrl, uint256 estimatedValue) public returns (uint256)',
  'function requestAssetVerification(uint8 assetType, string externalId, string ownerProof, string name, string description, string imageUrl, uint256 estimatedValue) external returns (bytes32)',
  'function setFragmentalized(uint256 tokenId, address erc20Token) external',
  'function getAssetMetadata(uint256 tokenId) external view returns (tuple(string name, uint8 assetType, string description, string imageUrl, uint256 estimatedValue, address creator, bool isFragmentalized, address erc20TokenAddress, bool isVerified, string externalId))',
  'function getVerificationRequest(bytes32 requestId) external view returns (tuple(uint8 assetType, string externalId, string ownerProof, string name, string description, string imageUrl, uint256 estimatedValue, address requester, bool fulfilled, uint256 tokenId))',
  'function ownerOf(uint256 tokenId) public view returns (address)',
  'function getTotalSupply() external view returns (uint256)',
  'function factoryContract() public view returns (address)',
  'function setFactoryContract(address _factory) external',
  'event AssetMinted(uint256 indexed tokenId, string name, string assetType, address indexed creator)',
  'event AssetFragmentalized(uint256 indexed tokenId, address indexed erc20Token)',
  'event VerificationRequested(bytes32 indexed requestId, address indexed requester, uint8 assetType, string externalId)',
  'event VerificationFulfilled(bytes32 indexed requestId, uint256 indexed tokenId, bool verified)',
];

export const FACTORY_ABI = [
  'function nftContract() external view returns (address)',
  'function createRevenueToken(uint256 nftTokenId, string tokenName, string tokenSymbol, uint256 totalSupply, uint256 pricePerToken) external returns (address)',
  'function getTokenByNFT(uint256 nftTokenId) external view returns (address)',
  'function getNFTByToken(address tokenAddress) external view returns (uint256)',
  'function nftToToken(uint256) external view returns (address)',
  'function tokenToNft(address) external view returns (uint256)',
  'event TokenCreated(uint256 indexed nftTokenId, address indexed tokenAddress, string tokenName, string tokenSymbol, uint256 totalSupply)',
];

export const ORACLE_FACTORY_ABI = [
  'function nftContract() external view returns (address)',
  'function functionsRouter() external view returns (address)',
  'function createOracleRevenueToken(uint256 nftTokenId, string tokenName, string tokenSymbol, uint256 totalSupply, uint256 pricePerToken) external returns (address)',
  'function getTokenByNFT(uint256 nftTokenId) external view returns (address)',
  'function getNFTByToken(address tokenAddress) external view returns (uint256)',
  'function getFunctionsRouter() external view returns (address)',
  'function nftToToken(uint256) external view returns (address)',
  'function tokenToNft(address) external view returns (uint256)',
  'event OracleTokenCreated(uint256 indexed nftTokenId, address indexed tokenAddress, string name, string symbol, uint256 totalSupply, address router)',
];

export const ERC20_ABI = [
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
  'function owner() public view returns (address)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event TokensPurchased(address indexed buyer, uint256 amount, uint256 cost)',
  'event OperatingRevenueRecorded(uint256 amount)',
  'event OperatingRevenueDistributed(uint256 amount)',
  'event OperatingRevenueWithdrawn(address indexed holder, uint256 amount)',
];

// Oracle ERC20 ABI (extends base ERC20 with Chainlink Automation)
export const ORACLE_ERC20_ABI = [
  ...ERC20_ABI,
  'function setChainlinkConfig(uint64 subscriptionId, bytes32 donId, string source, uint32 updateInterval) external',
  'function enableAutomation(bool enabled) external',
  'function checkUpkeep(bytes calldata checkData) external view returns (bool upkeepNeeded, bytes memory performData)',
  'function performUpkeep(bytes calldata performData) external',
  'function getAutomationConfig() external view returns (uint64 subscriptionId, bytes32 donId, string memory source, uint32 updateInterval, uint256 lastUpdate, bool automationEnabled)',
  'event ChainlinkConfigSet(uint64 subscriptionId, bytes32 donId, uint32 updateInterval)',
  'event AutomationToggled(bool enabled)',
  'event AutomatedRevenueRequested(bytes32 indexed requestId, uint256 timestamp)',
  'event AutomatedRevenueDistributed(uint256 amount, uint256 timestamp)',
];

// Public RPC endpoints for Sepolia (fallback chain)
const SEPOLIA_RPC_URLS = [
  'https://ethereum-sepolia-rpc.publicnode.com', // 最稳定的公共节点
  'https://sepolia.gateway.tenderly.co',
  'https://rpc.sepolia.org',
  'https://eth-sepolia.public.blastapi.io',
  'https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161', // Infura 公共端点
];

// WebSocket URLs for event listening
const SEPOLIA_WS_URLS = [
  'wss://ethereum-sepolia-rpc.publicnode.com',
];

let cachedProvider: JsonRpcProvider | null = null;
let cachedWsProvider: WebSocketProvider | null = null;

/**
 * Get a read-only JSON-RPC provider for Sepolia with retry logic
 * Uses caching to avoid creating multiple providers
 */
export async function getProvider(maxRetries = 3): Promise<JsonRpcProvider> {
  if (cachedProvider) {
    try {
      // Test if provider is still alive
      await cachedProvider.getBlockNumber();
      return cachedProvider;
    } catch (error) {
      console.log('Cached provider failed, recreating...');
      cachedProvider = null;
    }
  }

  // Try each RPC URL with exponential backoff retry
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    for (const rpcUrl of SEPOLIA_RPC_URLS) {
      try {
        const provider = new JsonRpcProvider(rpcUrl);
        
        // Test the connection with a timeout
        await Promise.race([
          provider.getBlockNumber(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]);
        
        console.log(`Connected to Sepolia RPC: ${rpcUrl} (attempt ${attempt + 1}/${maxRetries})`);
        cachedProvider = provider;
        return provider;
      } catch (error) {
        console.log(`Failed to connect to ${rpcUrl}, trying next...`);
        continue;
      }
    }
    
    // If not the last attempt, wait before retrying
    if (attempt < maxRetries - 1) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000); // Max 10s
      console.log(`All RPC endpoints failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error(`Failed to connect to any Sepolia RPC endpoint after ${maxRetries} attempts`);
}

/**
 * Get a WebSocket provider for event listening
 * Handles reconnection and error recovery with automatic retry
 */
export async function getWebSocketProvider(): Promise<WebSocketProvider> {
  if (cachedWsProvider) {
    try {
      // Test if still connected
      await cachedWsProvider.getBlockNumber();
      return cachedWsProvider;
    } catch (error) {
      console.log('Cached WebSocket provider failed, reconnecting...');
      cachedWsProvider = null;
    }
  }

  for (const wsUrl of SEPOLIA_WS_URLS) {
    try {
      const provider = new WebSocketProvider(wsUrl);
      
      // Test connection
      await Promise.race([
        provider.getBlockNumber(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
      ]);

      // Set up automatic reconnection handlers
      provider.on('error', (error) => {
        console.error('WebSocket error:', error);
        cachedWsProvider = null;
        // Attempt to reconnect after a delay
        setTimeout(async () => {
          console.log('Attempting WebSocket reconnection...');
          try {
            await getWebSocketProvider();
          } catch (err) {
            console.error('WebSocket reconnection failed:', err);
          }
        }, 5000);
      });

      provider.on('close', () => {
        console.warn('WebSocket connection closed');
        cachedWsProvider = null;
        // Attempt to reconnect after a delay
        setTimeout(async () => {
          console.log('Attempting WebSocket reconnection...');
          try {
            await getWebSocketProvider();
          } catch (err) {
            console.error('WebSocket reconnection failed:', err);
          }
        }, 5000);
      });

      console.log(`Connected to Sepolia WebSocket: ${wsUrl}`);
      cachedWsProvider = provider;
      return provider;
    } catch (error) {
      console.log(`Failed to connect WebSocket ${wsUrl}, trying next...`);
      continue;
    }
  }

  // Fallback to polling with JsonRpcProvider
  console.warn('WebSocket not available, using JsonRpc polling');
  const httpProvider = await getProvider();
  return httpProvider as unknown as WebSocketProvider;
}

/**
 * Get contract instances
 */
export async function getNFTContract(provider?: JsonRpcProvider | WebSocketProvider) {
  const p = provider || await getProvider();
  return new Contract(NFT_CONTRACT_ADDRESS, NFT_ABI, p);
}

export async function getFactoryContract(provider?: JsonRpcProvider | WebSocketProvider) {
  const p = provider || await getProvider();
  return new Contract(ORACLE_FACTORY_ADDRESS, ORACLE_FACTORY_ABI, p);
}

export async function getERC20Contract(address: string, provider?: JsonRpcProvider | WebSocketProvider) {
  const p = provider || await getProvider();
  return new Contract(address, ERC20_ABI, p);
}

export async function getOracleTokenContract(address: string, provider?: JsonRpcProvider | WebSocketProvider) {
  const p = provider || await getProvider();
  return new Contract(address, ORACLE_ERC20_ABI, p);
}

/**
 * Clean up providers on shutdown
 */
export function cleanupProviders() {
  if (cachedWsProvider) {
    cachedWsProvider.destroy();
    cachedWsProvider = null;
  }
  cachedProvider = null;
}
