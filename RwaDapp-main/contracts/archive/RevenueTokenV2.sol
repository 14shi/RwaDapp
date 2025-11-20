// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ⚠️ DEPRECATED - DO NOT USE ⚠️
 * This is the V2 non-Oracle version.
 * Current version: RevenueTokenV2_Oracle.sol (with Chainlink integration)
 * Kept for reference only.
 */

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title RevenueToken V2
 * @notice ERC20 token representing fractional ownership of a revenue-generating NFT asset
 * @dev Separates sale proceeds (for owner) from operating revenue (distributed to all holders)
 * Uses magnified dividend model to ensure fair distribution across token transfers
 */
contract RevenueTokenV2 is ERC20, Ownable, ReentrancyGuard {
    // Asset identification
    uint256 public nftTokenId;
    address public nftContract;
    
    // Primary sale configuration
    uint256 public pricePerToken;
    
    // Sale proceeds tracking (归所有者)
    uint256 public saleProceeds;           // Total ETH from token sales
    uint256 public saleProceedsWithdrawn;  // ETH withdrawn by owner
    
    // Operating revenue tracking (分配给持有者)
    uint256 public operatingRevenue;       // Total operating revenue recorded
    uint256 public operatingDistributed;   // Total operating revenue distributed
    
    // Cumulative dividend tracking (magnified for precision)
    uint256 private constant MAGNITUDE = 2**128;
    uint256 private magnifiedDividendPerShare;
    
    // Per-holder tracking
    mapping(address => int256) private magnifiedDividendCorrections;
    mapping(address => uint256) private withdrawnDividends;
    
    // Events
    event TokensPurchased(address indexed buyer, uint256 amount, uint256 cost);
    event SaleProceedsRecorded(uint256 amount, uint256 totalSaleProceeds);
    event SaleProceedsWithdrawn(address indexed owner, uint256 amount);
    event OperatingRevenueRecorded(uint256 amount, uint256 totalOperatingRevenue);
    event OperatingRevenueDistributed(uint256 amount, uint256 totalDistributed);
    event OperatingRevenueWithdrawn(address indexed holder, uint256 amount);

    /**
     * @notice Initialize the revenue token
     * @param name Token name
     * @param symbol Token symbol
     * @param totalSupply Total supply (in whole tokens, will be scaled by decimals)
     * @param _pricePerToken Price per token in wei
     * @param _nftTokenId Associated NFT token ID
     * @param _nftContract Associated NFT contract address
     * @param creator Address of the asset creator (becomes owner)
     */
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
        require(creator != address(0), "Creator cannot be zero address");

        pricePerToken = _pricePerToken;
        nftTokenId = _nftTokenId;
        nftContract = _nftContract;

        // Mint all tokens to creator
        _mint(creator, totalSupply * 10 ** decimals());
    }

    /**
     * @notice Purchase tokens from the owner
     * @param tokenAmount Amount of tokens to purchase (in wei units)
     * @dev Sale proceeds go to saleProceeds, not operating revenue
     */
    function purchaseTokens(uint256 tokenAmount) external payable nonReentrant {
        require(tokenAmount > 0, "Amount must be greater than 0");
        
        // Calculate cost
        uint256 cost = (tokenAmount * pricePerToken) / (10 ** decimals());
        require(msg.value >= cost, "Insufficient payment");
        require(balanceOf(owner()) >= tokenAmount, "Not enough tokens available");

        // Transfer tokens from owner to buyer
        _transfer(owner(), msg.sender, tokenAmount);

        // Record sale proceeds (归所有者，不是可分配收益)
        saleProceeds += cost;

        // Refund excess payment
        if (msg.value > cost) {
            payable(msg.sender).transfer(msg.value - cost);
        }

        emit TokensPurchased(msg.sender, tokenAmount, cost);
        emit SaleProceedsRecorded(cost, saleProceeds);
    }

    /**
     * @notice Owner withdraws sale proceeds
     * @dev Only callable by owner, pulls from sale proceeds pool
     */
    function withdrawSaleProceeds() external onlyOwner nonReentrant {
        uint256 available = saleProceeds - saleProceedsWithdrawn;
        require(available > 0, "No sale proceeds to withdraw");

        saleProceedsWithdrawn = saleProceeds;
        payable(owner()).transfer(available);

        emit SaleProceedsWithdrawn(owner(), available);
    }

    /**
     * @notice Record operating revenue (e.g., royalties, rental income)
     * @dev Only callable by owner, adds to distributable pool
     */
    function recordOperatingRevenue() external payable onlyOwner {
        require(msg.value > 0, "Revenue must be greater than 0");
        
        operatingRevenue += msg.value;
        
        emit OperatingRevenueRecorded(msg.value, operatingRevenue);
    }

    /**
     * @notice Distribute operating revenue to token holders
     * @dev Updates magnifiedDividendPerShare for fair distribution
     * Only distributes newly recorded revenue (not already distributed)
     */
    function distributeOperatingRevenue() external onlyOwner {
        uint256 undistributed = operatingRevenue - operatingDistributed;
        require(undistributed > 0, "No revenue to distribute");

        uint256 supply = totalSupply();
        require(supply > 0, "No tokens exist");

        // Update cumulative dividend per share with only the new revenue
        magnifiedDividendPerShare += (undistributed * MAGNITUDE) / supply;
        
        // Mark this revenue as distributed
        operatingDistributed = operatingRevenue;

        emit OperatingRevenueDistributed(undistributed, operatingDistributed);
    }

    /**
     * @notice Token holder withdraws their share of distributed operating revenue
     * @dev Uses magnified dividend model to track earned revenue across transfers
     */
    function withdrawOperatingRevenue() external nonReentrant {
        uint256 withdrawable = withdrawableOperatingRevenueOf(msg.sender);
        require(withdrawable > 0, "No revenue available to withdraw");

        withdrawnDividends[msg.sender] += withdrawable;
        payable(msg.sender).transfer(withdrawable);

        emit OperatingRevenueWithdrawn(msg.sender, withdrawable);
    }

    /**
     * @notice Get available sale proceeds for owner
     * @return Available ETH from token sales
     */
    function getAvailableSaleProceeds() external view returns (uint256) {
        return saleProceeds - saleProceedsWithdrawn;
    }

    /**
     * @notice Get undistributed operating revenue
     * @return Operating revenue not yet distributed
     */
    function getPendingOperatingRevenue() external view returns (uint256) {
        return operatingRevenue - operatingDistributed;
    }

    /**
     * @notice Get holder's available operating revenue to withdraw
     * @param holder Address of token holder
     * @return Available ETH for withdrawal
     */
    function getHolderOperatingRevenue(address holder) external view returns (uint256) {
        return withdrawableOperatingRevenueOf(holder);
    }

    /**
     * @notice Get contract's total ETH balance
     * @return Contract balance in wei
     */
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Get total distributed operating revenue
     * @return Total operating revenue that has been distributed
     */
    function getTotalDistributedOperatingRevenue() external view returns (uint256) {
        return operatingDistributed;
    }

    /**
     * @notice Calculate cumulative dividends for an address
     * @param holder Address to check
     * @return Cumulative dividends earned
     */
    function accumulativeOperatingRevenueOf(address holder) public view returns (uint256) {
        uint256 balance = balanceOf(holder);
        int256 magnifiedDividend = int256(magnifiedDividendPerShare * balance);
        int256 correctedDividend = magnifiedDividend + magnifiedDividendCorrections[holder];
        return uint256(correctedDividend) / MAGNITUDE;
    }

    /**
     * @notice Calculate withdrawable dividends for an address
     * @param holder Address to check
     * @return Withdrawable dividends
     */
    function withdrawableOperatingRevenueOf(address holder) public view returns (uint256) {
        uint256 accumulated = accumulativeOperatingRevenueOf(holder);
        uint256 withdrawn = withdrawnDividends[holder];
        return accumulated > withdrawn ? accumulated - withdrawn : 0;
    }

    /**
     * @dev Internal function to update dividend corrections on transfer
     * @param from Sender address
     * @param to Recipient address
     * @param value Amount transferred
     */
    function _update(address from, address to, uint256 value) internal virtual override {
        super._update(from, to, value);

        int256 magnifiedCorrection = int256(magnifiedDividendPerShare * value);
        
        if (from != address(0)) {
            magnifiedDividendCorrections[from] += magnifiedCorrection;
        }
        
        if (to != address(0)) {
            magnifiedDividendCorrections[to] -= magnifiedCorrection;
        }
    }
}
