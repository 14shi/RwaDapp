// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ⚠️ DEPRECATED - DO NOT USE ⚠️
 * This is the old factory for non-Oracle tokens.
 * Current version: RevenueTokenOracleFactory.sol
 * Kept for reference only.
 */

import "./RevenueTokenV2.sol";
import "./RevenueAssetNFT.sol";

contract RevenueTokenFactory {
    address public nftContract;
    
    mapping(uint256 => address) public nftToToken;
    mapping(address => uint256) public tokenToNft;

    event TokenCreated(
        uint256 indexed nftTokenId,
        address indexed tokenAddress,
        string name,
        string symbol,
        uint256 totalSupply
    );

    constructor(address _nftContract) {
        require(_nftContract != address(0), "Invalid NFT contract");
        nftContract = _nftContract;
    }

    function createRevenueToken(
        uint256 nftTokenId,
        string memory tokenName,
        string memory tokenSymbol,
        uint256 totalSupply,
        uint256 pricePerToken
    ) external returns (address) {
        RevenueAssetNFT nft = RevenueAssetNFT(nftContract);
        
        require(nft.ownerOf(nftTokenId) == msg.sender, "Not the NFT owner");
        require(nftToToken[nftTokenId] == address(0), "Token already exists");

        RevenueTokenV2 newToken = new RevenueTokenV2(
            tokenName,
            tokenSymbol,
            totalSupply,
            pricePerToken,
            nftTokenId,
            nftContract,
            msg.sender
        );

        address tokenAddress = address(newToken);
        
        nftToToken[nftTokenId] = tokenAddress;
        tokenToNft[tokenAddress] = nftTokenId;

        nft.setFragmentalized(nftTokenId, tokenAddress);

        emit TokenCreated(nftTokenId, tokenAddress, tokenName, tokenSymbol, totalSupply);

        return tokenAddress;
    }

    function getTokenByNFT(uint256 nftTokenId) external view returns (address) {
        return nftToToken[nftTokenId];
    }

    function getNFTByToken(address tokenAddress) external view returns (uint256) {
        return tokenToNft[tokenAddress];
    }
}
