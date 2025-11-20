# Chainlink Functions

## 当前使用版本

### 资产验证函数
- **文件**: `verifyAsset-robust.js` (推荐使用)
- **文件**: `verifyAsset.js` (备用版本)
- **用途**: 验证用户是否拥有声称的资产（Spotify 歌曲、专利、GPU 等）
- **触发**: 用户申请铸造 NFT 时调用

### 收益获取函数
- **文件**: `fetchRevenue.js`
- **用途**: 从外部 API 获取资产的实际收益数据
- **触发**: Chainlink Automation 定期调用

## 配置文件
- **文件**: `config.js`
- **用途**: 存储 DON ID、Subscription ID 等配置

## 归档文件
`archive/` 目录包含旧版本和测试文件：
- `verifyAsset-minimal.js` - 最简版本
- `verifyAsset-fixed.js` - 修复版本
- `*.min.js` - 压缩版本

这些文件保留作为参考，不应在生产环境使用。

## 使用说明

1. **部署前**: 根据需要选择 `verifyAsset-robust.js` 或 `verifyAsset.js`
2. **上传到 DON**: 使用 Chainlink Functions CLI 上传选定的源代码
3. **配置 Secrets**: 在 DON Secrets 中配置 API 密钥（如需要）
4. **测试**: 先在测试网测试验证逻辑

## 版本说明

- **robust 版本**: 包含更完善的错误处理和日志
- **标准版本**: 基础功能，代码更简洁

根据项目需求选择合适的版本。

