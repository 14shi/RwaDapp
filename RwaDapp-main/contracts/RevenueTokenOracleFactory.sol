// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./RevenueTokenV2_Oracle.sol";
import "./RevenueAssetNFT.sol";

/**
 * @title RevenueTokenOracleFactory
 * @notice Factory合约，用于创建带Chainlink Automation功能的RevenueToken
 * @dev 创建RevenueTokenV2_Oracle实例，支持自动化收益分配
 */
contract RevenueTokenOracleFactory {
    address public nftContract;
    address public functionsRouter;
    
    mapping(uint256 => address) public nftToToken;
    mapping(address => uint256) public tokenToNft;
    
    event OracleTokenCreated(
        uint256 indexed nftTokenId,
        address indexed tokenAddress,
        string name,
        string symbol,
        uint256 totalSupply,
        address router
    );
    
    constructor(address _nftContract, address _functionsRouter) {
        require(_nftContract != address(0), "Invalid NFT contract");
        require(_functionsRouter != address(0), "Invalid router");
        nftContract = _nftContract;
        functionsRouter = _functionsRouter;
    }
    
    /**
     * @notice 创建带Oracle功能的收益代币
     * @param nftTokenId NFT的tokenId
     * @param tokenName ERC20代币名称
     * @param tokenSymbol ERC20代币符号
     * @param totalSupply 总供应量（会乘以decimals）
     * @param pricePerToken 每个代币的价格（wei）
     * @return 创建的RevenueTokenV2_Oracle合约地址
     */
    function createOracleRevenueToken(
        uint256 nftTokenId,
        string memory tokenName,
        string memory tokenSymbol,
        uint256 totalSupply,
        uint256 pricePerToken
    ) external returns (address) {
        RevenueAssetNFT nft = RevenueAssetNFT(nftContract);
        
        require(nft.ownerOf(nftTokenId) == msg.sender, "Not the NFT owner");
        require(nftToToken[nftTokenId] == address(0), "Token already exists");
        
        RevenueTokenV2_Oracle newToken = new RevenueTokenV2_Oracle(
            tokenName,
            tokenSymbol,
            totalSupply,
            pricePerToken,
            nftTokenId,
            nftContract,
            msg.sender,
            functionsRouter
        );
        
        address tokenAddress = address(newToken);
        
        nftToToken[nftTokenId] = tokenAddress;
        tokenToNft[tokenAddress] = nftTokenId;
        
        nft.setFragmentalized(nftTokenId, tokenAddress);
        
        emit OracleTokenCreated(
            nftTokenId,
            tokenAddress,
            tokenName,
            tokenSymbol,
            totalSupply,
            functionsRouter
        );
        
        return tokenAddress;
    }
    
    function getTokenByNFT(uint256 nftTokenId) external view returns (address) {
        return nftToToken[nftTokenId];
    }
    
    function getNFTByToken(address tokenAddress) external view returns (uint256) {
        return tokenToNft[tokenAddress];
    }
    
    function getFunctionsRouter() external view returns (address) {
        return functionsRouter;
    }
}
