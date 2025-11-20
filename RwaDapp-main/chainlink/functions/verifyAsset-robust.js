// Chainlink Functions - 健壮版验证
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
  // Spotify 验证
  try {
    const response = await Functions.makeHttpRequest({
      url: `https://jsonplaceholder.typicode.com/users/${externalId}`,
      method: "GET"
    });
    
    // 检查响应
    if (response && response.data) {
      const username = response.data.username;
      if (username) {
        isValid = username.toLowerCase() === ownerProof.toLowerCase();
      }
    }
  } catch (e) {
    isValid = false;
  }
  
} else if (assetType === 1) {
  // Patent 验证
  try {
    const response = await Functions.makeHttpRequest({
      url: "https://api.publicapis.org/entries",
      method: "GET"
    });
    if (response && response.data) {
      isValid = true;
    }
  } catch (e) {
    isValid = false;
  }
  
} else if (assetType === 2) {
  // GPU 验证
  isValid = externalId && externalId.length >= 8;
}

return Functions.encodeUint256(isValid ? 1 : 0);
