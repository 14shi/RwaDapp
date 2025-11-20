# 归档的旧版本合约

⚠️ **警告**: 此目录下的合约为旧版本，**不应**在生产环境中使用。

## 当前使用的合约

请使用父目录下的 Oracle 版本合约：
- `RevenueAssetNFT_Oracle.sol` - NFT 合约（支持 Chainlink 验证）
- `RevenueTokenV2_Oracle.sol` - 收益代币合约（支持 Chainlink 自动化）
- `RevenueTokenOracleFactory.sol` - 工厂合约

## 归档合约说明

### RevenueToken.sol
- **版本**: V1
- **特点**: 基础收益分配功能
- **弃用原因**: 功能不完善，未区分销售收入和运营收入

### RevenueTokenV2.sol
- **版本**: V2（非 Oracle）
- **特点**: 区分销售收入和运营收入，使用 magnified dividend 模型
- **弃用原因**: 缺少 Chainlink Oracle 集成

### RevenueAssetNFT.sol
- **版本**: V1（非 Oracle）
- **特点**: 基础 NFT 功能
- **弃用原因**: 缺少 Chainlink 资产验证功能

### RevenueTokenFactory.sol
- **版本**: V1（非 Oracle）
- **特点**: 创建 V2 代币的工厂合约
- **弃用原因**: 对应的代币合约已弃用

## 为什么保留这些文件？

1. **代码参考**: 了解项目演进过程
2. **审计记录**: 保留完整的开发历史
3. **兼容性**: 如有旧版本部署，可参考原始代码

## 部署提醒

如果您正在部署新合约，请确保：
- ✅ 使用 `../RevenueTokenV2_Oracle.sol` 而不是此目录下的文件
- ✅ 使用 `../RevenueAssetNFT_Oracle.sol` 
- ✅ 使用 `../RevenueTokenOracleFactory.sol`
- ✅ 配置正确的 Chainlink Functions Router 地址

