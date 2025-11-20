/**
 * Chainlink Functions: Layer 1 - 资产所有权验证
 * 
 * 功能：验证用户是否拥有声称的资产
 * 触发：用户申请铸造 NFT 时调用
 * 返回：验证结果（1 = 通过, 0 = 失败）
 */

// ========== 配置加载 ==========
// 从 DON Secrets 获取环境变量（如果没有 secrets，默认使用测试模式）
const MODE = (typeof secrets !== 'undefined' && secrets.ENVIRONMENT) 
  ? secrets.ENVIRONMENT 
  : "test"; // "test" 或 "production"

// API 配置
const API_CONFIG = {
  test: {
    spotify: {
      verify: "https://jsonplaceholder.typicode.com/users"
    },
    patent: {
      verify: "https://api.publicapis.org/entries"
    },
    gpu: {
      verify: "mock"
    }
  },
  production: {
    spotify: {
      verify: "https://api.spotify.com/v1/tracks"
    },
    patent: {
      verify: "https://api.uspto.gov/patents"
    },
    gpu: {
      verify: "https://gpu-marketplace.example.com/devices"
    }
  }
};

// ========== 工具函数 ==========

/**
 * 记录日志（仅测试模式）
 */
function log(message) {
  if (MODE === "test") {
    console.log(`[VerifyAsset] ${message}`);
  }
}

/**
 * 解析请求参数
 * @param {Uint8Array} args - 编码后的参数
 * @returns {Object} 解析后的参数对象
 */
function parseArgs(args) {
  // args 格式: [assetType, externalId, ownerProof]
  // assetType: 可以是字符串 ("Spotify"/"Patent"/"GPU") 或数字 (0/1/2)
  let assetType = args[0];
  
  // 将字符串映射到数字（支持两种格式）
  const assetTypeMap = {
    "Spotify": 0,
    "spotify": 0,
    "Patent": 1,
    "patent": 1,
    "GPU": 2,
    "gpu": 2
  };
  
  // 如果是字符串，映射到数字；如果已经是数字字符串，直接转换
  if (typeof assetType === 'string' && assetTypeMap[assetType] !== undefined) {
    assetType = assetTypeMap[assetType];
  } else {
    assetType = parseInt(assetType);
  }
  
  const externalId = args[1];
  const ownerProof = args[2];
  
  log(`Parsed args - assetType: ${assetType}, externalId: ${externalId}, ownerProof: ${ownerProof}`);
  
  return { assetType, externalId, ownerProof };
}

// ========== Spotify 歌曲验证 ==========

/**
 * 验证 Spotify 歌曲所有权
 */
async function verifySpotify(externalId, ownerProof) {
  const config = API_CONFIG[MODE].spotify;
  
  if (MODE === "test") {
    // 测试模式：使用 JSONPlaceholder
    log(`Testing Spotify verification for ID: ${externalId}`);
    
    try {
      const response = await Functions.makeHttpRequest({
        url: `${config.verify}/${externalId}`,
        method: "GET"
      });
      
      if (response.error) {
        log(`API Error: ${response.error}`);
        return false;
      }
      
      // 简单验证：username 匹配
      const username = response.data.username;
      const isValid = username.toLowerCase() === ownerProof.toLowerCase();
      
      log(`Verification result: ${isValid} (username: ${username})`);
      return isValid;
      
    } catch (error) {
      log(`Exception: ${error.message}`);
      return false;
    }
    
  } else {
    // 生产模式：真实 Spotify API
    log(`Production Spotify verification for track: ${externalId}`);
    
    try {
      const response = await Functions.makeHttpRequest({
        url: `${config.verify}/${externalId}`,
        method: "GET",
        headers: {
          "Authorization": secrets.SPOTIFY_API_TOKEN
        }
      });
      
      if (response.error) {
        log(`Spotify API Error: ${response.error}`);
        return false;
      }
      
      // 验证艺术家名称
      const artists = response.data.artists || [];
      const isValid = artists.some(artist => 
        artist.name.toLowerCase() === ownerProof.toLowerCase()
      );
      
      log(`Verification result: ${isValid}`);
      return isValid;
      
    } catch (error) {
      log(`Exception: ${error.message}`);
      return false;
    }
  }
}

// ========== USPTO 专利验证 ==========

/**
 * 验证 USPTO 专利所有权
 */
async function verifyPatent(externalId, ownerProof) {
  const config = API_CONFIG[MODE].patent;
  
  if (MODE === "test") {
    // 测试模式：使用 PublicAPIs
    log(`Testing Patent verification for ID: ${externalId}`);
    
    try {
      const response = await Functions.makeHttpRequest({
        url: config.verify,
        method: "GET"
      });
      
      if (response.error) {
        log(`API Error: ${response.error}`);
        return false;
      }
      
      // 简单验证：专利号为偶数则通过
      const isValid = parseInt(externalId) % 2 === 0;
      
      log(`Verification result: ${isValid} (mock logic)`);
      return isValid;
      
    } catch (error) {
      log(`Exception: ${error.message}`);
      return false;
    }
    
  } else {
    // 生产模式：真实 USPTO API
    log(`Production Patent verification for number: ${externalId}`);
    
    try {
      const response = await Functions.makeHttpRequest({
        url: `${config.verify}/${externalId}`,
        method: "GET",
        headers: {
          "X-API-Key": secrets.USPTO_API_KEY
        }
      });
      
      if (response.error) {
        log(`USPTO API Error: ${response.error}`);
        return false;
      }
      
      // 验证发明人姓名
      const inventors = response.data.inventors || [];
      const isValid = inventors.some(inventor =>
        inventor.name.toLowerCase().includes(ownerProof.toLowerCase())
      );
      
      log(`Verification result: ${isValid}`);
      return isValid;
      
    } catch (error) {
      log(`Exception: ${error.message}`);
      return false;
    }
  }
}

// ========== GPU 硬件验证 ==========

/**
 * 验证 GPU 硬件所有权
 */
async function verifyGPU(externalId, ownerProof) {
  const config = API_CONFIG[MODE].gpu;
  
  if (MODE === "test") {
    // 测试模式：Mock 验证
    log(`Testing GPU verification for serial: ${externalId}`);
    
    // 简单验证：序列号长度 > 5 且 ownerProof 包含 "@"
    const isValid = externalId.length > 5 && ownerProof.includes("@");
    
    log(`Verification result: ${isValid} (mock logic)`);
    return isValid;
    
  } else {
    // 生产模式：真实数据中心 API
    log(`Production GPU verification for serial: ${externalId}`);
    
    try {
      const response = await Functions.makeHttpRequest({
        url: `${config.verify}/verify`,
        method: "POST",
        headers: {
          "X-API-Key": secrets.GPU_API_KEY,
          "Content-Type": "application/json"
        },
        data: {
          serialNumber: externalId,
          ownerEmail: ownerProof
        }
      });
      
      if (response.error) {
        log(`GPU API Error: ${response.error}`);
        return false;
      }
      
      const isValid = response.data.verified === true;
      
      log(`Verification result: ${isValid}`);
      return isValid;
      
    } catch (error) {
      log(`Exception: ${error.message}`);
      return false;
    }
  }
}

// ========== 主验证逻辑 ==========

/**
 * 主函数：根据资产类型调用相应的验证函数
 */
async function verifyAsset(assetType, externalId, ownerProof) {
  log(`Starting verification - Type: ${assetType}, ID: ${externalId}, Mode: ${MODE}`);
  
  let isValid = false;
  
  switch (parseInt(assetType)) {
    case 0: // Spotify
      isValid = await verifySpotify(externalId, ownerProof);
      break;
      
    case 1: // Patent
      isValid = await verifyPatent(externalId, ownerProof);
      break;
      
    case 2: // GPU
      isValid = await verifyGPU(externalId, ownerProof);
      break;
      
    default:
      log(`Unknown asset type: ${assetType}`);
      isValid = false;
  }
  
  return isValid;
}

// ========== Chainlink Functions 入口 ==========

// 解析参数
const { assetType, externalId, ownerProof } = parseArgs(args);

// 执行验证
const isValid = await verifyAsset(assetType, externalId, ownerProof);

// 返回结果（1 = 通过, 0 = 失败）
const result = isValid ? 1 : 0;

log(`Final result: ${result}`);

// 返回 uint256 编码结果
return Functions.encodeUint256(result);