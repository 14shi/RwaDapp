/**
 * Chainlink Functions & Automation Constants
 * 
 * These constants are used for Oracle configuration in the RevShare application.
 * All values are for Sepolia testnet.
 */

export const CHAINLINK_CONSTANTS = {
  // Sepolia Testnet Configuration
  SEPOLIA: {
    // DON ID for Chainlink Functions
    DON_ID_STRING: 'fun-ethereum-sepolia-1',
    DON_ID_HEX: '0x66756e2d657468657265756d2d7365706f6c69612d3100000000000000000000',
    
    // Router address (already in deployed-contracts.json)
    FUNCTIONS_ROUTER: '0xb83E47C2bC239B3bf370bc41e1459A34b41238D0',
    
    // LINK token address
    LINK_TOKEN: '0x779877A7B0D9E8603169DdbD7836e478b4624789',
    
    // Recommended gas limits
    GAS_LIMIT: {
      FUNCTIONS_REQUEST: 300000,
      AUTOMATION_UPKEEP: 500000,
    },
    
    // Recommended intervals (seconds)
    INTERVALS: {
      TEST: 300,      // 5 minutes for testing
      PRODUCTION: 3600, // 1 hour for production
    }
  }
} as const;

/**
 * Sample Revenue Source scripts for testing
 */
export const SAMPLE_REVENUE_SOURCES = {
  // Simple test script: returns fixed revenue
  FIXED_REVENUE: `// 固定收益测试脚本
const fixedRevenue = 1000000000000000000; // 1 ETH
return Functions.encodeUint256(fixedRevenue);`,

  // Random revenue for testing
  RANDOM_REVENUE: `// 随机收益测试脚本
const minRevenue = 0.1 * 1e18;
const maxRevenue = 1.0 * 1e18;
const randomRevenue = Math.floor(Math.random() * (maxRevenue - minRevenue) + minRevenue);
return Functions.encodeUint256(randomRevenue);`,

  // Spotify example (requires API token in secrets)
  SPOTIFY_EXAMPLE: `// Spotify播放收益示例（需要API密钥）
const trackId = args[0];

const response = await Functions.makeHttpRequest({
  url: \`https://api.spotify.com/v1/tracks/\${trackId}\`,
  headers: { 'Authorization': \`Bearer \${secrets.spotifyToken}\` }
});

if (response.error) throw Error("Spotify API请求失败");

const popularity = response.data.popularity || 0;
const revenue = Math.round(popularity * 0.01 * 1e18);
return Functions.encodeUint256(revenue);`,

  // Token Terminal example
  TOKEN_TERMINAL_EXAMPLE: `// Token Terminal收益数据
const metric = args[0] || "revenue";
const project = args[1] || "uniswap";

const response = await Functions.makeHttpRequest({
  url: \`https://api.tokenterminal.com/v2/metrics/\${metric}/projects/\${project}\`,
  headers: { 'Authorization': \`Bearer \${secrets.apiKey}\` }
});

if (response.error) throw Error("API请求失败");

const revenueValue = response.data.value || 0;
return Functions.encodeUint256(Math.round(revenueValue * 1e18));`
} as const;

/**
 * Helper function to get default DON ID for current network
 */
export function getDefaultDonId(chainId: number): string {
  // Currently only Sepolia is supported
  if (chainId === 11155111) {
    return CHAINLINK_CONSTANTS.SEPOLIA.DON_ID_STRING;
  }
  
  throw new Error(`Chainlink Functions not supported on chainId ${chainId}`);
}

/**
 * Helper function to get recommended update interval
 */
export function getRecommendedInterval(isProduction: boolean = false): number {
  return isProduction 
    ? CHAINLINK_CONSTANTS.SEPOLIA.INTERVALS.PRODUCTION
    : CHAINLINK_CONSTANTS.SEPOLIA.INTERVALS.TEST;
}
