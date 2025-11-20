// Chainlink Functions - 修复版本
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

let isValid = false;

if (assetType === 0) {
  const response = await Functions.makeHttpRequest({
    url: `https://jsonplaceholder.typicode.com/users/${externalId}`,
    method: "GET"
  });
  
  if (!response.error && response.data) {
    // 关键修复：解析 JSON 字符串
    const payload = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    
    if (payload && payload.username) {
      isValid = payload.username.toLowerCase() === ownerProof.toLowerCase();
    }
  }
  
} else if (assetType === 1) {
  const response = await Functions.makeHttpRequest({
    url: "https://api.publicapis.org/entries",
    method: "GET"
  });
  
  if (!response.error && response.data) {
    const payload = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    isValid = !!payload;
  }
  
} else if (assetType === 2) {
  isValid = externalId && externalId.length >= 8;
}

return Functions.encodeUint256(isValid ? 1 : 0);
