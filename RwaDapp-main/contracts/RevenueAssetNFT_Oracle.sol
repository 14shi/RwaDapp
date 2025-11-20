// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";

/**
 * @title RevenueAssetNFT with Chainlink Functions
 * @notice NFT合约，集成Chainlink Functions进行资产所有权验证
 * @dev 使用官方Chainlink FunctionsClient和FunctionsRequest库
 */
contract RevenueAssetNFT_Oracle is ERC721, Ownable, FunctionsClient {
    using FunctionsRequest for FunctionsRequest.Request;
    
    // ========== 自定义错误 ==========
    error InvalidAddress();
    error EmptyExternalId();
    error EmptyOwnerProof();
    error SourceNotSet();
    error NotAuthorized();
    error AlreadyFragmentalized();
    error TokenDoesNotExist();
    error RequestNotPending();
    
    // ========== 状态变量 ==========
    uint256 private _tokenIdCounter;
    address public factoryContract;
    
    // Chainlink Functions 配置
    bytes32 public donId;
    uint64 public subscriptionId;
    uint32 public callbackGasLimit;
    
    // Functions 源代码和 Secrets
    string public verificationSource;
    bytes public encryptedSecretsUrls;
    
    // ========== 枚举 ==========
    enum AssetType {
        SPOTIFY_SONG,    // 0
        USPTO_PATENT,    // 1
        GPU_HARDWARE,    // 2
        CUSTOM           // 3
    }
    
    // ========== 结构体 ==========
    struct AssetMetadata {
        string name;
        AssetType assetType;
        string description;
        string imageUrl;
        uint256 estimatedValue;
        address creator;
        bool isFragmentalized;
        address erc20TokenAddress;
        bool isVerified;
        string externalId;
    }
    
    struct VerificationParams {
        AssetType assetType;
        string externalId;
        string ownerProof;
        string name;
        string description;
        string imageUrl;
        uint256 estimatedValue;
    }
    
    struct VerificationRequest {
        AssetType assetType;
        string externalId;
        string ownerProof;
        address requester;
        uint256 timestamp;
        bool verified;
        bool fulfilled;
        string name;
        string description;
        string imageUrl;
        uint256 estimatedValue;
    }
    
    // ========== 映射 ==========
    mapping(uint256 => AssetMetadata) public assetMetadata;
    mapping(bytes32 => VerificationRequest) public verificationRequests;
    mapping(bytes32 => bool) public pendingRequests;
    
    // ========== 事件 ==========
    event AssetMinted(uint256 indexed tokenId, string name, string assetType, address indexed creator);
    event AssetFragmentalized(uint256 indexed tokenId, address indexed erc20Token);
    event VerificationRequested(bytes32 indexed requestId, AssetType assetType, string externalId, address indexed requester);
    event VerificationFulfilled(bytes32 indexed requestId, bool verified, uint256 tokenId);
    event ChainlinkConfigUpdated(bytes32 donId, uint64 subscriptionId);
    
    // ========== 构造函数 ==========
    /**
     * @param router Chainlink Functions Router地址
     */
    constructor(address router) 
        ERC721("RevenueAsset", "REVA") 
        Ownable(msg.sender)
        FunctionsClient(router)
    {
        callbackGasLimit = 300000;
    }
    
    // ========== 配置函数 ==========
    
    function setFactoryContract(address _factory) external onlyOwner {
        if (_factory == address(0)) revert InvalidAddress();
        factoryContract = _factory;
    }
    
    /**
     * @notice 配置Chainlink Functions
     * @param _donId DON ID
     * @param _subscriptionId Subscription ID
     * @param _gasLimit Gas limit for callbacks
     */
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
    
    function setVerificationSource(string calldata source) external onlyOwner {
        verificationSource = source;
    }
    
    function setEncryptedSecretsUrls(bytes calldata urls) external onlyOwner {
        encryptedSecretsUrls = urls;
    }
    
    // ========== Chainlink Functions 集成 ==========
    
    /**
     * @notice 请求资产验证（触发Chainlink Functions）
     * @dev 使用官方FunctionsRequest库构建CBOR请求
     */
    function requestAssetVerification(
        VerificationParams calldata params
    ) external returns (bytes32 requestId) {
        if (bytes(params.externalId).length == 0) revert EmptyExternalId();
        if (bytes(params.ownerProof).length == 0) revert EmptyOwnerProof();
        if (bytes(verificationSource).length == 0) revert SourceNotSet();
        
        // 使用官方FunctionsRequest库构建请求
        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(verificationSource);
        
        // 添加Secrets（如果配置了）
        if (encryptedSecretsUrls.length > 0) {
            req.addSecretsReference(encryptedSecretsUrls);
        }
        
        // 设置参数
        string[] memory args = new string[](3);
        args[0] = _assetTypeToString(params.assetType);
        args[1] = params.externalId;
        args[2] = params.ownerProof;
        req.setArgs(args);
        
        // 发送请求（使用FunctionsClient的_sendRequest）
        requestId = _sendRequest(
            req.encodeCBOR(),
            subscriptionId,
            callbackGasLimit,
            donId
        );
        
        // 保存请求信息
        verificationRequests[requestId] = VerificationRequest({
            assetType: params.assetType,
            externalId: params.externalId,
            ownerProof: params.ownerProof,
            requester: msg.sender,
            timestamp: block.timestamp,
            verified: false,
            fulfilled: false,
            name: params.name,
            description: params.description,
            imageUrl: params.imageUrl,
            estimatedValue: params.estimatedValue
        });
        
        pendingRequests[requestId] = true;
        
        emit VerificationRequested(requestId, params.assetType, params.externalId, msg.sender);
        
        return requestId;
    }
    
    /**
     * @notice Chainlink Functions回调函数（重写FunctionsClient的虚函数）
     * @param requestId 请求ID
     * @param response 响应数据
     * @param err 错误信息
     * @dev 由FunctionsClient的handleOracleFulfillment调用
     */
    function fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal override {
        if (!pendingRequests[requestId]) revert RequestNotPending();
        
        pendingRequests[requestId] = false;
        
        VerificationRequest storage request = verificationRequests[requestId];
        
        // 处理错误
        if (err.length > 0) {
            request.verified = false;
            request.fulfilled = true;
            emit VerificationFulfilled(requestId, false, 0);
            return;
        }
        
        // 解析响应（期望 uint256：1=true, 0=false）
        bool verified = false;
        if (response.length == 32) {
            // 解码 uint256
            uint256 verificationResult = abi.decode(response, (uint256));
            verified = (verificationResult == 1);
        }
        
        request.verified = verified;
        request.fulfilled = true;
        
        uint256 tokenId = 0;
        
        // 验证通过则铸造NFT
        if (verified) {
            tokenId = _mintVerifiedAsset(request);
        }
        
        emit VerificationFulfilled(requestId, verified, tokenId);
    }
    
    /**
     * @notice 铸造已验证的资产
     */
    function _mintVerifiedAsset(
        VerificationRequest storage request
    ) internal returns (uint256) {
        _tokenIdCounter++;
        uint256 newTokenId = _tokenIdCounter;
        
        // 使用 _mint 替代 _safeMint 以节省 gas（Chainlink 回调 gas 限制）
        _mint(request.requester, newTokenId);
        
        assetMetadata[newTokenId] = AssetMetadata({
            name: request.name,
            assetType: request.assetType,
            description: request.description,
            imageUrl: request.imageUrl,
            estimatedValue: request.estimatedValue,
            creator: request.requester,
            isFragmentalized: false,
            erc20TokenAddress: address(0),
            isVerified: true,
            externalId: request.externalId
        });
        
        emit AssetMinted(newTokenId, request.name, _assetTypeToString(request.assetType), request.requester);
        
        return newTokenId;
    }
    
    // ========== 兼容性函数（无验证直接铸造）==========
    
    /**
     * @notice 直接铸造资产（无验证，保持向后兼容）
     */
    function mintRevenueAsset(
        string memory name,
        string memory assetType,
        string memory description,
        string memory imageUrl,
        uint256 estimatedValue
    ) public returns (uint256) {
        _tokenIdCounter++;
        uint256 newTokenId = _tokenIdCounter;
        
        _safeMint(msg.sender, newTokenId);
        
        assetMetadata[newTokenId] = AssetMetadata({
            name: name,
            assetType: AssetType.CUSTOM,
            description: description,
            imageUrl: imageUrl,
            estimatedValue: estimatedValue,
            creator: msg.sender,
            isFragmentalized: false,
            erc20TokenAddress: address(0),
            isVerified: false,
            externalId: ""
        });
        
        emit AssetMinted(newTokenId, name, assetType, msg.sender);
        
        return newTokenId;
    }
    
    // ========== 查询函数 ==========
    
    function getVerificationRequest(bytes32 requestId) external view returns (VerificationRequest memory) {
        return verificationRequests[requestId];
    }
    
    function isAssetVerified(uint256 tokenId) external view returns (bool) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return assetMetadata[tokenId].isVerified;
    }
    
    function isPendingRequest(bytes32 requestId) external view returns (bool) {
        return pendingRequests[requestId];
    }
    
    /**
     * @notice 获取Functions Router地址
     */
    function getFunctionsRouter() external view returns (address) {
        return address(i_router);
    }
    
    // ========== 其他函数 ==========
    
    function setFragmentalized(uint256 tokenId, address erc20Token) external {
        if (_ownerOf(tokenId) != msg.sender && msg.sender != factoryContract) revert NotAuthorized();
        if (assetMetadata[tokenId].isFragmentalized) revert AlreadyFragmentalized();
        if (erc20Token == address(0)) revert InvalidAddress();
        
        assetMetadata[tokenId].isFragmentalized = true;
        assetMetadata[tokenId].erc20TokenAddress = erc20Token;
        
        emit AssetFragmentalized(tokenId, erc20Token);
    }
    
    function getAssetMetadata(uint256 tokenId) external view returns (AssetMetadata memory) {
        if (_ownerOf(tokenId) == address(0)) revert TokenDoesNotExist();
        return assetMetadata[tokenId];
    }
    
    function getAssetTypeString(uint256 tokenId) external view returns (string memory) {
        if (_ownerOf(tokenId) == address(0)) revert TokenDoesNotExist();
        return _assetTypeToString(assetMetadata[tokenId].assetType);
    }
    
    function getTotalSupply() external view returns (uint256) {
        return _tokenIdCounter;
    }
    
    // ========== 工具函数 ==========
    
    function _assetTypeToString(AssetType assetType) internal pure returns (string memory) {
        if (assetType == AssetType.SPOTIFY_SONG) return "spotify";
        if (assetType == AssetType.USPTO_PATENT) return "patent";
        if (assetType == AssetType.GPU_HARDWARE) return "gpu";
        return "custom";
    }
}
