import { 
  type RevenueAsset, 
  type InsertRevenueAsset,
  type TokenHolder,
  type InsertTokenHolder,
  type RevenueDistribution,
  type InsertRevenueDistribution,
  revenueAssets,
  tokenHolders,
  revenueDistributions
} from "@shared/schema";
import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, and } from "drizzle-orm";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

// Import error classes for proper error handling
class NotFoundError extends Error {
  constructor(resource: string) {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
  }
}

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Configure Neon for serverless
neonConfig.webSocketConstructor = ws;

export interface IStorage {
  // Revenue Assets
  getRevenueAsset(id: string): Promise<RevenueAsset | undefined>;
  getAllRevenueAssets(): Promise<RevenueAsset[]>;
  getRevenueAssetsByOwner(ownerAddress: string): Promise<RevenueAsset[]>;
  createRevenueAsset(asset: InsertRevenueAsset): Promise<RevenueAsset>;
  updateRevenueAsset(id: string, asset: Partial<RevenueAsset>): Promise<RevenueAsset | undefined>;
  deleteRevenueAsset(id: string): Promise<void>;
  
  // Token Holders
  getTokenHolder(id: string): Promise<TokenHolder | undefined>;
  getAllTokenHolders(): Promise<TokenHolder[]>;
  getTokenHoldersByAsset(assetId: string): Promise<TokenHolder[]>;
  getTokenHoldersByAddress(holderAddress: string): Promise<TokenHolder[]>;
  getTokenHolderByAssetAndAddress(assetId: string, holderAddress: string): Promise<TokenHolder | undefined>;
  createTokenHolder(holder: InsertTokenHolder): Promise<TokenHolder>;
  updateTokenHolder(id: string, holder: Partial<TokenHolder>): Promise<TokenHolder | undefined>;
  deleteTokenHolder(id: string): Promise<void>;
  
  // Revenue Distributions
  getRevenueDistribution(id: string): Promise<RevenueDistribution | undefined>;
  getRevenueDistributionsByAsset(assetId: string): Promise<RevenueDistribution[]>;
  createRevenueDistribution(distribution: InsertRevenueDistribution): Promise<RevenueDistribution>;
}

export class MemStorage implements IStorage {
  private revenueAssets: Map<string, RevenueAsset>;
  private tokenHolders: Map<string, TokenHolder>;
  private revenueDistributions: Map<string, RevenueDistribution>;

  constructor() {
    this.revenueAssets = new Map();
    this.tokenHolders = new Map();
    this.revenueDistributions = new Map();
  }

  // Revenue Assets Methods
  async getRevenueAsset(id: string): Promise<RevenueAsset | undefined> {
    return this.revenueAssets.get(id);
  }

  async getAllRevenueAssets(): Promise<RevenueAsset[]> {
    return Array.from(this.revenueAssets.values());
  }

  async getRevenueAssetsByOwner(ownerAddress: string): Promise<RevenueAsset[]> {
    return Array.from(this.revenueAssets.values()).filter(
      (asset) => asset.ownerAddress === ownerAddress,
    );
  }

  async createRevenueAsset(insertAsset: InsertRevenueAsset): Promise<RevenueAsset> {
    const id = randomUUID();
    const asset: RevenueAsset = { 
      ...insertAsset,
      id,
      nftTokenId: null,
      nftContractAddress: null,
      ownerAddress: null,
      nftTransactionHash: null,
      verificationRequestId: null,
      isVerified: false,
      externalId: null,
      isFragmented: false,
      erc20TokenName: null,
      erc20TokenSymbol: null,
      erc20ContractAddress: null,
      totalTokenSupply: null,
      tokensSold: "0",
      pricePerToken: null,
      totalRevenue: "0",
      distributedRevenue: "0",
      createdAt: new Date(),
      status: "pending",
      isOracleEnabled: false,
      oracleSubscriptionId: null,
      oracleDonId: null,
      oracleUpdateInterval: null,
      oracleLastUpdate: null,
      oracleAutoEnabled: false,
      oracleRevenueSource: null,
    };
    this.revenueAssets.set(id, asset);
    return asset;
  }

  async updateRevenueAsset(id: string, updates: Partial<RevenueAsset>): Promise<RevenueAsset | undefined> {
    const asset = this.revenueAssets.get(id);
    if (!asset) {
      throw new NotFoundError('Asset');
    }
    
    // Validate data constraints
    const merged = { ...asset, ...updates };
    if (merged.tokensSold && merged.totalTokenSupply) {
      if (BigInt(merged.tokensSold) > BigInt(merged.totalTokenSupply)) {
        throw new ValidationError('tokensSold cannot exceed totalTokenSupply');
      }
    }
    
    const updatedAsset = merged;
    this.revenueAssets.set(id, updatedAsset);
    return updatedAsset;
  }

  async deleteRevenueAsset(id: string): Promise<void> {
    this.revenueAssets.delete(id);
  }

  // Token Holders Methods
  async getTokenHolder(id: string): Promise<TokenHolder | undefined> {
    return this.tokenHolders.get(id);
  }

  async getAllTokenHolders(): Promise<TokenHolder[]> {
    return Array.from(this.tokenHolders.values());
  }

  async getTokenHoldersByAsset(assetId: string): Promise<TokenHolder[]> {
    return Array.from(this.tokenHolders.values()).filter(
      (holder) => holder.assetId === assetId,
    );
  }

  async getTokenHoldersByAddress(holderAddress: string): Promise<TokenHolder[]> {
    return Array.from(this.tokenHolders.values()).filter(
      (holder) => holder.holderAddress === holderAddress,
    );
  }

  async getTokenHolderByAssetAndAddress(assetId: string, holderAddress: string): Promise<TokenHolder | undefined> {
    return Array.from(this.tokenHolders.values()).find(
      (holder) => holder.assetId === assetId && holder.holderAddress === holderAddress,
    );
  }

  async createTokenHolder(insertHolder: InsertTokenHolder): Promise<TokenHolder> {
    const id = randomUUID();
    const holder: TokenHolder = {
      ...insertHolder,
      id,
      percentage: "0",
      availableRevenue: "0",
      purchasedAt: new Date(),
    };
    this.tokenHolders.set(id, holder);
    return holder;
  }

  async updateTokenHolder(id: string, updates: Partial<TokenHolder>): Promise<TokenHolder | undefined> {
    const holder = this.tokenHolders.get(id);
    if (!holder) {
      throw new NotFoundError('TokenHolder');
    }
    
    // Validate token amount is non-negative
    const merged = { ...holder, ...updates };
    if (merged.tokenAmount && BigInt(merged.tokenAmount) < BigInt(0)) {
      throw new ValidationError('tokenAmount cannot be negative');
    }
    
    const updatedHolder = merged;
    this.tokenHolders.set(id, updatedHolder);
    return updatedHolder;
  }

  async deleteTokenHolder(id: string): Promise<void> {
    this.tokenHolders.delete(id);
  }

  // Revenue Distributions Methods
  async getRevenueDistribution(id: string): Promise<RevenueDistribution | undefined> {
    return this.revenueDistributions.get(id);
  }

  async getRevenueDistributionsByAsset(assetId: string): Promise<RevenueDistribution[]> {
    return Array.from(this.revenueDistributions.values()).filter(
      (distribution) => distribution.assetId === assetId,
    );
  }

  async createRevenueDistribution(insertDistribution: InsertRevenueDistribution): Promise<RevenueDistribution> {
    const id = randomUUID();
    const distribution: RevenueDistribution = {
      ...insertDistribution,
      id,
      transactionHash: insertDistribution.transactionHash || null,
      distributedAt: new Date(),
    };
    this.revenueDistributions.set(id, distribution);
    return distribution;
  }
}

// PostgreSQL Storage Implementation
export class PgStorage implements IStorage {
  private db: ReturnType<typeof drizzle>;

  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    this.db = drizzle(pool);
  }

  // Revenue Assets Methods
  async getRevenueAsset(id: string): Promise<RevenueAsset | undefined> {
    const result = await this.db.select().from(revenueAssets).where(eq(revenueAssets.id, id));
    return result[0];
  }

  async getAllRevenueAssets(): Promise<RevenueAsset[]> {
    return await this.db.select().from(revenueAssets);
  }

  async getRevenueAssetsByOwner(ownerAddress: string): Promise<RevenueAsset[]> {
    return await this.db.select().from(revenueAssets).where(eq(revenueAssets.ownerAddress, ownerAddress));
  }

  async createRevenueAsset(insertAsset: InsertRevenueAsset): Promise<RevenueAsset> {
    const result = await this.db.insert(revenueAssets).values(insertAsset).returning();
    return result[0];
  }

  async updateRevenueAsset(id: string, updates: Partial<RevenueAsset>): Promise<RevenueAsset | undefined> {
    // Check if asset exists
    const existing = await this.getRevenueAsset(id);
    if (!existing) {
      throw new NotFoundError('Asset');
    }
    
    // Validate data constraints
    const merged = { ...existing, ...updates };
    if (merged.tokensSold && merged.totalTokenSupply) {
      if (BigInt(merged.tokensSold) > BigInt(merged.totalTokenSupply)) {
        throw new ValidationError('tokensSold cannot exceed totalTokenSupply');
      }
    }
    
    const result = await this.db.update(revenueAssets)
      .set(updates)
      .where(eq(revenueAssets.id, id))
      .returning();
    return result[0];
  }

  async deleteRevenueAsset(id: string): Promise<void> {
    await this.db.delete(revenueAssets).where(eq(revenueAssets.id, id));
  }

  // Token Holders Methods
  async getTokenHolder(id: string): Promise<TokenHolder | undefined> {
    const result = await this.db.select().from(tokenHolders).where(eq(tokenHolders.id, id));
    return result[0];
  }

  async getAllTokenHolders(): Promise<TokenHolder[]> {
    return await this.db.select().from(tokenHolders);
  }

  async getTokenHoldersByAsset(assetId: string): Promise<TokenHolder[]> {
    return await this.db.select().from(tokenHolders).where(eq(tokenHolders.assetId, assetId));
  }

  async getTokenHoldersByAddress(holderAddress: string): Promise<TokenHolder[]> {
    return await this.db.select().from(tokenHolders).where(eq(tokenHolders.holderAddress, holderAddress));
  }

  async getTokenHolderByAssetAndAddress(assetId: string, holderAddress: string): Promise<TokenHolder | undefined> {
    const result = await this.db.select().from(tokenHolders)
      .where(and(eq(tokenHolders.assetId, assetId), eq(tokenHolders.holderAddress, holderAddress)));
    return result[0];
  }

  async createTokenHolder(insertHolder: InsertTokenHolder): Promise<TokenHolder> {
    const result = await this.db.insert(tokenHolders).values(insertHolder).returning();
    return result[0];
  }

  async updateTokenHolder(id: string, updates: Partial<TokenHolder>): Promise<TokenHolder | undefined> {
    // Check if holder exists
    const existing = await this.getTokenHolder(id);
    if (!existing) {
      throw new NotFoundError('TokenHolder');
    }
    
    // Validate token amount is non-negative
    const merged = { ...existing, ...updates };
    if (merged.tokenAmount && BigInt(merged.tokenAmount) < BigInt(0)) {
      throw new ValidationError('tokenAmount cannot be negative');
    }
    
    const result = await this.db.update(tokenHolders)
      .set(updates)
      .where(eq(tokenHolders.id, id))
      .returning();
    return result[0];
  }

  async deleteTokenHolder(id: string): Promise<void> {
    await this.db.delete(tokenHolders).where(eq(tokenHolders.id, id));
  }

  // Revenue Distributions Methods
  async getRevenueDistribution(id: string): Promise<RevenueDistribution | undefined> {
    const result = await this.db.select().from(revenueDistributions).where(eq(revenueDistributions.id, id));
    return result[0];
  }

  async getRevenueDistributionsByAsset(assetId: string): Promise<RevenueDistribution[]> {
    return await this.db.select().from(revenueDistributions).where(eq(revenueDistributions.assetId, assetId));
  }

  async createRevenueDistribution(insertDistribution: InsertRevenueDistribution): Promise<RevenueDistribution> {
    const result = await this.db.insert(revenueDistributions).values(insertDistribution).returning();
    return result[0];
  }
}

// Use PostgreSQL in production, MemStorage for development/testing
export const storage = process.env.DATABASE_URL ? new PgStorage() : new MemStorage();
