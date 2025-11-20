/**
 * Chainlink Functions: Layer 2 - 收益数据获取
 * 
 * 功能：从外部 API 获取资产收益数据
 * 触发：Chainlink Automation 定期调用
 * 返回：收益金额（wei 单位）
 */

// ========== 配置加载 ==========
// 从 DON Secrets 获取环境变量（如果没有 secrets，默认使用测试模式）
const MODE = (typeof secrets !== 'undefined' && secrets.ENVIRONMENT) 
  ? secrets.ENVIRONMENT 
  : "test"; // "test" 或 "production"

const API_CONFIG = {
  test: {
    spotify: { revenue: "mock" },
    patent: { revenue: "mock" },
    gpu: { revenue: "mock" }
  },
  production: {
    spotify: { revenue: "https://api.spotify.com/v1/analytics/tracks" },
    patent: { revenue: "https://api.uspto.gov/licensing" },
    gpu: { revenue: "https://gpu-marketplace.example.com/earnings" }
  }
};

// ========== 工具函数 ==========

function log(message) {
  if (MODE === "test") {
    console.log(`[FetchRevenue] ${message}`);
  }
}

function parseArgs(args) {
  // args 格式: [assetType, externalId, lastUpdateTimestamp]
  const assetType = parseInt(args[0]);
  const externalId = args[1];
  const lastUpdate = parseInt(args[2] || 0);
  
  return { assetType, externalId, lastUpdate };
}

/**
 * 生成模拟收益（测试模式）
 * 基于时间和资产 ID 生成可预测的随机收益
 */
function generateMockRevenue(externalId, lastUpdate) {
  // 使用当前天数作为种子
  const currentDay = Math.floor(Date.now() / 86400000);
  const seed = currentDay + parseInt(externalId || "0");
  
  // 生成 0.001 - 0.1 ETH 的随机收益
  const randomFactor = (seed % 100) / 1000; // 0.001 - 0.1
  const revenueETH = randomFactor;
  const revenueWei = Math.floor(revenueETH * 1e18);
  
  log(`Generated mock revenue: ${revenueETH} ETH (${revenueWei} wei)`);
  return revenueWei;
}

/**
 * 转换 USD 到 ETH
 * 使用 Chainlink Price Feed 或固定汇率
 */
function convertUSDtoWei(usdAmount) {
  // 简化：假设 1 ETH = $2000
  const ethPrice = 2000;
  const ethAmount = usdAmount / ethPrice;
  return Math.floor(ethAmount * 1e18);
}

// ========== Spotify 收益获取 ==========

async function fetchSpotifyRevenue(externalId, lastUpdate) {
  const config = API_CONFIG[MODE].spotify;
  
  if (MODE === "test") {
    // 测试模式：生成模拟收益
    log(`Generating mock Spotify revenue for track: ${externalId}`);
    return generateMockRevenue(externalId, lastUpdate);
    
  } else {
    // 生产模式：真实 Spotify Analytics API
    log(`Fetching real Spotify revenue for track: ${externalId}`);
    
    try {
      // 计算查询时间范围（自上次更新以来）
      const now = Date.now();
      const startDate = new Date(lastUpdate * 1000).toISOString();
      const endDate = new Date(now).toISOString();
      
      const response = await Functions.makeHttpRequest({
        url: `${config.revenue}/${externalId}/revenue`,
        method: "GET",
        headers: {
          "Authorization": secrets.SPOTIFY_API_TOKEN
        },
        params: {
          start_date: startDate,
          end_date: endDate
        }
      });
      
      if (response.error) {
        log(`Spotify API Error: ${response.error}`);
        return 0;
      }
      
      // 假设 API 返回 USD 金额
      const revenueUSD = response.data.total_revenue || 0;
      const revenueWei = convertUSDtoWei(revenueUSD);
      
      log(`Spotify revenue: $${revenueUSD} USD = ${revenueWei} wei`);
      return revenueWei;
      
    } catch (error) {
      log(`Exception: ${error.message}`);
      return 0;
    }
  }
}

// ========== USPTO 专利收益获取 ==========

async function fetchPatentRevenue(externalId, lastUpdate) {
  const config = API_CONFIG[MODE].patent;
  
  if (MODE === "test") {
    // 测试模式：固定收益
    log(`Generating mock Patent revenue for number: ${externalId}`);
    
    // 专利收益通常较高，固定 0.05 ETH
    const revenueWei = Math.floor(0.05 * 1e18);
    log(`Mock patent revenue: 0.05 ETH (${revenueWei} wei)`);
    return revenueWei;
    
  } else {
    // 生产模式：专利授权收益 API
    log(`Fetching real Patent revenue for number: ${externalId}`);
    
    try {
      const response = await Functions.makeHttpRequest({
        url: `${config.revenue}/${externalId}/earnings`,
        method: "GET",
        headers: {
          "X-API-Key": secrets.USPTO_API_KEY
        }
      });
      
      if (response.error) {
        log(`Patent API Error: ${response.error}`);
        return 0;
      }
      
      const revenueUSD = response.data.licensing_revenue || 0;
      const revenueWei = convertUSDtoWei(revenueUSD);
      
      log(`Patent revenue: $${revenueUSD} USD = ${revenueWei} wei`);
      return revenueWei;
      
    } catch (error) {
      log(`Exception: ${error.message}`);
      return 0;
    }
  }
}

// ========== GPU 收益获取 ==========

async function fetchGPURevenue(externalId, lastUpdate) {
  const config = API_CONFIG[MODE].gpu;
  
  if (MODE === "test") {
    // 测试模式：基于序列号生成
    log(`Generating mock GPU revenue for serial: ${externalId}`);
    return generateMockRevenue(externalId, lastUpdate);
    
  } else {
    // 生产模式：GPU 租赁市场 API
    log(`Fetching real GPU revenue for serial: ${externalId}`);
    
    try {
      const response = await Functions.makeHttpRequest({
        url: `${config.revenue}/${externalId}`,
        method: "GET",
        headers: {
          "X-API-Key": secrets.GPU_API_KEY
        },
        params: {
          since: lastUpdate
        }
      });
      
      if (response.error) {
        log(`GPU API Error: ${response.error}`);
        return 0;
      }
      
      // 假设 API 直接返回 ETH wei 单位
      const revenueWei = parseInt(response.data.earnings_wei || "0");
      
      log(`GPU revenue: ${revenueWei} wei`);
      return revenueWei;
      
    } catch (error) {
      log(`Exception: ${error.message}`);
      return 0;
    }
  }
}

// ========== 主获取逻辑 ==========

async function fetchRevenue(assetType, externalId, lastUpdate) {
  log(`Fetching revenue - Type: ${assetType}, ID: ${externalId}, Mode: ${MODE}`);
  
  let revenueWei = 0;
  
  switch (parseInt(assetType)) {
    case 0: // Spotify
      revenueWei = await fetchSpotifyRevenue(externalId, lastUpdate);
      break;
      
    case 1: // Patent
      revenueWei = await fetchPatentRevenue(externalId, lastUpdate);
      break;
      
    case 2: // GPU
      revenueWei = await fetchGPURevenue(externalId, lastUpdate);
      break;
      
    default:
      log(`Unknown asset type: ${assetType}`);
      revenueWei = 0;
  }
  
  return revenueWei;
}

// ========== Chainlink Functions 入口 ==========

const { assetType, externalId, lastUpdate } = parseArgs(args);

const revenueWei = await fetchRevenue(assetType, externalId, lastUpdate);

log(`Final revenue: ${revenueWei} wei`);

// 返回 uint256 编码结果
return Functions.encodeUint256(revenueWei);