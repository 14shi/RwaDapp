// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ⚠️ DEPRECATED - DO NOT USE ⚠️
 * This is the old version without Chainlink Oracle integration.
 * Current version: RevenueAssetNFT_Oracle.sol
 * Kept for reference only.
 */

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract RevenueAssetNFT is ERC721, Ownable {
    uint256 private _tokenIdCounter;
    address public factoryContract;

    struct AssetMetadata {
        string name;
        string assetType;
        string description;
        string imageUrl;
        uint256 estimatedValue;
        address creator;
        bool isFragmentalized;
        address erc20TokenAddress;
    }

    mapping(uint256 => AssetMetadata) public assetMetadata;

    event AssetMinted(
        uint256 indexed tokenId,
        string name,
        string assetType,
        address indexed creator
    );

    event AssetFragmentalized(
        uint256 indexed tokenId,
        address indexed erc20Token
    );

    constructor() ERC721("RevenueAsset", "REVA") Ownable(msg.sender) {}

    function setFactoryContract(address _factory) external onlyOwner {
        require(_factory != address(0), "Invalid factory address");
        factoryContract = _factory;
    }

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
            assetType: assetType,
            description: description,
            imageUrl: imageUrl,
            estimatedValue: estimatedValue,
            creator: msg.sender,
            isFragmentalized: false,
            erc20TokenAddress: address(0)
        });

        emit AssetMinted(newTokenId, name, assetType, msg.sender);

        return newTokenId;
    }

    function setFragmentalized(
        uint256 tokenId,
        address erc20Token
    ) external {
        require(
            _ownerOf(tokenId) == msg.sender || msg.sender == factoryContract,
            "Not authorized"
        );
        require(!assetMetadata[tokenId].isFragmentalized, "Already fragmentalized");
        require(erc20Token != address(0), "Invalid token address");

        assetMetadata[tokenId].isFragmentalized = true;
        assetMetadata[tokenId].erc20TokenAddress = erc20Token;

        emit AssetFragmentalized(tokenId, erc20Token);
    }

    function getAssetMetadata(uint256 tokenId) external view returns (AssetMetadata memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return assetMetadata[tokenId];
    }

    function getTotalSupply() external view returns (uint256) {
        return _tokenIdCounter;
    }
}
