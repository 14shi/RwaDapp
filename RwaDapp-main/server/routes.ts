import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertRevenueAssetSchema, insertTokenHolderSchema, insertRevenueDistributionSchema, oracleNonces, processedEvents } from "@shared/schema";
import { z } from "zod";
import { verifyMessage } from "ethers";
import { eq, and, lt } from "drizzle-orm";
import { randomBytes } from "crypto";
import {
  enableOracleService,
  configureOracleService,
  toggleOracleAutomationService,
} from "./services/oracle";
import {
  asyncHandler,
  sendSuccess,
  ErrorHelper,
  BusinessLogicError,
  ErrorCode,
  ValidationError,
  NotFoundError,
  AuthorizationError,
  BlockchainError,
} from "./middleware/errorHandler";

// Get application mode from environment or detect from config
const APP_MODE = process.env.APP_MODE || 'demo';
const IS_DEMO_MODE = APP_MODE === 'demo';
const IS_REAL_MODE = APP_MODE === 'real' || APP_MODE === 'production';

/**
 * Middleware to restrict Demo-only endpoints in Real mode
 */
function demoModeOnly(req: Request, res: Response, next: NextFunction) {
  if (IS_REAL_MODE) {
    return res.status(403).json({ 
      error: "This endpoint is only available in Demo mode",
      message: "In Real mode, use blockchain transactions instead",
      mode: APP_MODE 
    });
  }
  next();
}

/**
 * Nonce management for preventing replay attacks
 * Now using database persistence instead of memory
 */

/**
 * Generate a challenge nonce for signing
 * Valid for 5 minutes, stored in database
 */
async function generateChallenge(assetId: string): Promise<string> {
  const nonce = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
  
  // Get db instance from storage
  const db = (storage as any).db;
  if (!db) {
    // Fallback for MemStorage (Demo mode)
    return nonce;
  }
  
  try {
    // Clean up expired nonces first
    await db.delete(oracleNonces).where(lt(oracleNonces.expiresAt, new Date()));
    
    // Insert or update nonce
    await db.insert(oracleNonces)
      .values({ assetId, nonce, expiresAt })
      .onConflictDoUpdate({
        target: oracleNonces.assetId,
        set: { nonce, expiresAt }
      });
  } catch (error) {
    console.error('Failed to store nonce in database:', error);
  }
  
  return nonce;
}

/**
 * Verify and consume nonce (single-use)
 */
async function verifyAndConsumeNonce(assetId: string, nonce: string): Promise<boolean> {
  const db = (storage as any).db;
  if (!db) {
    // Fallback for MemStorage (Demo mode) - always accept
    return true;
  }
  
  try {
    // Find the nonce
    const result = await db.select().from(oracleNonces)
      .where(eq(oracleNonces.assetId, assetId));
    
    if (result.length === 0) return false;
    
    const stored = result[0];
    if (stored.nonce !== nonce) return false;
    if (new Date() > new Date(stored.expiresAt)) {
      // Expired, delete it
      await db.delete(oracleNonces).where(eq(oracleNonces.assetId, assetId));
      return false;
    }
    
    // Valid nonce, consume it (delete from database)
    await db.delete(oracleNonces).where(eq(oracleNonces.assetId, assetId));
    return true;
  } catch (error) {
    console.error('Failed to verify nonce from database:', error);
    return false;
  }
}

/**
 * Verify wallet signature for owner-only operations
 * Uses personal_sign with nonce for replay protection
 */
function verifyOwnerSignature(
  message: string,
  signature: string,
  expectedAddress: string
): boolean {
  try {
    const recoveredAddress = verifyMessage(message, signature);
    return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
  } catch (error) {
    return false;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // System Status Route
  app.get("/api/status", (req: Request, res: Response) => {
    res.json({
      mode: APP_MODE,
      isDemo: IS_DEMO_MODE,
      isReal: IS_REAL_MODE,
      timestamp: new Date().toISOString(),
    });
  });

  // Revenue Assets Routes
  app.get("/api/assets", asyncHandler(async (req: Request, res: Response) => {
    const assets = await storage.getAllRevenueAssets();
    sendSuccess(res, assets);
  }));

  app.get("/api/assets/:id", asyncHandler(async (req: Request, res: Response) => {
    const asset = await storage.getRevenueAsset(req.params.id);
    if (!asset) {
      throw new NotFoundError('Asset');
    }
    sendSuccess(res, asset);
  }));

  app.get("/api/assets/owner/:address", asyncHandler(async (req: Request, res: Response) => {
    const assets = await storage.getRevenueAssetsByOwner(req.params.address);
    sendSuccess(res, assets);
  }));

  app.post("/api/assets", asyncHandler(async (req: Request, res: Response) => {
    const validatedData = insertRevenueAssetSchema.parse(req.body);
    const asset = await storage.createRevenueAsset(validatedData);
    sendSuccess(res, asset, 201);
  }));

  app.delete("/api/assets/:id", asyncHandler(async (req: Request, res: Response) => {
    await storage.deleteRevenueAsset(req.params.id);
    res.status(204).send();
  }));

  // Import NFT from blockchain
  app.post("/api/assets/import-from-blockchain", async (req: Request, res: Response) => {
    try {
      const nfts = req.body.nfts as Array<{
        tokenId: string;
        name: string;
        assetType: string;
        description: string;
        imageUrl: string;
        estimatedValue: string;
        creator: string;
        isFragmentalized: boolean;
        erc20TokenAddress: string;
      }>;

      if (!Array.isArray(nfts)) {
        return res.status(400).json({ error: "Invalid request: nfts array required" });
      }

      // Optimization: Fetch existing assets once (not in loop)
      const existingAssets = await storage.getAllRevenueAssets();
      const existingTokenIds = new Set(existingAssets.map(a => a.nftTokenId).filter(Boolean));

      const importedAssets = [];
      
      for (const nft of nfts) {
        // Check if already exists by nftTokenId
        if (existingTokenIds.has(nft.tokenId)) {
          const existing = existingAssets.find(a => a.nftTokenId === nft.tokenId);
          // NFT already exists, skip import
          if (existing) importedAssets.push(existing);
          continue;
        }

        // Prepare asset data - only include fields accepted by insertRevenueAssetSchema
        const baseAssetData = {
          name: nft.name,
          description: nft.description,
          assetType: nft.assetType as 'song' | 'gpu' | 'patent' | 'other',
          imageUrl: nft.imageUrl,
          estimatedValue: nft.estimatedValue, // Keep as string for numeric type
          status: nft.isFragmentalized ? 'fragmented' : 'minted',
        };

        // Validate with Zod schema
        try {
          const validatedData = insertRevenueAssetSchema.parse(baseAssetData);
          
          // First create the base asset
          let asset = await storage.createRevenueAsset(validatedData);
          
          // Then update with blockchain-specific fields that are omitted from schema
          asset = await storage.updateRevenueAsset(asset.id, {
            status: nft.isFragmentalized ? 'fragmented' : 'minted',
            nftTokenId: nft.tokenId,
            nftContractAddress: req.body.nftContractAddress,
            ownerAddress: nft.creator,
            isFragmented: nft.isFragmentalized,
            erc20ContractAddress: nft.isFragmentalized && nft.erc20TokenAddress !== '0x0000000000000000000000000000000000000000' 
              ? nft.erc20TokenAddress 
              : undefined,
          }) || asset;
          
          importedAssets.push(asset);
        } catch (validationError) {
          if (validationError instanceof z.ZodError) {
            // Skip invalid NFTs but continue importing others
            continue;
          }
          throw validationError;
        }
      }

      res.status(200).json({ 
        success: true, 
        count: importedAssets.length,
        assets: importedAssets 
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to import NFTs from blockchain" });
    }
  });

  // Mint NFT for asset
  app.post("/api/assets/:id/mint-nft", async (req: Request, res: Response) => {
    try {
      const { nftTokenId, nftTransactionHash, ownerAddress, nftContractAddress } = req.body;
      
      const asset = await storage.getRevenueAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "Asset not found" });
      }

      const updatedAsset = await storage.updateRevenueAsset(req.params.id, {
        status: 'minted',
        nftTokenId,
        nftTransactionHash,
        ownerAddress,
        nftContractAddress,
      });

      res.json(updatedAsset);
    } catch (error) {
      res.status(500).json({ error: "Failed to mint NFT" });
    }
  });

  // Refresh asset from blockchain
  app.post("/api/assets/:id/refresh-from-blockchain", async (req: Request, res: Response) => {
    try {
      const { metadata, fragStatus } = req.body;
      
      const asset = await storage.getRevenueAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "Asset not found" });
      }

      // Correctly derive fragmented state from blockchain data
      const isFragmented = metadata.isFragmentalized ?? metadata.isFragmented ?? fragStatus.isFragmentalized ?? false;
      const erc20Address = fragStatus.erc20Address || metadata.erc20TokenAddress;

      // IMPORTANT: If asset is fractionalized, re-index the ERC20 data
      const updateData: any = {
        isFragmented: isFragmented,
        status: isFragmented ? 'fragmented' : 'minted',
        erc20ContractAddress: erc20Address && erc20Address !== '0x0000000000000000000000000000000000000000' 
          ? erc20Address 
          : undefined,
      };

      // If fractionalized, fetch fresh ERC20 token data from blockchain
      if (isFragmented && erc20Address && erc20Address !== '0x0000000000000000000000000000000000000000') {
        try {
          const { getProvider, getERC20Contract } = await import('./providers/eth.js');
          const { formatEther } = await import('ethers');
          
          const provider = await getProvider();
          const tokenContract = await getERC20Contract(erc20Address, provider);
          
          const [name, symbol, totalSupply, pricePerToken, operatingRevenue, operatingDistributed, owner] = await Promise.all([
            tokenContract.name(),
            tokenContract.symbol(),
            tokenContract.totalSupply(),
            tokenContract.pricePerToken(),
            tokenContract.operatingRevenue(),
            tokenContract.operatingDistributed(),
            tokenContract.owner(),
          ]);

          // Calculate tokensSold from blockchain state (all in wei)
          const ownerBalance = await tokenContract.balanceOf(owner);
          const totalSupplyWei = totalSupply.toString(); // Keep in wei format
          const ownerBalanceWei = ownerBalance.toString();
          const tokensSoldWei = (totalSupply - ownerBalance).toString(); // Calculate in wei

          // Update with fresh blockchain data
          // CRITICAL: Store token amounts in wei format for consistency
          updateData.erc20TokenName = name;
          updateData.erc20TokenSymbol = symbol;
          updateData.totalTokenSupply = totalSupplyWei; // Store as wei string
          updateData.tokensSold = tokensSoldWei; // Store as wei string
          updateData.pricePerToken = formatEther(pricePerToken); // Price in ETH (human-readable)
          updateData.totalRevenue = formatEther(operatingRevenue); // Revenue in ETH (human-readable)
          updateData.distributedRevenue = formatEther(operatingDistributed); // Revenue in ETH (human-readable)
          updateData.ownerAddress = owner;
        } catch (erc20Error) {
          // Continue with basic update
        }
      }

      const updatedAsset = await storage.updateRevenueAsset(req.params.id, updateData);

      res.json(updatedAsset);
    } catch (error) {
      res.status(500).json({ error: "Failed to refresh asset from blockchain" });
    }
  });

  // Set verification request ID for Chainlink verification
  app.post("/api/assets/:id/set-verification-request", async (req: Request, res: Response) => {
    try {
      const { requestId, externalId, transactionHash } = req.body;
      
      const asset = await storage.getRevenueAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "Asset not found" });
      }

      const updatedAsset = await storage.updateRevenueAsset(req.params.id, {
        verificationRequestId: requestId,
        externalId: externalId,
        nftTransactionHash: transactionHash,
        status: 'verifying',
      });

      res.json(updatedAsset);
    } catch (error) {
      res.status(500).json({ error: "Failed to set verification request" });
    }
  });

  // Fractionalize asset (create ERC-20 tokens)
  app.post("/api/assets/:id/fractionalize", asyncHandler(async (req: Request, res: Response) => {
    const { 
      erc20TokenName, 
      erc20TokenSymbol, 
      totalTokenSupply, 
      pricePerToken,
      erc20ContractAddress 
    } = req.body;
    
    const asset = await storage.getRevenueAsset(req.params.id);
    if (!asset) {
      throw new NotFoundError('Asset');
    }

    if (asset.status !== 'minted') {
      throw new BusinessLogicError(
        'Asset must be minted before fractionalization',
        ErrorCode.ASSET_NOT_MINTED
      );
    }

    // CRITICAL: Ensure totalTokenSupply is stored in wei format
    // If it comes as a number (human-readable), convert to wei
    const { parseEther } = await import('ethers');
    let totalTokenSupplyWei: string;
    
    if (typeof totalTokenSupply === 'string') {
      // Check if it's already in wei format (very large number)
      const supplyNum = parseFloat(totalTokenSupply);
      if (supplyNum >= 1e12) {
        // Likely already in wei format
        totalTokenSupplyWei = totalTokenSupply;
      } else {
        // Human-readable format, convert to wei
        totalTokenSupplyWei = parseEther(totalTokenSupply).toString();
      }
    } else {
      // Number format, convert to wei
      totalTokenSupplyWei = parseEther(totalTokenSupply.toString()).toString();
    }

    const updatedAsset = await storage.updateRevenueAsset(req.params.id, {
      status: 'fragmented',
      isFragmented: true,
      erc20TokenName,
      erc20TokenSymbol,
      totalTokenSupply: totalTokenSupplyWei,
      pricePerToken,
      erc20ContractAddress,
      tokensSold: "0", // Store as "0" (wei format, zero)
    });

    sendSuccess(res, updatedAsset);
  }));

  // Purchase tokens (DEMO MODE ONLY - in real mode, use blockchain transactions)
  app.post("/api/assets/:id/purchase-tokens", demoModeOnly, async (req: Request, res: Response) => {
    try {
      const { holderAddress, tokenAmount } = req.body;
      
      const asset = await storage.getRevenueAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "Asset not found" });
      }

      if (!asset.isFragmented) {
        return res.status(400).json({ error: "Asset is not fractionalized" });
      }

      // CRITICAL: tokenAmount from frontend is in human-readable format (e.g., 100)
      // We need to convert to wei before storing
      const { parseEther } = await import('ethers');
      const tokenAmountWei = parseEther(tokenAmount.toString());
      
      // Compare using BigInt (all values in wei)
      const totalSupplyWei = BigInt(asset.totalTokenSupply || "0");
      const tokensSoldWei = BigInt(asset.tokensSold || "0");
      const availableTokensWei = totalSupplyWei - tokensSoldWei;
      
      if (tokenAmountWei > availableTokensWei) {
        return res.status(400).json({ error: "Not enough tokens available" });
      }

      // Check if holder already has tokens
      const existingHolder = await storage.getTokenHolderByAssetAndAddress(req.params.id, holderAddress);
      
      if (existingHolder) {
        // Update existing holder (add to existing balance in wei)
        const existingAmountWei = BigInt(existingHolder.tokenAmount || "0");
        const newAmountWei = existingAmountWei + tokenAmountWei;
        await storage.updateTokenHolder(existingHolder.id, {
          tokenAmount: newAmountWei.toString()
        });
      } else {
        // Create new holder (store in wei)
        await storage.createTokenHolder({
          assetId: req.params.id,
          holderAddress,
          tokenAmount: tokenAmountWei.toString(),
          percentage: "0"
        });
      }

      // Update asset (all calculations in wei)
      const newTokensSoldWei = tokensSoldWei + tokenAmountWei;
      const updatedAsset = await storage.updateRevenueAsset(req.params.id, {
        tokensSold: newTokensSoldWei.toString(),
        status: newTokensSoldWei >= totalSupplyWei ? 'active' : asset.status
      });

      res.json(updatedAsset);
    } catch (error) {
      res.status(500).json({ error: "Failed to purchase tokens" });
    }
  });

  // Record revenue for an asset (DEMO MODE ONLY)
  app.post("/api/assets/:id/record-revenue", demoModeOnly, async (req: Request, res: Response) => {
    try {
      const { amount } = req.body;
      
      const asset = await storage.getRevenueAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "Asset not found" });
      }

      if (!asset.isFragmented) {
        return res.status(400).json({ error: "Asset is not fractionalized" });
      }

      const newTotalRevenue = (parseFloat(asset.totalRevenue || "0") + parseFloat(amount)).toFixed(8);

      const updatedAsset = await storage.updateRevenueAsset(req.params.id, {
        totalRevenue: newTotalRevenue
      });

      res.json(updatedAsset);
    } catch (error) {
      res.status(500).json({ error: "Failed to record revenue" });
    }
  });

  // Distribute revenue to token holders
  // NOTE: This endpoint is for DEMO MODE ONLY
  // In REAL MODE, distribution happens on-chain and is synced via Indexer
  app.post("/api/assets/:id/distribute-revenue", async (req: Request, res: Response) => {
    try {
      const { transactionHash, mode } = req.body;
      
      const asset = await storage.getRevenueAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "Asset not found" });
      }

      if (!asset.isFragmented) {
        return res.status(400).json({ error: "Asset is not fractionalized" });
      }

      // Check if this is a real blockchain transaction (transactionHash provided)
      // If so, fetch data from blockchain instead of database
      if (asset.erc20ContractAddress && mode === 'real') {
        try {
          const { getProvider, getERC20Contract } = await import('./providers/eth.js');
          const { formatEther } = await import('ethers');
          
          const provider = await getProvider();
          const tokenContract = await getERC20Contract(asset.erc20ContractAddress, provider);
          
          // Fetch REAL data from blockchain
          const [operatingRevenue, operatingDistributed, totalSupply, owner] = await Promise.all([
            tokenContract.operatingRevenue(),
            tokenContract.operatingDistributed(),
            tokenContract.totalSupply(),
            tokenContract.owner(),
          ]);
          
          const ownerBalance = await tokenContract.balanceOf(owner);
          const tokensSoldWei = (totalSupply - ownerBalance).toString();
          
          const undistributedRevenue = Number(formatEther(operatingRevenue - operatingDistributed));
          const tokensSoldNumber = Number(formatEther(tokensSoldWei));
          
          if (undistributedRevenue <= 0) {
            return res.status(400).json({ error: "No revenue to distribute on-chain" });
          }
          
          if (tokensSoldNumber <= 0) {
            return res.status(400).json({ error: "Cannot distribute revenue: no tokens sold" });
          }
          
          const perTokenAmount = (undistributedRevenue / tokensSoldNumber).toFixed(8);

          // Create distribution record with blockchain data
          const distribution = await storage.createRevenueDistribution({
            assetId: req.params.id,
            totalAmount: undistributedRevenue.toFixed(8),
            perTokenAmount,
            transactionHash: transactionHash || null
          });

          // Update asset with blockchain data
          const updatedAsset = await storage.updateRevenueAsset(req.params.id, {
            totalRevenue: formatEther(operatingRevenue),
            distributedRevenue: formatEther(operatingDistributed),
            tokensSold: tokensSoldWei,
          });

          return res.json({ distribution, asset: updatedAsset, source: 'blockchain' });
        } catch (blockchainError) {
          console.error('Failed to fetch from blockchain:', blockchainError);
          return res.status(500).json({ error: "Failed to fetch distribution data from blockchain" });
        }
      }

      // DEMO MODE: Use database data
      const undistributedRevenue = parseFloat(asset.totalRevenue || "0") - parseFloat(asset.distributedRevenue || "0");
      if (undistributedRevenue <= 0) {
        return res.status(400).json({ error: "No revenue to distribute" });
      }

      // CRITICAL: tokensSold is now in wei, must convert to token count
      const { formatEther } = await import('ethers');
      const tokensSoldNumber = Number(formatEther(asset.tokensSold || "0"));
      
      // Reject distribution if no tokens have been sold
      if (tokensSoldNumber <= 0) {
        return res.status(400).json({ error: "Cannot distribute revenue: no tokens sold" });
      }
      
      const perTokenAmount = (undistributedRevenue / tokensSoldNumber).toFixed(8);

      // Create distribution record
      const distribution = await storage.createRevenueDistribution({
        assetId: req.params.id,
        totalAmount: undistributedRevenue.toFixed(8),
        perTokenAmount,
        transactionHash: transactionHash || null
      });

      // Update asset
      const updatedAsset = await storage.updateRevenueAsset(req.params.id, {
        distributedRevenue: asset.totalRevenue
      });

      res.json({ distribution, asset: updatedAsset, source: 'demo' });
    } catch (error) {
      console.error('Distribution error:', error);
      res.status(500).json({ error: "Failed to distribute revenue" });
    }
  });

  // Oracle Automation Routes
  // Note: These endpoints use wallet signature verification (personal_sign) with nonce-based replay protection.
  // Future enhancement: Upgrade to EIP-712 typed data signatures.
  
  // Get challenge nonce for signing (prevents replay attacks)
  app.get("/api/assets/:id/oracle-challenge", async (req: Request, res: Response) => {
    try {
      const asset = await storage.getRevenueAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "Asset not found" });
      }

      const nonce = generateChallenge(req.params.id);
      res.json({ nonce });
    } catch (error) {
      res.status(500).json({ error: "Failed to generate challenge" });
    }
  });
  
  app.post("/api/assets/:id/enable-oracle", async (req: Request, res: Response) => {
    try {
      const { ownerAddress, signature, nonce } = req.body;
      
      if (!ownerAddress || !signature || !nonce) {
        return res.status(400).json({ error: "ownerAddress, signature, and nonce are required" });
      }
      
      const asset = await storage.getRevenueAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "Asset not found" });
      }

      if (!asset.isFragmented) {
        return res.status(400).json({ error: "Asset must be fractionalized first" });
      }

      if (!asset.ownerAddress) {
        return res.status(400).json({ error: "Asset has no owner" });
      }

      // Verify and consume nonce (prevents replay)
      if (!verifyAndConsumeNonce(req.params.id, nonce)) {
        return res.status(403).json({ error: "Invalid or expired nonce" });
      }

      // Verify signature with nonce
      const message = `Enable Oracle for asset ${req.params.id}\nNonce: ${nonce}`;
      if (!verifyOwnerSignature(message, signature, asset.ownerAddress)) {
        return res.status(403).json({ error: "Invalid signature or unauthorized" });
      }

      const updatedAsset = await storage.updateRevenueAsset(req.params.id, {
        isOracleEnabled: true,
      });

      res.json(updatedAsset);
    } catch (error) {
      res.status(500).json({ error: "Failed to enable oracle" });
    }
  });

  app.post("/api/assets/:id/configure-oracle", async (req: Request, res: Response) => {
    try {
      const { subscriptionId, donId, updateInterval, revenueSource, ownerAddress, signature, nonce } = req.body;
      
      if (!ownerAddress || !signature || !nonce) {
        return res.status(400).json({ error: "ownerAddress, signature, and nonce are required" });
      }
      
      const asset = await storage.getRevenueAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "Asset not found" });
      }

      if (!asset.isOracleEnabled) {
        return res.status(400).json({ error: "Asset is not oracle-enabled. Call /enable-oracle first" });
      }

      if (!asset.ownerAddress) {
        return res.status(400).json({ error: "Asset has no owner" });
      }

      // Verify and consume nonce (prevents replay)
      if (!verifyAndConsumeNonce(req.params.id, nonce)) {
        return res.status(403).json({ error: "Invalid or expired nonce" });
      }

      // Verify signature with nonce
      const message = `Configure Oracle for asset ${req.params.id}\nNonce: ${nonce}`;
      if (!verifyOwnerSignature(message, signature, asset.ownerAddress)) {
        return res.status(403).json({ error: "Invalid signature or unauthorized" });
      }

      const updatedAsset = await storage.updateRevenueAsset(req.params.id, {
        oracleSubscriptionId: subscriptionId,
        oracleDonId: donId,
        oracleUpdateInterval: updateInterval,
        oracleRevenueSource: revenueSource,
      });

      res.json(updatedAsset);
    } catch (error) {
      res.status(500).json({ error: "Failed to configure oracle" });
    }
  });

  app.post("/api/assets/:id/toggle-oracle-automation", async (req: Request, res: Response) => {
    try {
      const { enabled, ownerAddress, signature, nonce } = req.body;
      
      if (!ownerAddress || !signature || !nonce) {
        return res.status(400).json({ error: "ownerAddress, signature, and nonce are required" });
      }
      
      if (enabled === undefined) {
        return res.status(400).json({ error: "enabled flag is required" });
      }
      
      const asset = await storage.getRevenueAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "Asset not found" });
      }

      if (!asset.isOracleEnabled) {
        return res.status(400).json({ error: "Asset is not oracle-enabled" });
      }

      if (!asset.ownerAddress) {
        return res.status(400).json({ error: "Asset has no owner" });
      }

      // Verify and consume nonce (prevents replay)
      if (!verifyAndConsumeNonce(req.params.id, nonce)) {
        return res.status(403).json({ error: "Invalid or expired nonce" });
      }

      // Verify signature with nonce
      const message = `Toggle Oracle automation for asset ${req.params.id} to ${enabled}\nNonce: ${nonce}`;
      if (!verifyOwnerSignature(message, signature, asset.ownerAddress)) {
        return res.status(403).json({ error: "Invalid signature or unauthorized" });
      }

      const updates: Partial<typeof asset> = {
        oracleAutoEnabled: enabled,
      };

      if (enabled && !asset.oracleLastUpdate) {
        updates.oracleLastUpdate = new Date();
      }

      const updatedAsset = await storage.updateRevenueAsset(req.params.id, updates);

      res.json(updatedAsset);
    } catch (error) {
      res.status(500).json({ error: "Failed to toggle automation" });
    }
  });

  app.get("/api/assets/:id/oracle-status", async (req: Request, res: Response) => {
    try {
      const asset = await storage.getRevenueAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "Asset not found" });
      }

      res.json({
        isOracleEnabled: asset.isOracleEnabled || false,
        oracleAutoEnabled: asset.oracleAutoEnabled || false,
        oracleUpdateInterval: asset.oracleUpdateInterval,
        oracleLastUpdate: asset.oracleLastUpdate,
        nextUpdateTime: asset.oracleLastUpdate && asset.oracleUpdateInterval
          ? new Date(asset.oracleLastUpdate.getTime() + asset.oracleUpdateInterval * 1000)
          : null,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get oracle status" });
    }
  });
  
  // ========== Oracle Debug and Testing Routes ==========
  
  // Get comprehensive Oracle debug information
  app.get("/api/oracle-debug", async (req: Request, res: Response) => {
    try {
      const { tokenAddress } = req.query;
      const { getOracleDebugInfo } = await import('./services/oracle.js');
      
      const debugInfo = await getOracleDebugInfo(tokenAddress as string | undefined);
      res.json(debugInfo);
    } catch (error) {
      res.status(500).json({ 
        error: "Failed to get Oracle debug info",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // Get on-chain Oracle configuration for a specific token
  app.get("/api/oracle-debug/:tokenAddress", async (req: Request, res: Response) => {
    try {
      const { getOracleConfigFromChain } = await import('./services/oracle.js');
      
      const config = await getOracleConfigFromChain(req.params.tokenAddress);
      if (!config) {
        return res.status(404).json({ error: "Could not fetch Oracle config from chain" });
      }
      
      res.json(config);
    } catch (error) {
      res.status(500).json({ 
        error: "Failed to get Oracle configuration",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // Manual Oracle update trigger (for testing)
  app.post("/api/oracle-debug/trigger-update", async (req: Request, res: Response) => {
    try {
      const { tokenAddress, newRevenue } = req.body;
      
      if (!tokenAddress || newRevenue === undefined) {
        return res.status(400).json({ error: "tokenAddress and newRevenue are required" });
      }
      
      const { triggerOracleUpdate } = await import('./services/oracle.js');
      const result = await triggerOracleUpdate(tokenAddress, newRevenue.toString());
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Failed to trigger Oracle update:', error);
      res.status(500).json({ 
        error: "Failed to trigger Oracle update",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // Check if Oracle upkeep is needed
  app.get("/api/oracle-debug/check-upkeep/:tokenAddress", async (req: Request, res: Response) => {
    try {
      const { checkOracleUpkeep } = await import('./services/oracle.js');
      
      const result = await checkOracleUpkeep(req.params.tokenAddress);
      res.json(result);
    } catch (error) {
      console.error('Failed to check Oracle upkeep:', error);
      res.status(500).json({ 
        error: "Failed to check Oracle upkeep",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // Manually perform Oracle upkeep (for testing)
  app.post("/api/oracle-debug/perform-upkeep", async (req: Request, res: Response) => {
    try {
      const { tokenAddress, performData } = req.body;
      
      if (!tokenAddress) {
        return res.status(400).json({ error: "tokenAddress is required" });
      }
      
      const { performOracleUpkeep } = await import('./services/oracle.js');
      const result = await performOracleUpkeep(tokenAddress, performData || '0x');
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Failed to perform Oracle upkeep:', error);
      res.status(500).json({ 
        error: "Failed to perform Oracle upkeep",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Token Holders Routes
  app.get("/api/token-holders/asset/:assetId", async (req: Request, res: Response) => {
    try {
      const holders = await storage.getTokenHoldersByAsset(req.params.assetId);
      res.json(holders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch token holders" });
    }
  });

  app.get("/api/token-holders/address/:address", async (req: Request, res: Response) => {
    try {
      const holders = await storage.getTokenHoldersByAddress(req.params.address);
      res.json(holders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch token holdings" });
    }
  });

  // Get real token balances from blockchain for an address
  app.get("/api/token-holders/blockchain/:address", async (req: Request, res: Response) => {
    try {
      const userAddress = req.params.address;
      const assets = await storage.getAllRevenueAssets();
      
      // Filter for fractionalized assets with ERC20 addresses
      const fractionalizedAssets = assets.filter(
        a => a.isFragmented && a.erc20ContractAddress && a.erc20ContractAddress !== '0x0000000000000000000000000000000000000000'
      );

      if (fractionalizedAssets.length === 0) {
        return res.json([]);
      }

      const { getProvider, getERC20Contract } = await import('./providers/eth.js');
      const { formatEther } = await import('ethers');
      const provider = await getProvider();

      // Query balances from blockchain
      const balances = await Promise.all(
        fractionalizedAssets.map(async (asset) => {
          try {
            const contract = await getERC20Contract(asset.erc20ContractAddress!, provider);
            const balance = await contract.balanceOf(userAddress);
            const balanceNumber = Number(formatEther(balance));
            
            // Only return assets where user has non-zero balance
            if (balanceNumber > 0) {
              // Convert totalTokenSupply from wei (string) to human-readable number
              const totalSupplyNumber = Number(formatEther(asset.totalTokenSupply || '0'));
              
              return {
                assetId: asset.id,
                assetName: asset.name,
                tokenAmount: balanceNumber,
                erc20ContractAddress: asset.erc20ContractAddress,
                erc20TokenSymbol: asset.erc20TokenSymbol,
                pricePerToken: asset.pricePerToken,
                totalTokenSupply: totalSupplyNumber,
                totalRevenue: asset.totalRevenue,
                distributedRevenue: asset.distributedRevenue,
              };
            }
            return null;
          } catch (error) {
            console.error(`Failed to query balance for asset ${asset.id}:`, error);
            return null;
          }
        })
      );

      const nonZeroBalances = balances.filter(b => b !== null);
      res.json(nonZeroBalances);
    } catch (error) {
      console.error('Failed to fetch blockchain balances:', error);
      res.status(500).json({ error: "Failed to fetch blockchain balances" });
    }
  });

  // Revenue Distributions Routes
  app.get("/api/distributions/asset/:assetId", async (req: Request, res: Response) => {
    try {
      const distributions = await storage.getRevenueDistributionsByAsset(req.params.assetId);
      res.json(distributions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch distributions" });
    }
  });

  // Data validation and repair endpoints
  app.post("/api/system/validate-data", async (req: Request, res: Response) => {
    try {
      const { getProvider, getNFTContract, getERC20Contract } = await import('./providers/eth.js');
      const { formatEther } = await import('ethers');
      
      const provider = await getProvider();
      const assets = await storage.getAllRevenueAssets();
      const issues: Array<{assetId: string, assetName: string, issue: string, severity: string}> = [];

      for (const asset of assets) {
        // Validate fractionalized assets
        if (asset.isFragmented && asset.erc20ContractAddress) {
          try {
            const tokenContract = await getERC20Contract(asset.erc20ContractAddress, provider);
            
            // Fetch blockchain data
            const [totalSupply, owner] = await Promise.all([
              tokenContract.totalSupply(),
              tokenContract.owner(),
            ]);
            const ownerBalance = await tokenContract.balanceOf(owner);
            
            const totalSupplyNumber = Number(formatEther(totalSupply));
            const ownerBalanceNumber = Number(formatEther(ownerBalance));
            const actualTokensSold = Math.max(0, totalSupplyNumber - ownerBalanceNumber);

            // Check for data inconsistencies (compare wei values)
            const dbTotalSupply = Number(formatEther(asset.totalTokenSupply || '0'));
            const dbTokensSold = Number(formatEther(asset.tokensSold || '0'));
            
            if (Math.abs(dbTotalSupply - totalSupplyNumber) > 0.001) {
              issues.push({
                assetId: asset.id,
                assetName: asset.name,
                issue: `totalTokenSupply 不一致: DB=${dbTotalSupply}, 区块链=${totalSupplyNumber}`,
                severity: 'high'
              });
            }

            if (Math.abs(dbTokensSold - actualTokensSold) > 0.001) {
              issues.push({
                assetId: asset.id,
                assetName: asset.name,
                issue: `tokensSold 不一致: DB=${dbTokensSold}, 区块链=${actualTokensSold}`,
                severity: 'high'
              });
            }

            // Check for suspicious values
            if (totalSupplyNumber < 1 && totalSupplyNumber > 0) {
              issues.push({
                assetId: asset.id,
                assetName: asset.name,
                issue: `totalTokenSupply 异常小: ${totalSupplyNumber}`,
                severity: 'critical'
              });
            }
          } catch (error) {
            issues.push({
              assetId: asset.id,
              assetName: asset.name,
              issue: `无法验证区块链数据: ${(error as Error).message}`,
              severity: 'medium'
            });
          }
        }
      }

      res.json({ 
        totalAssets: assets.length,
        issuesFound: issues.length,
        issues 
      });
    } catch (error) {
      console.error('Data validation failed:', error);
      res.status(500).json({ error: "数据验证失败" });
    }
  });

  app.post("/api/system/repair-data", async (req: Request, res: Response) => {
    try {
      const { getProvider, getNFTContract, getERC20Contract } = await import('./providers/eth.js');
      const { formatEther } = await import('ethers');
      
      const provider = await getProvider();
      const assets = await storage.getAllRevenueAssets();
      const repaired: Array<{assetId: string, assetName: string, changes: string[]}> = [];

      for (const asset of assets) {
        if (asset.isFragmented && asset.erc20ContractAddress) {
          try {
            const tokenContract = await getERC20Contract(asset.erc20ContractAddress, provider);
            
            // Fetch fresh blockchain data
            const [name, symbol, totalSupply, pricePerToken, operatingRevenue, operatingDistributed, owner] = await Promise.all([
              tokenContract.name(),
              tokenContract.symbol(),
              tokenContract.totalSupply(),
              tokenContract.pricePerToken(),
              tokenContract.operatingRevenue(),
              tokenContract.operatingDistributed(),
              tokenContract.owner(),
            ]);

            const ownerBalance = await tokenContract.balanceOf(owner);
            // Store as wei strings for consistency
            // Note: totalSupply and ownerBalance are already BigInt in ethers v6
            const totalSupplyWei = totalSupply.toString();
            const ownerBalanceWei = ownerBalance.toString();
            const tokensSoldWei = (totalSupply - ownerBalance).toString();
            
            // For display in change log
            const totalSupplyNumber = Number(formatEther(totalSupply));
            const tokensSoldNumber = Number(formatEther(tokensSoldWei));

            const changes: string[] = [];
            const updateData: any = {};

            // Check and update each field (comparing wei values)
            if (asset.totalTokenSupply !== totalSupplyWei) {
              changes.push(`totalTokenSupply: ${formatEther(asset.totalTokenSupply || '0')} → ${totalSupplyNumber}`);
              updateData.totalTokenSupply = totalSupplyWei;
            }

            if (asset.tokensSold !== tokensSoldWei) {
              changes.push(`tokensSold: ${formatEther(asset.tokensSold || '0')} → ${tokensSoldNumber}`);
              updateData.tokensSold = tokensSoldWei;
            }

            if (asset.erc20TokenName !== name) {
              changes.push(`erc20TokenName: ${asset.erc20TokenName} → ${name}`);
              updateData.erc20TokenName = name;
            }

            if (asset.erc20TokenSymbol !== symbol) {
              changes.push(`erc20TokenSymbol: ${asset.erc20TokenSymbol} → ${symbol}`);
              updateData.erc20TokenSymbol = symbol;
            }

            if (asset.pricePerToken !== formatEther(pricePerToken)) {
              changes.push(`pricePerToken: ${asset.pricePerToken} → ${formatEther(pricePerToken)}`);
              updateData.pricePerToken = formatEther(pricePerToken);
            }

            if (asset.totalRevenue !== formatEther(operatingRevenue)) {
              changes.push(`totalRevenue: ${asset.totalRevenue} → ${formatEther(operatingRevenue)}`);
              updateData.totalRevenue = formatEther(operatingRevenue);
            }

            if (asset.distributedRevenue !== formatEther(operatingDistributed)) {
              changes.push(`distributedRevenue: ${asset.distributedRevenue} → ${formatEther(operatingDistributed)}`);
              updateData.distributedRevenue = formatEther(operatingDistributed);
            }

            if (asset.ownerAddress !== owner) {
              changes.push(`ownerAddress: ${asset.ownerAddress} → ${owner}`);
              updateData.ownerAddress = owner;
            }

            // Apply updates if any changes detected
            if (changes.length > 0) {
              await storage.updateRevenueAsset(asset.id, updateData);
              repaired.push({
                assetId: asset.id,
                assetName: asset.name,
                changes
              });
              console.log(`✓ Repaired asset ${asset.name}:`, changes);
            }
          } catch (error) {
            console.error(`Failed to repair asset ${asset.id}:`, error);
          }
        }
      }

      res.json({ 
        totalChecked: assets.length,
        totalRepaired: repaired.length,
        repaired 
      });
    } catch (error) {
      console.error('Data repair failed:', error);
      res.status(500).json({ error: "数据修复失败" });
    }
  });

  // ========== Data Migration Route ==========
  
  // DEPRECATED: This migration endpoint has incorrect logic
  // It converts wei to Ether, but current system standard is to store in wei format
  // DO NOT USE - kept for reference only
  app.post("/api/migrate-token-amounts", async (req: Request, res: Response) => {
    res.status(410).json({ 
      error: "This endpoint is deprecated and disabled",
      message: "This migration logic is incorrect for the current data format standard. " +
               "The system now stores token amounts in wei format (as strings). " +
               "If you need to migrate data, use the correct migration script in server/scripts/migrate-token-amounts.ts",
      recommendation: "Run: npx tsx server/scripts/migrate-token-amounts.ts"
    });
  });

  // ========== Oracle Automation Routes ==========
  
  // Get oracle status
  app.get("/api/assets/:id/oracle-status", async (req: Request, res: Response) => {
    try {
      const asset = await storage.getRevenueAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "资产不found" });
      }
      
      res.json({
        isOracleEnabled: asset.isOracleEnabled || false,
        oracleAutoEnabled: asset.oracleAutoEnabled || false,
        oracleSubscriptionId: asset.oracleSubscriptionId,
        oracleDonId: asset.oracleDonId,
        oracleUpdateInterval: asset.oracleUpdateInterval,
        oracleRevenueSource: asset.oracleRevenueSource,
        oracleLastUpdate: asset.oracleLastUpdate,
      });
    } catch (error) {
      res.status(500).json({ error: "获取Oracle状态失败" });
    }
  });
  
  // Get nonce challenge for Oracle operations
  app.get("/api/assets/:id/oracle-challenge", async (req: Request, res: Response) => {
    try {
      const asset = await storage.getRevenueAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "资产不存在" });
      }
      
      const nonce = generateChallenge(req.params.id);
      res.json({ nonce });
    } catch (error) {
      res.status(500).json({ error: "生成挑战失败" });
    }
  });
  
  // Enable Oracle
  app.post("/api/assets/:id/enable-oracle", async (req: Request, res: Response) => {
    try {
      const { ownerAddress, signature, nonce } = req.body;
      const asset = await storage.getRevenueAsset(req.params.id);
      
      if (!asset) {
        return res.status(404).json({ error: "资产不存在" });
      }
      
      // Verify owner
      if (asset.ownerAddress?.toLowerCase() !== ownerAddress.toLowerCase()) {
        return res.status(403).json({ error: "只有资产所有者可以启用Oracle" });
      }
      
      // Verify nonce
      if (!verifyAndConsumeNonce(req.params.id, nonce)) {
        return res.status(401).json({ error: "无效或过期的nonce" });
      }
      
      // Verify signature
      const message = `Enable Oracle for asset ${req.params.id}\nNonce: ${nonce}`;
      if (!verifyOwnerSignature(message, signature, ownerAddress)) {
        return res.status(401).json({ error: "签名验证失败" });
      }
      
      // Call Oracle service
      const result = await enableOracleService(asset);
      
      // Update database
      await storage.updateRevenueAsset(req.params.id, {
        isOracleEnabled: true,
      });
      
      res.json({
        success: result.success,
        message: result.message,
        mode: result.mode,
        transactionHash: result.transactionHash,
      });
    } catch (error: any) {
      console.error('Enable oracle failed:', error);
      res.status(500).json({ error: error.message || "启用Oracle失败" });
    }
  });
  
  // Configure Oracle parameters
  app.post("/api/assets/:id/configure-oracle", async (req: Request, res: Response) => {
    try {
      const { ownerAddress, signature, nonce, subscriptionId, donId, updateInterval, revenueSource } = req.body;
      const asset = await storage.getRevenueAsset(req.params.id);
      
      if (!asset) {
        return res.status(404).json({ error: "资产不存在" });
      }
      
      // Verify owner
      if (asset.ownerAddress?.toLowerCase() !== ownerAddress.toLowerCase()) {
        return res.status(403).json({ error: "只有资产所有者可以配置Oracle" });
      }
      
      // Verify nonce
      if (!verifyAndConsumeNonce(req.params.id, nonce)) {
        return res.status(401).json({ error: "无效或过期的nonce" });
      }
      
      // Verify signature
      const message = `Configure Oracle for asset ${req.params.id}\nNonce: ${nonce}`;
      if (!verifyOwnerSignature(message, signature, ownerAddress)) {
        return res.status(401).json({ error: "签名验证失败" });
      }
      
      // Call Oracle service to update blockchain
      const result = await configureOracleService(asset, {
        subscriptionId,
        donId,
        updateInterval,
        revenueSource,
      });
      
      // Update database
      await storage.updateRevenueAsset(req.params.id, {
        oracleSubscriptionId: subscriptionId,
        oracleDonId: donId,
        oracleUpdateInterval: updateInterval,
        oracleRevenueSource: revenueSource,
      });
      
      res.json({
        success: result.success,
        message: result.message,
        mode: result.mode,
        transactionHash: result.transactionHash,
      });
    } catch (error: any) {
      console.error('Configure oracle failed:', error);
      res.status(500).json({ error: error.message || "配置Oracle失败" });
    }
  });
  
  // Toggle Oracle automation
  app.post("/api/assets/:id/toggle-oracle-automation", async (req: Request, res: Response) => {
    try {
      const { ownerAddress, signature, nonce, enabled } = req.body;
      const asset = await storage.getRevenueAsset(req.params.id);
      
      if (!asset) {
        return res.status(404).json({ error: "资产不存在" });
      }
      
      // Verify owner
      if (asset.ownerAddress?.toLowerCase() !== ownerAddress.toLowerCase()) {
        return res.status(403).json({ error: "只有资产所有者可以切换Oracle自动化" });
      }
      
      // Verify nonce
      if (!verifyAndConsumeNonce(req.params.id, nonce)) {
        return res.status(401).json({ error: "无效或过期的nonce" });
      }
      
      // Verify signature
      const message = `Toggle Oracle automation for asset ${req.params.id} to ${enabled}\nNonce: ${nonce}`;
      if (!verifyOwnerSignature(message, signature, ownerAddress)) {
        return res.status(401).json({ error: "签名验证失败" });
      }
      
      // Call Oracle service to update blockchain
      const result = await toggleOracleAutomationService(asset, enabled);
      
      // Update database
      await storage.updateRevenueAsset(req.params.id, {
        oracleAutoEnabled: enabled,
        oracleLastUpdate: enabled ? new Date() : asset.oracleLastUpdate,
      });
      
      res.json({
        success: result.success,
        message: result.message,
        mode: result.mode,
        transactionHash: result.transactionHash,
      });
    } catch (error: any) {
      console.error('Toggle automation failed:', error);
      res.status(500).json({ error: error.message || "切换自动化失败" });
    }
  });

  // Admin endpoint to refresh all asset data from blockchain
  app.post("/api/admin/refresh-all-assets", async (req: Request, res: Response) => {
    try {
      console.log('Starting asset refresh...');
      const assets = await storage.getAllRevenueAssets();
      console.log(`Found ${assets.length} total assets`);
      const refreshedCount = { total: 0, success: 0, failed: 0 };
      
      // Import the blockchainIndexer instance
      const { blockchainIndexer } = await import('./indexer');
      
      for (const asset of assets) {
        refreshedCount.total++;
        console.log(`  Checking asset ${asset.id}: ${asset.name}, has contract: ${!!asset.erc20ContractAddress}`);
        
        if (asset.erc20ContractAddress) {
          try {
            console.log(`  Re-indexing ${asset.name} at ${asset.erc20ContractAddress}...`);
            // Re-index the ERC20 token to update tokensSold with correct calculation
            await (blockchainIndexer as any).indexERC20Token(asset.id, asset.erc20ContractAddress);
            refreshedCount.success++;
            console.log(`  ✓ Refreshed asset ${asset.id}: ${asset.name}`);
          } catch (error: any) {
            refreshedCount.failed++;
            console.error(`  ✗ Failed to refresh asset ${asset.id}:`, error.message);
          }
        }
      }
      
      console.log(`Refresh complete: ${refreshedCount.success}/${refreshedCount.total} assets`);
      res.json({
        success: true,
        message: `Refreshed ${refreshedCount.success}/${refreshedCount.total} assets`,
        stats: refreshedCount,
      });
    } catch (error: any) {
      console.error('Failed to refresh assets:', error);
      res.status(500).json({ error: error.message || "刷新失败" });
    }
  });

  // Oracle Scheduler Routes (定时任务管理)
  app.get("/api/oracle/scheduler/status", async (req: Request, res: Response) => {
    try {
      const { oracleScheduler } = await import('./services/scheduler');
      const status = oracleScheduler.getStatus();
      res.json({ status });
    } catch (error) {
      console.error('Failed to get scheduler status:', error);
      res.status(500).json({ error: "Failed to get scheduler status" });
    }
  });

  app.post("/api/oracle/scheduler/init", async (req: Request, res: Response) => {
    try {
      const { oracleScheduler } = await import('./services/scheduler');
      await oracleScheduler.initialize();
      res.json({ success: true, message: "Scheduler initialized" });
    } catch (error) {
      console.error('Failed to initialize scheduler:', error);
      res.status(500).json({ error: "Failed to initialize scheduler" });
    }
  });

  app.post("/api/oracle/scheduler/trigger/:assetId", async (req: Request, res: Response) => {
    try {
      const { assetId } = req.params;
      const { oracleScheduler } = await import('./services/scheduler');
      await oracleScheduler.triggerTask(assetId);
      res.json({ success: true, message: "Manual trigger executed" });
    } catch (error) {
      console.error('Failed to manually trigger Oracle:', error);
      res.status(500).json({ error: "Failed to trigger Oracle update" });
    }
  });

  app.post("/api/oracle/scheduler/restart/:assetId", async (req: Request, res: Response) => {
    try {
      const { assetId } = req.params;
      const { interval } = req.body;
      const { oracleScheduler } = await import('./services/scheduler');
      
      if (interval) {
        await oracleScheduler.restartTask(assetId, interval);
      } else {
        // Reschedule with existing interval
        const asset = await storage.getRevenueAsset(assetId);
        if (asset && asset.oracleUpdateInterval) {
          await oracleScheduler.scheduleTask(assetId, asset.oracleUpdateInterval);
        }
      }
      
      res.json({ success: true, message: "Task rescheduled" });
    } catch (error) {
      console.error('Failed to restart scheduler task:', error);
      res.status(500).json({ error: "Failed to restart task" });
    }
  });

  app.post("/api/oracle/scheduler/stop/:assetId", async (req: Request, res: Response) => {
    try {
      const { assetId } = req.params;
      const { oracleScheduler } = await import('./services/scheduler');
      oracleScheduler.clearTask(assetId);
      res.json({ success: true, message: "Task stopped" });
    } catch (error) {
      console.error('Failed to stop scheduler task:', error);
      res.status(500).json({ error: "Failed to stop task" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
