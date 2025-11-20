/**
 * Chainlink Functions API 配置
 * 支持测试模式和生产模式切换
 */

// API 配置对象
const API_CONFIG = {
  // ========== 测试模式 ==========
  // 使用公开测试 API，无需真实密钥
  test: {
    // Spotify 歌曲验证（使用 JSONPlaceholder 模拟）
    spotify: {
      verify: "https://jsonplaceholder.typicode.com/users",
      revenue: "mock" // 使用算法生成
    },
    
    // USPTO 专利验证（使用 PublicAPIs）
    patent: {
      verify: "https://api.publicapis.org/entries",
      revenue: "mock"
    },
    
    // GPU 硬件验证（Mock 验证）
    gpu: {
      verify: "mock",
      revenue: "mock"
    }
  },

  // ========== 生产模式 ==========
  // 使用真实 API，需要配置密钥
  production: {
    // Spotify Web API
    spotify: {
      verify: "https://api.spotify.com/v1/tracks",
      revenue: "https://api.spotify.com/v1/analytics/tracks"
    },
    
    // USPTO Patent API
    patent: {
      verify: "https://api.uspto.gov/patents",
      revenue: "https://api.uspto.gov/licensing"
    },
    
    // GPU 租赁市场 API（示例）
    gpu: {
      verify: "https://gpu-marketplace.example.com/devices",
      revenue: "https://gpu-marketplace.example.com/earnings"
    }
  }
};

// 资产类型枚举
const AssetType = {
  SPOTIFY_SONG: 0,
  USPTO_PATENT: 1,
  GPU_HARDWARE: 2,
  CUSTOM: 3
};

// 资产类型名称映射
const AssetTypeName = {
  0: "spotify",
  1: "patent",
  2: "gpu",
  3: "custom"
};

// 导出配置
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    API_CONFIG,
    AssetType,
    AssetTypeName
  };
}