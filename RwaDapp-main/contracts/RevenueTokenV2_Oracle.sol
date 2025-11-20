// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@chainlink/contracts/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";
import "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";

/**
 * @title RevenueToken V2 with Chainlink Automation & Functions
 * @notice ERC20代币，支持通过Chainlink自动化收益分配
 * @dev 使用官方Chainlink FunctionsClient和AutomationCompatible
 */
contract RevenueTokenV2_Oracle is 
    ERC20, 
    Ownable, 
    ReentrancyGuard,
    FunctionsClient,
    AutomationCompatible
{
    using FunctionsRequest for FunctionsRequest.Request;
    
    // ========== 资产标识 ==========
    uint256 public nftTokenId;
    address public nftContract;
    
    // ========== 销售配置 ==========
    uint256 public pricePerToken;
    
    // ========== 收益追踪 ==========
    uint256 public saleProceeds;
    uint256 public saleProceedsWithdrawn;
    uint256 public operatingRevenue;
    uint256 public operatingDistributed;
    
    // ========== 分红追踪 ==========
    uint256 private constant MAGNITUDE = 2**128;
    uint256 private magnifiedDividendPerShare;
    mapping(address => int256) private magnifiedDividendCorrections;
    mapping(address => uint256) private withdrawnDividends;
    
    // ========== Chainlink 配置 ==========
    bytes32 public donId;
    uint64 public subscriptionId;
    uint32 public callbackGasLimit;
    
    string public revenueSource;
    bytes public encryptedSecretsUrls;
    
    // ========== 收益数据源 ==========
    enum AssetType { SPOTIFY_SONG, USPTO_PATENT, GPU_HARDWARE, CUSTOM }
    AssetType public assetType;
    string public externalId;
    
    // ========== 自动化配置 ==========
    uint256 public updateInterval;
    uint256 public lastRevenueUpdate;
    bool public autoRevenueEnabled;
    
    // ========== 请求追踪 ==========
    mapping(bytes32 => bool) public pendingRevenueRequests;
    bytes32 public lastRequestId;
    
    // ========== 事件 ==========
    event TokensPurchased(address indexed buyer, uint256 amount, uint256 cost);
    event SaleProceedsRecorded(uint256 amount, uint256 totalSaleProceeds);
    event SaleProceedsWithdrawn(address indexed owner, uint256 amount);
    event OperatingRevenueRecorded(uint256 amount, uint256 totalOperatingRevenue);
    event OperatingRevenueDistributed(uint256 amount, uint256 totalDistributed);
    event OperatingRevenueWithdrawn(address indexed holder, uint256 amount);
    event AutomatedRevenueRequested(bytes32 indexed requestId, uint256 timestamp);
    event AutomatedRevenueDistributed(uint256 amount, uint256 timestamp);
    event RevenueConfigUpdated(AssetType assetType, string externalId, uint256 updateInterval);
    event ChainlinkConfigUpdated(bytes32 donId, uint64 subscriptionId);
    
    // ========== 构造函数 ==========
    /**
     * @param name Token名称
     * @param symbol Token符号
     * @param totalSupply 总供应量
     * @param _pricePerToken 每个token的价格
     * @param _nftTokenId 关联的NFT ID
     * @param _nftContract NFT合约地址
     * @param creator 创建者地址
     * @param router Chainlink Functions Router地址
     */
    constructor(
        string memory name,
        string memory symbol,
        uint256 totalSupply,
        uint256 _pricePerToken,
        uint256 _nftTokenId,
        address _nftContract,
        address creator,
        address router
    ) 
        ERC20(name, symbol) 
        Ownable(creator)
        FunctionsClient(router)
    {
        require(totalSupply > 0, "Total supply must be greater than 0");
        require(_pricePerToken > 0, "Price must be greater than 0");
        require(creator != address(0), "Creator cannot be zero address");

        pricePerToken = _pricePerToken;
        nftTokenId = _nftTokenId;
        nftContract = _nftContract;
        
        updateInterval = 30 days;
        autoRevenueEnabled = false;
        callbackGasLimit = 300000;

        _mint(creator, totalSupply * 10 ** decimals());
    }
    
    // ========== Chainlink 配置 ==========
    
    function setChainlinkConfig(
        bytes32 _donId,
        uint64 _subscriptionId,
        uint32 _gasLimit
    ) external onlyOwner {
        donId = _donId;
        subscriptionId = _subscriptionId;
        callbackGasLimit = _gasLimit;
        emit ChainlinkConfigUpdated(_donId, _subscriptionId);
    }
    
    function setRevenueSource(string calldata source) external onlyOwner {
        revenueSource = source;
    }
    
    function setEncryptedSecretsUrls(bytes calldata urls) external onlyOwner {
        encryptedSecretsUrls = urls;
    }
    
    function setRevenueConfig(
        AssetType _assetType,
        string calldata _externalId,
        uint256 _updateInterval
    ) external onlyOwner {
        require(bytes(_externalId).length > 0, "External ID required");
        require(_updateInterval >= 1 days, "Interval too short");
        assetType = _assetType;
        externalId = _externalId;
        updateInterval = _updateInterval;
        emit RevenueConfigUpdated(_assetType, _externalId, _updateInterval);
    }
    
    function setAutoRevenueEnabled(bool enabled) external onlyOwner {
        autoRevenueEnabled = enabled;
        if (enabled && lastRevenueUpdate == 0) {
            lastRevenueUpdate = block.timestamp;
        }
    }
    
    // ========== Chainlink Automation 接口（标准实现）==========
    
    /**
     * @notice Chainlink Automation checkUpkeep（标准接口）
     * @dev 由Chainlink节点off-chain调用
     */
    function checkUpkeep(bytes calldata /* checkData */)
        external
        view
        override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        upkeepNeeded = autoRevenueEnabled &&
                       bytes(revenueSource).length > 0 &&
                       (block.timestamp - lastRevenueUpdate) >= updateInterval;
        
        if (upkeepNeeded) {
            performData = abi.encode(
                assetType,
                externalId,
                lastRevenueUpdate,
                block.timestamp
            );
        }
        
        return (upkeepNeeded, performData);
    }
    
    /**
     * @notice Chainlink Automation performUpkeep（标准接口）
     * @dev 触发Chainlink Functions获取收益
     */
    function performUpkeep(bytes calldata performData) external override nonReentrant {
        // 重新验证条件（best practice）
        require(autoRevenueEnabled, "Auto revenue disabled");
        require(bytes(revenueSource).length > 0, "Source not set");
        require(
            (block.timestamp - lastRevenueUpdate) >= updateInterval,
            "Too soon to update"
        );
        
        // 解析数据
        (AssetType _assetType, string memory _externalId, uint256 _lastUpdate, ) =
            abi.decode(performData, (AssetType, string, uint256, uint256));
        
        // 使用官方FunctionsRequest库构建请求
        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(revenueSource);
        
        // 添加Secrets
        if (encryptedSecretsUrls.length > 0) {
            req.addSecretsReference(encryptedSecretsUrls);
        }
        
        // 设置参数
        string[] memory args = new string[](3);
        args[0] = _assetTypeToString(_assetType);
        args[1] = _externalId;
        args[2] = _uint2str(_lastUpdate);
        req.setArgs(args);
        
        // 发送请求（使用FunctionsClient的_sendRequest）
        bytes32 requestId = _sendRequest(
            req.encodeCBOR(),
            subscriptionId,
            callbackGasLimit,
            donId
        );
        
        // 记录请求
        pendingRevenueRequests[requestId] = true;
        lastRequestId = requestId;
        
        emit AutomatedRevenueRequested(requestId, block.timestamp);
    }
    
    /**
     * @notice Chainlink Functions回调函数（重写FunctionsClient的虚函数）
     * @param requestId 请求ID
     * @param response 收益金额（uint256编码）
     * @param err 错误信息
     */
    function fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal override {
        require(pendingRevenueRequests[requestId], "Request not pending");
        
        pendingRevenueRequests[requestId] = false;
        
        // 错误处理
        if (err.length > 0) {
            lastRevenueUpdate = block.timestamp;
            return;
        }
        
        // 解析收益金额
        if (response.length == 0) {
            lastRevenueUpdate = block.timestamp;
            return;
        }
        
        uint256 revenueAmount = abi.decode(response, (uint256));
        
        if (revenueAmount > 0) {
            operatingRevenue += revenueAmount;
            _distributeRevenue(revenueAmount);
            emit AutomatedRevenueDistributed(revenueAmount, block.timestamp);
        }
        
        lastRevenueUpdate = block.timestamp;
    }
    
    /**
     * @notice 内部分配函数
     */
    function _distributeRevenue(uint256 amount) internal {
        uint256 supply = totalSupply();
        require(supply > 0, "No tokens exist");
        
        magnifiedDividendPerShare += (amount * MAGNITUDE) / supply;
        operatingDistributed += amount;
        
        emit OperatingRevenueDistributed(amount, operatingDistributed);
    }
    
    // ========== 手动收益管理（保持兼容）==========
    
    function recordOperatingRevenue() external payable onlyOwner {
        require(msg.value > 0, "Revenue must be greater than 0");
        operatingRevenue += msg.value;
        emit OperatingRevenueRecorded(msg.value, operatingRevenue);
    }
    
    function distributeOperatingRevenue() external onlyOwner {
        uint256 undistributed = operatingRevenue - operatingDistributed;
        require(undistributed > 0, "No revenue to distribute");
        _distributeRevenue(undistributed);
    }
    
    // ========== 代币购买 ==========
    
    function purchaseTokens(uint256 tokenAmount) external payable nonReentrant {
        require(tokenAmount > 0, "Amount must be greater than 0");
        
        uint256 cost = (tokenAmount * pricePerToken) / (10 ** decimals());
        require(msg.value >= cost, "Insufficient payment");
        require(balanceOf(owner()) >= tokenAmount, "Not enough tokens available");

        _transfer(owner(), msg.sender, tokenAmount);
        saleProceeds += cost;

        if (msg.value > cost) {
            payable(msg.sender).transfer(msg.value - cost);
        }

        emit TokensPurchased(msg.sender, tokenAmount, cost);
        emit SaleProceedsRecorded(cost, saleProceeds);
    }
    
    // ========== 收益提取 ==========
    
    function withdrawSaleProceeds() external onlyOwner nonReentrant {
        uint256 available = saleProceeds - saleProceedsWithdrawn;
        require(available > 0, "No sale proceeds to withdraw");
        saleProceedsWithdrawn = saleProceeds;
        payable(owner()).transfer(available);
        emit SaleProceedsWithdrawn(owner(), available);
    }
    
    function withdrawOperatingRevenue() external nonReentrant {
        uint256 withdrawable = withdrawableOperatingRevenueOf(msg.sender);
        require(withdrawable > 0, "No revenue available to withdraw");
        withdrawnDividends[msg.sender] += withdrawable;
        payable(msg.sender).transfer(withdrawable);
        emit OperatingRevenueWithdrawn(msg.sender, withdrawable);
    }
    
    // ========== 查询函数 ==========
    
    function getAvailableSaleProceeds() external view returns (uint256) {
        return saleProceeds - saleProceedsWithdrawn;
    }
    
    function getPendingOperatingRevenue() external view returns (uint256) {
        return operatingRevenue - operatingDistributed;
    }
    
    function withdrawableOperatingRevenueOf(address holder) public view returns (uint256) {
        return accumulativeOperatingRevenueOf(holder) - withdrawnDividends[holder];
    }
    
    function accumulativeOperatingRevenueOf(address holder) public view returns (uint256) {
        uint256 holderBalance = balanceOf(holder);
        if (holderBalance == 0) return 0;
        
        int256 magnifiedDividends = int256(magnifiedDividendPerShare * holderBalance);
        int256 correctedDividends = magnifiedDividends + magnifiedDividendCorrections[holder];
        
        return uint256(correctedDividends) / MAGNITUDE;
    }
    
    function getHolderOperatingRevenue(address holder)
        external
        view
        returns (uint256 accumulated, uint256 withdrawn, uint256 withdrawable)
    {
        accumulated = accumulativeOperatingRevenueOf(holder);
        withdrawn = withdrawnDividends[holder];
        withdrawable = accumulated - withdrawn;
    }
    
    function getNextUpdateTime() external view returns (uint256) {
        if (!autoRevenueEnabled) return 0;
        return lastRevenueUpdate + updateInterval;
    }
    
    function canTriggerUpdate() external view returns (bool) {
        return autoRevenueEnabled &&
               (block.timestamp - lastRevenueUpdate) >= updateInterval;
    }
    
    /**
     * @notice 获取Functions Router地址
     */
    function getFunctionsRouter() external view returns (address) {
        return address(i_router);
    }
    
    // ========== 内部函数 ==========
    
    function _update(address from, address to, uint256 value) internal virtual override {
        super._update(from, to, value);
        
        int256 correction = int256(magnifiedDividendPerShare * value);
        
        if (from != address(0)) {
            magnifiedDividendCorrections[from] += correction;
        }
        
        if (to != address(0)) {
            magnifiedDividendCorrections[to] -= correction;
        }
    }
    
    // ========== 工具函数 ==========
    
    function _assetTypeToString(AssetType _type) internal pure returns (string memory) {
        if (_type == AssetType.SPOTIFY_SONG) return "spotify";
        if (_type == AssetType.USPTO_PATENT) return "patent";
        if (_type == AssetType.GPU_HARDWARE) return "gpu";
        return "custom";
    }
    
    function _uint2str(uint256 _i) internal pure returns (string memory) {
        if (_i == 0) return "0";
        uint256 j = _i;
        uint256 length;
        while (j != 0) {
            length++;
            j /= 10;
        }
        bytes memory bstr = new bytes(length);
        uint256 k = length;
        j = _i;
        while (j != 0) {
            bstr[--k] = bytes1(uint8(48 + j % 10));
            j /= 10;
        }
        return string(bstr);
    }
}
