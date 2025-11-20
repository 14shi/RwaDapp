// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ⚠️ DEPRECATED - DO NOT USE ⚠️
 * This is the old V1 version of RevenueToken.
 * Current version: RevenueTokenV2_Oracle.sol
 * Kept for reference only.
 */

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract RevenueToken is ERC20, Ownable {
    uint256 public pricePerToken;
    uint256 public totalRevenue;
    uint256 public distributedRevenue;
    uint256 public nftTokenId;
    address public nftContract;

    mapping(address => uint256) public revenueWithdrawn;

    event TokensPurchased(address indexed buyer, uint256 amount, uint256 cost);
    event RevenueRecorded(uint256 amount, uint256 totalRevenue);
    event RevenueDistributed(uint256 amount, uint256 totalDistributed);
    event RevenueWithdrawn(address indexed holder, uint256 amount);

    constructor(
        string memory name,
        string memory symbol,
        uint256 totalSupply,
        uint256 _pricePerToken,
        uint256 _nftTokenId,
        address _nftContract,
        address creator
    ) ERC20(name, symbol) Ownable(creator) {
        require(totalSupply > 0, "Total supply must be greater than 0");
        require(_pricePerToken > 0, "Price must be greater than 0");

        pricePerToken = _pricePerToken;
        nftTokenId = _nftTokenId;
        nftContract = _nftContract;

        _mint(creator, totalSupply * 10 ** decimals());
    }

    function purchaseTokens(uint256 tokenAmount) external payable {
        require(tokenAmount > 0, "Amount must be greater than 0");
        
        uint256 cost = (tokenAmount * pricePerToken) / (10 ** decimals());
        require(msg.value >= cost, "Insufficient payment");

        require(balanceOf(owner()) >= tokenAmount, "Not enough tokens available");

        _transfer(owner(), msg.sender, tokenAmount);

        uint256 saleProceeds = cost;
        totalRevenue += saleProceeds;

        if (msg.value > cost) {
            payable(msg.sender).transfer(msg.value - cost);
        }

        emit TokensPurchased(msg.sender, tokenAmount, cost);
        emit RevenueRecorded(saleProceeds, totalRevenue);
    }

    function recordRevenue() external payable onlyOwner {
        require(msg.value > 0, "Revenue must be greater than 0");
        
        totalRevenue += msg.value;
        
        emit RevenueRecorded(msg.value, totalRevenue);
    }

    function distributeRevenue() external onlyOwner {
        uint256 undistributedRevenue = totalRevenue - distributedRevenue;
        require(undistributedRevenue > 0, "No revenue to distribute");

        distributedRevenue = totalRevenue;

        emit RevenueDistributed(undistributedRevenue, distributedRevenue);
    }

    function withdrawRevenue() external {
        uint256 balance = balanceOf(msg.sender);
        require(balance > 0, "No tokens held");

        uint256 totalDistributableRevenue = distributedRevenue;
        uint256 holderShare = (totalDistributableRevenue * balance) / totalSupply();
        uint256 alreadyWithdrawn = revenueWithdrawn[msg.sender];
        uint256 availableToWithdraw = holderShare - alreadyWithdrawn;

        require(availableToWithdraw > 0, "No revenue available to withdraw");

        revenueWithdrawn[msg.sender] += availableToWithdraw;

        payable(msg.sender).transfer(availableToWithdraw);

        emit RevenueWithdrawn(msg.sender, availableToWithdraw);
    }

    function getHolderRevenue(address holder) external view returns (uint256) {
        uint256 balance = balanceOf(holder);
        if (balance == 0) return 0;

        uint256 holderShare = (distributedRevenue * balance) / totalSupply();
        uint256 alreadyWithdrawn = revenueWithdrawn[holder];
        
        return holderShare > alreadyWithdrawn ? holderShare - alreadyWithdrawn : 0;
    }

    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
