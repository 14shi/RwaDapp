// Chainlink Functions - 极简资产验证
// 直接内联所有逻辑，避免 RAM 超限

// 解析参数
const assetTypeStr = args[0];
const externalId = args[1];
const ownerProof = args[2];

// 映射 assetType
let assetType = 0;
if (assetTypeStr === "Spotify" || assetTypeStr === "spotify") {
  assetType = 0;
} else if (assetTypeStr === "Patent" || assetTypeStr === "patent") {
  assetType = 1;
} else if (assetTypeStr === "GPU" || assetTypeStr === "gpu") {
  assetType = 2;
} else {
  assetType = parseInt(assetTypeStr);
}

// 执行验证
let isValid = false;

if (assetType === 0) {
  // Spotify 验证：使用 JSONPlaceholder
  const response = await Functions.makeHttpRequest({
    url: `https://jsonplaceholder.typicode.com/users/${externalId}`,
    method: "GET"
  });
  
  if (!response.error && response.data && response.data.username) {
    isValid = response.data.username.toLowerCase() === ownerProof.toLowerCase();
  }
  
} else if (assetType === 1) {
  // Patent 验证：使用公开 API
  const response = await Functions.makeHttpRequest({
    url: "https://api.publicapis.org/entries",
    method: "GET"
  });
  
  if (!response.error && response.data) {
    isValid = true; // 简化：API 响应正常即通过
  }
  
} else if (assetType === 2) {
  // GPU 验证：简单长度检查
  isValid = externalId.length >= 8;
}

// 返回结果
return Functions.encodeUint256(isValid ? 1 : 0);
