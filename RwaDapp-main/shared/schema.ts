import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Revenue Assets - represents revenue-generating assets (songs, GPUs, etc.)
export const revenueAssets = pgTable("revenue_assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description").notNull(),
  assetType: text("asset_type").notNull(), // 'song', 'gpu', 'video', 'other'
  imageUrl: text("image_url").notNull(),
  estimatedValue: numeric("estimated_value", { precision: 18, scale: 8 }).notNull(),
  
  // NFT Information
  nftTokenId: text("nft_token_id"),
  nftContractAddress: text("nft_contract_address"),
  ownerAddress: text("owner_address"),
  nftTransactionHash: text("nft_transaction_hash"),
  
  // Chainlink Verification
  verificationRequestId: text("verification_request_id"),
  isVerified: boolean("is_verified").default(false),
  externalId: text("external_id"),
  
  // Chainlink Automation (Oracle mode)
  isOracleEnabled: boolean("is_oracle_enabled").default(false),
  oracleSubscriptionId: text("oracle_subscription_id"),
  oracleDonId: text("oracle_don_id"),
  oracleUpdateInterval: integer("oracle_update_interval"),
  oracleLastUpdate: timestamp("oracle_last_update"),
  oracleAutoEnabled: boolean("oracle_auto_enabled").default(false),
  oracleRevenueSource: text("oracle_revenue_source"),
  
  // Fractionalization Information
  isFragmented: boolean("is_fragmented").notNull().default(false),
  erc20TokenName: text("erc20_token_name"),
  erc20TokenSymbol: text("erc20_token_symbol"),
  erc20ContractAddress: text("erc20_contract_address"),
  totalTokenSupply: numeric("total_token_supply", { precision: 78, scale: 0 }),
  tokensSold: numeric("tokens_sold", { precision: 78, scale: 0 }).default("0"),
  pricePerToken: numeric("price_per_token", { precision: 18, scale: 8 }), // ETH price
  
  // Revenue Information
  totalRevenue: numeric("total_revenue", { precision: 18, scale: 8 }).default("0"),
  distributedRevenue: numeric("distributed_revenue", { precision: 18, scale: 8 }).default("0"),
  
  createdAt: timestamp("created_at").defaultNow(),
  status: text("status").notNull().default("pending"), // pending, minted, fragmented, active
});

// Token Holders - tracks who owns fractionalized tokens
export const tokenHolders = pgTable("token_holders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assetId: varchar("asset_id").notNull(),
  holderAddress: text("holder_address").notNull(),
  tokenAmount: numeric("token_amount", { precision: 78, scale: 0 }).notNull(),
  percentage: numeric("percentage", { precision: 10, scale: 6 }).notNull().default("0"), // percentage of total supply (0-100)
  availableRevenue: numeric("available_revenue", { precision: 18, scale: 8 }).default("0"), // ETH available to withdraw
  purchasedAt: timestamp("purchased_at").defaultNow(),
});

// Revenue Distributions - tracks revenue distribution events
export const revenueDistributions = pgTable("revenue_distributions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assetId: varchar("asset_id").notNull(),
  totalAmount: numeric("total_amount", { precision: 18, scale: 8 }).notNull(),
  perTokenAmount: numeric("per_token_amount", { precision: 18, scale: 8 }).notNull(),
  distributedAt: timestamp("distributed_at").defaultNow(),
  transactionHash: text("transaction_hash"),
});

// Oracle Nonces - for preventing replay attacks
export const oracleNonces = pgTable("oracle_nonces", {
  assetId: varchar("asset_id").primaryKey(),
  nonce: text("nonce").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Processed Events - for idempotent event handling
export const processedEvents = pgTable("processed_events", {
  eventId: varchar("event_id").primaryKey(), // format: txHash-logIndex
  eventType: text("event_type").notNull(), // TokensPurchased, Transfer, etc.
  assetId: varchar("asset_id"),
  blockNumber: integer("block_number").notNull(),
  transactionHash: text("transaction_hash").notNull(),
  processedAt: timestamp("processed_at").defaultNow(),
});

// Insert Schemas
export const insertRevenueAssetSchema = createInsertSchema(revenueAssets).omit({
  id: true,
  nftTokenId: true,
  nftContractAddress: true,
  ownerAddress: true,
  nftTransactionHash: true,
  isFragmented: true,
  erc20TokenName: true,
  erc20TokenSymbol: true,
  erc20ContractAddress: true,
  totalTokenSupply: true,
  tokensSold: true,
  pricePerToken: true,
  totalRevenue: true,
  distributedRevenue: true,
  createdAt: true,
  status: true,
});

export const insertTokenHolderSchema = createInsertSchema(tokenHolders).omit({
  id: true,
  purchasedAt: true,
});

export const insertRevenueDistributionSchema = createInsertSchema(revenueDistributions).omit({
  id: true,
  distributedAt: true,
});

export const insertOracleNonceSchema = createInsertSchema(oracleNonces).omit({
  createdAt: true,
});

export const insertProcessedEventSchema = createInsertSchema(processedEvents).omit({
  processedAt: true,
});

// Types
export type InsertRevenueAsset = z.infer<typeof insertRevenueAssetSchema>;
export type RevenueAsset = typeof revenueAssets.$inferSelect;

export type InsertTokenHolder = z.infer<typeof insertTokenHolderSchema>;
export type TokenHolder = typeof tokenHolders.$inferSelect;

export type InsertRevenueDistribution = z.infer<typeof insertRevenueDistributionSchema>;
export type RevenueDistribution = typeof revenueDistributions.$inferSelect;

export type InsertOracleNonce = z.infer<typeof insertOracleNonceSchema>;
export type OracleNonce = typeof oracleNonces.$inferSelect;

export type InsertProcessedEvent = z.infer<typeof insertProcessedEventSchema>;
export type ProcessedEvent = typeof processedEvents.$inferSelect;

// ====================================
// On-Chain Data DTOs (Read from blockchain)
// ====================================

/**
 * NFT metadata from RevenueAssetNFT contract
 */
export interface NFTMetadataDTO {
  tokenId: string;
  name: string;
  assetType: string;
  description: string;
  imageUrl: string;
  estimatedValue: string; // in ETH
  creator: string; // address
  owner: string; // address
  isFragmentalized: boolean;
  erc20TokenAddress: string; // address or 0x0000...
}

/**
 * ERC20 token contract state
 */
export interface ERC20TokenDTO {
  address: string;
  name: string;
  symbol: string;
  totalSupply: string; // in wei, formatted to tokens
  pricePerToken: string; // in ETH
  totalRevenue: string; // in ETH
  distributedRevenue: string; // in ETH
  owner: string; // address
  nftTokenId: string;
}

/**
 * Token holder balance (from ERC20.balanceOf)
 */
export interface TokenHolderDTO {
  assetId: string; // internal DB ID (if available)
  tokenAddress: string; // ERC20 contract address
  holderAddress: string;
  balance: string; // in tokens (formatted from wei)
  availableRevenue: string; // in ETH (from getHolderRevenue)
}

/**
 * Event log entry
 */
export interface BlockchainEventDTO {
  eventName: string;
  contractAddress: string;
  blockNumber: number;
  transactionHash: string;
  args: Record<string, any>;
  timestamp?: number;
}

/**
 * Asset enriched with on-chain data
 */
export interface AssetWithOnChainDataDTO extends RevenueAsset {
  // On-chain state (live from contracts)
  onChainOwner?: string;
  onChainTotalRevenue?: string;
  onChainDistributedRevenue?: string;
  onChainTokenSupply?: string;
  // Computed fields
  totalHolders?: number;
  undistributedRevenue?: string;
}

/**
 * Portfolio summary for a holder
 */
export interface HolderPortfolioDTO {
  holderAddress: string;
  holdings: Array<{
    asset: AssetWithOnChainDataDTO;
    tokenBalance: string; // on-chain balance
    investmentValue: string; // tokenBalance * pricePerToken
    availableRevenue: string; // from contract
    sharePercentage: number; // (balance / totalSupply) * 100
  }>;
  totalInvestment: string; // sum of all investments
  totalAvailableRevenue: string; // sum of all available revenues
}
