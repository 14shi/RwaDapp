import { formatEther, ZeroAddress } from 'ethers';
import {
  getProvider,
  getWebSocketProvider,
  getNFTContract,
  getFactoryContract,
  getERC20Contract,
  getOracleTokenContract,
  NFT_CONTRACT_ADDRESS,
  ORACLE_FACTORY_ADDRESS,
} from './providers/eth';
import { storage } from './storage';
import { processedEvents } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { NFTMetadataDTO, ERC20TokenDTO, BlockchainEventDTO, TokenHolder } from '@shared/schema';

/**
 * Convert AssetType enum (uint8) to string
 */
function assetTypeToString(assetType: number): string {
  const types = ['Spotify', 'Patent', 'GPU', 'Custom'];
  return types[assetType] || 'Custom';
}

/**
 * Blockchain Event Indexer
 * Listens to smart contract events and maintains a cache in the database
 */
class BlockchainIndexer {
  private isRunning = false;
  private lastProcessedBlock = 0;

  /**
   * Start the indexer
   * 1. Perform cold-start recovery (scan historical events)
   * 2. Start listening to new events
   */
  async start() {
    if (this.isRunning) {
      console.log('Indexer already running');
      return;
    }

    console.log('Starting blockchain indexer...');
    this.isRunning = true;

    try {
      // Step 1: Cold-start recovery - ENABLED to sync existing blockchain data
      try {
        await this.performColdStartRecovery();
        console.log('Cold-start recovery completed successfully');
      } catch (recoveryError) {
        console.warn('Cold-start recovery failed, continuing with event listeners:', recoveryError);
        // Continue even if recovery fails - event listeners will catch new events
      }

      // Step 2: Start event listeners
      await this.startEventListeners();

      console.log('Blockchain indexer started successfully');
    } catch (error) {
      console.error('Failed to start indexer:', error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Cold-start recovery: Scan all NFTs from blockchain and rebuild state
   */
  async performColdStartRecovery() {
    console.log('Performing cold-start recovery from blockchain...');

    const provider = await getProvider();
    const nftContract = await getNFTContract(provider);
    const factoryContract = await getFactoryContract(provider);

    try {
      // Get total number of NFTs
      const totalSupply = await nftContract.getTotalSupply();
      const totalCount = Number(totalSupply);
      console.log(`Found ${totalCount} NFTs on blockchain`);

      if (totalCount === 0) {
        console.log('No NFTs found, skipping recovery');
        return;
      }

      // Fetch all existing assets from DB for deduplication
      const existingAssets = await storage.getAllRevenueAssets();
      const existingTokenIds = new Set(existingAssets.map(a => a.nftTokenId).filter(Boolean));

      // Process each NFT
      for (let tokenId = 1; tokenId <= totalCount; tokenId++) {
        try {
          // Skip if already in database
          if (existingTokenIds.has(tokenId.toString())) {
            console.log(`NFT ${tokenId} already indexed, skipping`);
            continue;
          }

          console.log(`Indexing NFT ${tokenId}...`);
          
          // Add delay to avoid rate limiting
          if (tokenId > 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }

          // Fetch NFT metadata from contract
          const metadata = await nftContract.getAssetMetadata(tokenId);
          const owner = await nftContract.ownerOf(tokenId);

          // Create asset in database
          const asset = await storage.createRevenueAsset({
            name: metadata.name,
            description: metadata.description,
            assetType: assetTypeToString(metadata.assetType),
            imageUrl: metadata.imageUrl,
            estimatedValue: formatEther(metadata.estimatedValue),
          });

          // Update with blockchain data
          await storage.updateRevenueAsset(asset.id, {
            status: metadata.isFragmentalized ? 'fragmented' : 'minted',
            nftTokenId: tokenId.toString(),
            nftContractAddress: NFT_CONTRACT_ADDRESS,
            ownerAddress: owner,
            isFragmented: metadata.isFragmentalized,
          });

          // If fractionalized, fetch ERC20 token data
          if (metadata.isFragmentalized && metadata.erc20TokenAddress !== '0x0000000000000000000000000000000000000000') {
            console.log(`  - Fetching ERC20 data for NFT ${tokenId}...`);
            await this.indexERC20Token(asset.id, metadata.erc20TokenAddress);
            
            // Note: indexERC20Token already calculated correct tokensSold from blockchain state
            // We skip historical event scanning for token purchases to avoid double counting
            // Only scan revenue-related events which are not captured by indexERC20Token
            await this.scanHistoricalRevenueEvents(asset.id, metadata.erc20TokenAddress);
            
            // Setup Oracle event listeners for this fractionalized asset
            await this.setupOracleEventListeners(asset.id, metadata.erc20TokenAddress);
          }

          console.log(`  ✓ Indexed NFT ${tokenId}: ${metadata.name}`);
        } catch (error: any) {
          console.error(`  ✗ Failed to index NFT ${tokenId}:`, error.message?.split('\n')[0] || error.message);
          // Continue with next NFT
        }
      }

      console.log(`Cold-start recovery complete! Indexed ${totalCount} NFTs`);
    } catch (error) {
      console.error('Cold-start recovery failed:', error);
      throw error;
    }
  }

  /**
   * Index ERC20 token data for a fractionalized asset
   */
  async indexERC20Token(assetId: string, tokenAddress: string) {
    const provider = await getProvider();
    const tokenContract = await getERC20Contract(tokenAddress, provider);

    try {
      // V2 contracts use operatingRevenue instead of totalRevenue
      const [name, symbol, totalSupply, pricePerToken, operatingRevenue, operatingDistributed, owner] = await Promise.all([
        tokenContract.name(),
        tokenContract.symbol(),
        tokenContract.totalSupply(),
        tokenContract.pricePerToken(),
        tokenContract.operatingRevenue(),
        tokenContract.operatingDistributed(),
        tokenContract.owner(),
      ]);

      // Store ALL token quantities in wei (as strings) for consistency
      // Conversion to human-readable format happens in frontend only
      const totalSupplyWei = totalSupply.toString();

      // First update asset with basic ERC20 data (without tokensSold yet)
      await storage.updateRevenueAsset(assetId, {
        erc20TokenName: name,
        erc20TokenSymbol: symbol,
        erc20ContractAddress: tokenAddress,
        totalTokenSupply: totalSupplyWei,
        pricePerToken: formatEther(pricePerToken),
        totalRevenue: formatEther(operatingRevenue),
        distributedRevenue: formatEther(operatingDistributed),
        ownerAddress: owner,
      });
      
      // Rebuild all token holders from blockchain
      await this.rebuildTokenHolders(assetId, tokenAddress);
      
      // Calculate tokens_sold from holder balances (all in wei)
      const holders = await storage.getTokenHoldersByAsset(assetId);
      const tokensSoldBigInt = holders.reduce((sum, holder) => {
        const amountBigInt = BigInt(holder.tokenAmount || 0);
        return sum + amountBigInt;
      }, BigInt(0));

      // Update with calculated tokensSold (in wei)
      await storage.updateRevenueAsset(assetId, {
        tokensSold: tokensSoldBigInt.toString(),
      });

      console.log(`    ✓ Indexed ERC20: ${name} (${symbol}) - ${formatEther(tokensSoldBigInt)}/${formatEther(totalSupplyWei)} tokens sold`);
    } catch (error: any) {
      console.error(`    ✗ Failed to index ERC20 ${tokenAddress}:`, error.message?.split('\n')[0] || error.message);
    }
  }

  /**
   * Rebuild all token holders from blockchain balances
   * This ensures data consistency and calculates accurate percentages
   * @param assetId - Internal asset ID
   * @param tokenAddress - ERC20 contract address
   * @param additionalAddresses - Additional addresses to include (e.g., new buyers)
   */
  async rebuildTokenHolders(assetId: string, tokenAddress: string, additionalAddresses: string[] = []) {
    try {
      const provider = await getProvider();
      const tokenContract = await getERC20Contract(tokenAddress, provider);
      
      // Get asset data
      const asset = await storage.getRevenueAsset(assetId);
      if (!asset) {
        console.error(`    ✗ Asset ${assetId} not found`);
        return;
      }
      
      const totalSupply = await tokenContract.totalSupply();
      const totalSupplyWei = totalSupply.toString(); // Keep in wei for accuracy
      const owner = await tokenContract.owner();
      
      // Discover ALL holder addresses by scanning Transfer events
      const holderAddresses = await this.discoverHolderAddresses(tokenAddress);
      
      // Always include owner address
      holderAddresses.add(owner.toLowerCase());
      
      // Include any additional addresses (e.g., new buyers from events)
      for (const addr of additionalAddresses) {
        holderAddresses.add(addr.toLowerCase());
      }
      
      // Also include existing DB holders as fallback
      const allHolders = await storage.getAllTokenHolders();
      const existingHolders = allHolders.filter(h => h.assetId === assetId);
      for (const h of existingHolders) {
        holderAddresses.add(h.holderAddress.toLowerCase());
      }
      
      // Query balances from blockchain for all holders
      for (const address of Array.from(holderAddresses)) {
        try {
          const balance = await tokenContract.balanceOf(address);
          const balanceWei = balance.toString(); // Store in wei for accuracy
          
          const existingHolder = existingHolders.find(h => h.holderAddress.toLowerCase() === address.toLowerCase());
          
          // Handle zero balances: delete record unless it's the owner
          if (balance === BigInt(0)) {
            if (address.toLowerCase() !== owner.toLowerCase()) {
              // Delete stale holder record
              if (existingHolder) {
                await storage.deleteTokenHolder(existingHolder.id);
                console.log(`    ✓ Removed holder ${address} (zero balance)`);
              }
              continue;
            }
            // For owner with zero balance, keep the record but update it
          }
          
          // Calculate percentage using BigInt to avoid precision loss
          const balanceBigInt = BigInt(balanceWei);
          const totalSupplyBigInt = BigInt(totalSupplyWei);
          const percentage = totalSupplyBigInt > BigInt(0) 
            ? Number(balanceBigInt * BigInt(10000) / totalSupplyBigInt) / 100 
            : 0;
          
          // Update or create holder record (all amounts in wei)
          if (existingHolder) {
            await storage.updateTokenHolder(existingHolder.id, {
              tokenAmount: balanceWei,
              percentage: percentage.toFixed(6),
            });
          } else {
            await storage.createTokenHolder({
              assetId,
              holderAddress: address,
              tokenAmount: balanceWei,
            });
            
            // Update the newly created holder with percentage
            const newHolder = await storage.getTokenHolderByAssetAndAddress(assetId, address);
            if (newHolder) {
              await storage.updateTokenHolder(newHolder.id, {
                percentage: percentage.toFixed(6),
              });
            }
          }
        } catch (error: any) {
          console.error(`    ✗ Failed to rebuild holder ${address}:`, error.message);
        }
      }
      
      console.log(`    ✓ Rebuilt ${holderAddresses.size} token holders with percentages`);
    } catch (error: any) {
      console.error(`    ✗ Failed to rebuild token holders:`, error.message);
    }
  }

  /**
   * Discover all holder addresses by scanning Transfer events
   * This ensures we find ALL token holders, not just those in our database
   */
  async discoverHolderAddresses(tokenAddress: string): Promise<Set<string>> {
    const holderAddresses = new Set<string>();
    
    try {
      const provider = await getProvider();
      const tokenContract = await getERC20Contract(tokenAddress, provider);
      
      // Get current block
      const currentBlock = await provider.getBlockNumber();
      
      // Find token creation block by scanning for first Transfer(0x0, *, *) event (mint)
      // Scan up to 400k blocks (~8 weeks) to catch older tokens
      const maxScanBlocks = 400000;
      let fromBlock = Math.max(0, currentBlock - maxScanBlocks);
      
      try {
        // Ethers v6: Use chunked queries to find creation block (first mint)
        // Search backwards in chunks to avoid RPC block range limits
        const searchChunkSize = 50000;
        let creationBlockFound = false;
        
        for (let searchStart = fromBlock; searchStart <= currentBlock && !creationBlockFound; searchStart += searchChunkSize) {
          const searchEnd = Math.min(searchStart + searchChunkSize - 1, currentBlock);
          try {
            const mintEvents = await tokenContract.queryFilter(
              tokenContract.getEvent("Transfer"),
              searchStart,
              searchEnd
            );
            
            // Filter for mints (from === address(0))
            const actualMints = mintEvents.filter((event: any) => {
              if ('args' in event && event.args) {
                const from = event.args.from;
                return from === '0x0000000000000000000000000000000000000000' || from === ZeroAddress;
              }
              return false;
            });
            
            if (actualMints.length > 0 && 'blockNumber' in actualMints[0]) {
              fromBlock = actualMints[0].blockNumber;
              console.log(`    ✓ Found token creation at block ${fromBlock}`);
              creationBlockFound = true;
              break;
            }
          } catch (chunkError: any) {
            console.log(`    ⚠ Failed to scan blocks ${searchStart}-${searchEnd} for creation: ${chunkError.message}`);
            // Continue with next chunk
          }
        }
        
        if (!creationBlockFound) {
          console.log(`    ⚠ No mint event found, using ${maxScanBlocks}-block window`);
        }
      } catch (error: any) {
        console.log(`    ⚠ Could not scan for creation block:`, error.message);
        fromBlock = Math.max(0, currentBlock - maxScanBlocks);
      }
      
      // Query Transfer events in chunks to avoid RPC timeouts
      const chunkSize = 50000; // ~1 week on Sepolia
      let allTransferEvents: any[] = [];
      
      for (let start = fromBlock; start <= currentBlock; start += chunkSize) {
        const end = Math.min(start + chunkSize - 1, currentBlock);
        try {
          // Ethers v6: Direct queryFilter with getEvent
          const events = await tokenContract.queryFilter(
            tokenContract.getEvent("Transfer"),
            start,
            end
          );
          allTransferEvents = allTransferEvents.concat(events);
        } catch (error: any) {
          console.error(`    ⚠ Failed to scan blocks ${start}-${end}:`, error.message);
          // Continue with next chunk
        }
      }
      
      const transferEvents = allTransferEvents;
      
      // Collect all addresses that have received tokens
      for (const event of transferEvents) {
        // Type guard: check if event is EventLog
        if ('args' in event && event.args) {
          const to = event.args.to;
          const from = event.args.from;
          
          if (to && to !== '0x0000000000000000000000000000000000000000') {
            holderAddresses.add(to.toLowerCase());
          }
          if (from && from !== '0x0000000000000000000000000000000000000000') {
            holderAddresses.add(from.toLowerCase());
          }
        }
      }
      
      console.log(`    ✓ Discovered ${holderAddresses.size} unique addresses from ${transferEvents.length} Transfer events`);
    } catch (error: any) {
      console.error(`    ✗ Failed to discover holder addresses:`, error.message);
      // Return empty set, will fall back to other discovery methods
    }
    
    return holderAddresses;
  }

  /**
   * Start listening to blockchain events
   */
  async startEventListeners() {
    console.log('Starting event listeners...');

    try {
      const provider = await getWebSocketProvider();
      const nftContract = await getNFTContract(provider);
      const factoryContract = await getFactoryContract(provider);

      // Listen to AssetMinted events (Oracle contract signature: tokenId, name, assetType, creator)
      nftContract.on('AssetMinted', async (tokenId, name, assetType, creator, event) => {
        console.log(`Event: AssetMinted - TokenID: ${tokenId}, Name: ${name}, Creator: ${creator}`);
        try {
          await this.handleAssetMinted(tokenId, name, assetType, creator, event);
        } catch (error) {
          console.error('Error handling AssetMinted event:', error);
        }
      });

      // Listen to AssetFragmentalized events
      nftContract.on('AssetFragmentalized', async (tokenId, erc20Token, event) => {
        console.log(`Event: AssetFragmentalized - TokenID: ${tokenId}, ERC20: ${erc20Token}`);
        try {
          await this.handleAssetFragmentalized(tokenId, erc20Token, event);
        } catch (error) {
          console.error('Error handling AssetFragmentalized event:', error);
        }
      });

      // Listen to VerificationFulfilled events from Chainlink Oracle
      nftContract.on('VerificationFulfilled', async (requestId, tokenId, verified, event) => {
        console.log(`Event: VerificationFulfilled - Request: ${requestId}, TokenID: ${tokenId}, Verified: ${verified}`);
        try {
          await this.handleVerificationFulfilled(requestId, tokenId, verified, event);
        } catch (error) {
          console.error('Error handling VerificationFulfilled event:', error);
        }
      });

      // Listen to OracleTokenCreated events from Oracle Factory
      factoryContract.on('OracleTokenCreated', async (nftTokenId, tokenAddress, tokenName, tokenSymbol, totalSupply, router, event) => {
        console.log(`Event: OracleTokenCreated - NFT: ${nftTokenId}, Token: ${tokenAddress}`);
        try {
          await this.handleTokenCreated(nftTokenId, tokenAddress, event);
        } catch (error) {
          console.error('Error handling OracleTokenCreated event:', error);
        }
      });

      // CRITICAL: Setup event listeners for ALL existing fractionalized assets
      // This ensures we don't miss events for assets created before server restart
      await this.setupEventListenersForExistingAssets();

      // Start periodic revenue sync to keep database in sync with blockchain
      this.startPeriodicSync();

      console.log('Event listeners started successfully');
    } catch (error) {
      console.error('Failed to start event listeners:', error);
      // Continue without live events (will rely on periodic polling)
    }
  }

  /**
   * Setup event listeners for all existing fractionalized assets
   * This is called on startup to ensure we don't miss events for existing assets
   */
  async setupEventListenersForExistingAssets() {
    console.log('Setting up event listeners for existing fractionalized assets...');
    
    try {
      const assets = await storage.getAllRevenueAssets();
      const fractionalizedAssets = assets.filter(a => a.isFragmented && a.erc20ContractAddress);
      
      console.log(`Found ${fractionalizedAssets.length} fractionalized assets`);
      
      for (const asset of fractionalizedAssets) {
        try {
          await this.setupOracleEventListeners(asset.id, asset.erc20ContractAddress!);
          console.log(`  ✓ Setup listeners for ${asset.name} (${asset.erc20ContractAddress})`);
        } catch (error: any) {
          console.error(`  ✗ Failed to setup listeners for ${asset.name}:`, error.message);
        }
      }
      
      console.log('Finished setting up listeners for existing assets');
    } catch (error: any) {
      console.error('Failed to setup listeners for existing assets:', error.message);
    }
  }

  /**
   * Scan historical revenue-related events for a token contract
   * Note: We do NOT scan TokensPurchased events because tokensSold is already
   * accurately calculated from blockchain state (totalSupply - ownerBalance) in indexERC20Token.
   * Scanning purchase events would cause double counting.
   */
  async scanHistoricalRevenueEvents(assetId: string, erc20Address: string) {
    console.log(`  - Scanning historical revenue events for token ${erc20Address}...`);
    
    try {
      const provider = await getProvider();
      const tokenContract = await getOracleTokenContract(erc20Address, provider);
      
      // For Sepolia testnet, use a large range to ensure complete history
      // In production, this should be the contract deployment block
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 200000); // ~4 weeks on Sepolia
      
      // Scan OperatingRevenueRecorded events
      // These events are NOT reflected in blockchain state, so we must scan them
      try {
        const revenueFilter = tokenContract.filters.OperatingRevenueRecorded();
        const revenueEvents = await tokenContract.queryFilter(revenueFilter, fromBlock, currentBlock);
        
        for (const event of revenueEvents) {
          if ('args' in event && event.args) {
            const amount = event.args[0];
            const totalOperatingRevenue = event.args[1];
            // Note: handleOperatingRevenueRecorded updates totalRevenue from event data
            // This is correct because the event contains the blockchain truth
            await this.handleOperatingRevenueRecorded(assetId, amount, totalOperatingRevenue, event);
          }
        }
        
        if (revenueEvents.length > 0) {
          console.log(`    ✓ Recovered ${revenueEvents.length} revenue recording events`);
        }
      } catch (error: any) {
        console.log(`    ℹ No OperatingRevenueRecorded events found`);
      }
      
      // Scan OperatingRevenueDistributed events
      // These create distribution records that are not in blockchain state
      try {
        const distributionFilter = tokenContract.filters.OperatingRevenueDistributed();
        const distributionEvents = await tokenContract.queryFilter(distributionFilter, fromBlock, currentBlock);
        
        for (const event of distributionEvents) {
          if ('args' in event && event.args) {
            const amount = event.args[0];
            const totalDistributed = event.args[1];
            await this.handleOperatingRevenueDistributed(assetId, amount, totalDistributed, event);
          }
        }
        
        if (distributionEvents.length > 0) {
          console.log(`    ✓ Recovered ${distributionEvents.length} distribution events`);
        }
      } catch (error: any) {
        console.log(`    ℹ No OperatingRevenueDistributed events found`);
      }
      
    } catch (error: any) {
      console.error(`    ✗ Failed to scan historical revenue events:`, error.message?.split('\n')[0] || error.message);
    }
  }

  /**
   * Setup Oracle Automation event listeners for a specific fractionalized asset
   * This is called when an asset is fractionalized to monitor automated revenue events
   */
  async setupOracleEventListeners(assetId: string, erc20Address: string) {
    try {
      const provider = await getWebSocketProvider();
      const oracleContract = await getOracleTokenContract(erc20Address, provider);

      // Listen to TokensPurchased events
      // Ethers v6: callback signature is (buyer, amount, cost, event)
      oracleContract.on('TokensPurchased', async (buyer, amount, cost, event) => {
        console.log(`Event: TokensPurchased - Asset: ${assetId}, Buyer: ${buyer}, Amount: ${formatEther(amount)}`);
        try {
          await this.handleTokensPurchased(assetId, buyer, amount, cost, event);
        } catch (error) {
          console.error('Error handling TokensPurchased event:', error);
        }
      });

      // Listen to OperatingRevenueRecorded events
      // Ethers v6: callback signature is (amount, totalOperatingRevenue, event)
      oracleContract.on('OperatingRevenueRecorded', async (amount, totalOperatingRevenue, event) => {
        console.log(`Event: OperatingRevenueRecorded - Asset: ${assetId}, Amount: ${formatEther(amount)} ETH`);
        try {
          await this.handleOperatingRevenueRecorded(assetId, amount, totalOperatingRevenue, event);
        } catch (error) {
          console.error('Error handling OperatingRevenueRecorded event:', error);
        }
      });

      // Listen to OperatingRevenueDistributed events
      // Ethers v6: callback signature is (amount, totalDistributed, event)
      oracleContract.on('OperatingRevenueDistributed', async (amount, totalDistributed, event) => {
        console.log(`Event: OperatingRevenueDistributed - Asset: ${assetId}, Amount: ${formatEther(amount)} ETH`);
        try {
          await this.handleOperatingRevenueDistributed(assetId, amount, totalDistributed, event);
        } catch (error) {
          console.error('Error handling OperatingRevenueDistributed event:', error);
        }
      });

      // Listen to AutomatedRevenueRequested events
      // Ethers v6: callback signature is (requestId, timestamp, event)
      oracleContract.on('AutomatedRevenueRequested', async (requestId, timestamp, event) => {
        console.log(`Event: AutomatedRevenueRequested - Asset: ${assetId}, Request: ${requestId}`);
        try {
          await this.handleAutomatedRevenueRequested(assetId, requestId, timestamp, event);
        } catch (error) {
          console.error('Error handling AutomatedRevenueRequested event:', error);
        }
      });

      // Listen to AutomatedRevenueDistributed events
      // Ethers v6: callback signature is (amount, timestamp, event)
      oracleContract.on('AutomatedRevenueDistributed', async (amount, timestamp, event) => {
        console.log(`Event: AutomatedRevenueDistributed - Asset: ${assetId}, Amount: ${formatEther(amount)} ETH`);
        try {
          await this.handleAutomatedRevenueDistributed(assetId, amount, timestamp, event);
        } catch (error) {
          console.error('Error handling AutomatedRevenueDistributed event:', error);
        }
      });

      // CRITICAL: Listen to Transfer events for token holder balance updates
      // Ethers v6: callback signature is (from, to, amount, event)
      oracleContract.on('Transfer', async (from, to, amount, event) => {
        console.log(`Event: Transfer - Asset: ${assetId}, From: ${from}, To: ${to}, Amount: ${formatEther(amount)}`);
        try {
          await this.handleTokenTransfer(assetId, erc20Address, from, to, amount, event);
        } catch (error) {
          console.error('Error handling Transfer event:', error);
        }
      });

      console.log(`  ✓ Revenue event listeners setup for asset ${assetId} (${erc20Address})`);
    } catch (error: any) {
      // If contract doesn't support Oracle events, silently ignore
      // This allows both Oracle and non-Oracle tokens to coexist
      console.log(`  ℹ Asset ${assetId} uses non-Oracle token (${erc20Address}), skipping Oracle listeners`);
    }
  }

  /**
   * Event handlers
   */
  private async handleAssetMinted(tokenId: bigint, name: string, assetType: string, creator: string, event: any) {
    // Asset should already be in DB from frontend creation
    // Update with minting info
    const assets = await storage.getAllRevenueAssets();
    const asset = assets.find(a => a.nftTokenId === tokenId.toString());

    if (asset) {
      await storage.updateRevenueAsset(asset.id, {
        status: 'minted',
        nftTokenId: tokenId.toString(),
        nftContractAddress: NFT_CONTRACT_ADDRESS,
        ownerAddress: creator,
        nftTransactionHash: event.log.transactionHash,
      });
      console.log(`  ✓ Updated asset ${asset.id} (${name}) with mint info`);
    }
  }

  private async handleAssetFragmentalized(tokenId: bigint, erc20Token: string, event: any) {
    const assets = await storage.getAllRevenueAssets();
    const asset = assets.find(a => a.nftTokenId === tokenId.toString());

    if (asset && erc20Token !== '0x0000000000000000000000000000000000000000') {
      await this.indexERC20Token(asset.id, erc20Token);
      await storage.updateRevenueAsset(asset.id, {
        status: 'fragmented',
        isFragmented: true,
      });
      console.log(`  ✓ Updated asset ${asset.id} with fractionalization info`);
      
      // Setup Oracle event listeners for automated revenue tracking
      await this.setupOracleEventListeners(asset.id, erc20Token);
    }
  }

  private async handleTokenCreated(nftTokenId: bigint, tokenAddress: string, event: any) {
    const assets = await storage.getAllRevenueAssets();
    const asset = assets.find(a => a.nftTokenId === nftTokenId.toString());

    if (asset) {
      await this.indexERC20Token(asset.id, tokenAddress);
      console.log(`  ✓ Indexed ERC20 token for asset ${asset.id}`);
    }
  }

  private async handleVerificationFulfilled(requestId: string, tokenId: bigint, verified: boolean, event: any) {
    if (!verified) {
      console.log(`  ⚠ Verification failed for request ${requestId}`);
      return;
    }

    console.log(`  ✓ Verification successful for request ${requestId}, minting NFT ${tokenId}`);

    try {
      const provider = await getProvider();
      const nftContract = await getNFTContract(provider);
      
      const metadata = await nftContract.getAssetMetadata(tokenId);
      const owner = await nftContract.ownerOf(tokenId);

      const allAssets = await storage.getAllRevenueAssets();
      const existingAsset = allAssets.find(a => a.verificationRequestId === requestId);

      if (existingAsset) {
        await storage.updateRevenueAsset(existingAsset.id, {
          status: 'minted',
          nftTokenId: tokenId.toString(),
          nftContractAddress: NFT_CONTRACT_ADDRESS,
          ownerAddress: owner,
          nftTransactionHash: event.log.transactionHash,
          isFragmented: metadata.isFragmentalized,
          isVerified: true,
        });

        console.log(`  ✓ Updated existing asset ${existingAsset.id} with verified NFT (Token ID: ${tokenId})`);
      } else {
        const asset = await storage.createRevenueAsset({
          name: metadata.name,
          description: metadata.description,
          assetType: assetTypeToString(metadata.assetType),
          imageUrl: metadata.imageUrl,
          estimatedValue: formatEther(metadata.estimatedValue),
        });

        await storage.updateRevenueAsset(asset.id, {
          status: 'minted',
          nftTokenId: tokenId.toString(),
          nftContractAddress: NFT_CONTRACT_ADDRESS,
          ownerAddress: owner,
          nftTransactionHash: event.log.transactionHash,
          isFragmented: metadata.isFragmentalized,
          isVerified: true,
          externalId: metadata.externalId,
        });

        console.log(`  ⚠ No existing asset found for requestId, created new asset ${asset.id} (Token ID: ${tokenId})`);
      }
    } catch (error) {
      console.error(`  ✗ Failed to process verified asset:`, error);
    }
  }

  private async handleTokensPurchased(assetId: string, buyer: string, amount: bigint, cost: bigint, event: any) {
    const amountEth = formatEther(amount);
    const costEth = formatEther(cost);
    console.log(`  ✓ Tokens purchased for asset ${assetId}: ${amountEth} tokens for ${costEth} ETH`);

    try {
      const asset = await storage.getRevenueAsset(assetId);
      if (!asset || !asset.erc20ContractAddress) {
        console.error(`    ✗ Asset ${assetId} not found or not fractionalized`);
        return;
      }

      // Pass buyer address to ensure new buyers are included in rebuild
      await this.rebuildTokenHolders(assetId, asset.erc20ContractAddress, [buyer]);
      
      // Re-index the ERC20 token to update tokensSold from blockchain state
      await this.indexERC20Token(assetId, asset.erc20ContractAddress);
      
      console.log(`    ✓ Rebuilt all token holders with updated balances and percentages`);
    } catch (error) {
      console.error(`    ✗ Failed to update token holders:`, error);
    }
  }

  private async handleOperatingRevenueRecorded(assetId: string, amount: bigint, totalOperatingRevenue: bigint, event: any) {
    const amountEth = formatEther(amount);
    const totalEth = formatEther(totalOperatingRevenue);
    console.log(`  ✓ Operating revenue recorded for asset ${assetId}: ${amountEth} ETH (total: ${totalEth} ETH)`);

    // Update asset's total revenue
    await storage.updateRevenueAsset(assetId, {
      totalRevenue: totalEth,
    });

    console.log(`    ✓ Updated asset total revenue to ${totalEth} ETH`);
  }

  private async handleOperatingRevenueDistributed(assetId: string, amount: bigint, totalDistributed: bigint, event: any) {
    const amountEth = formatEther(amount);
    const totalEth = formatEther(totalDistributed);
    console.log(`  ✓ Operating revenue distributed for asset ${assetId}: ${amountEth} ETH (total: ${totalEth} ETH)`);

    // Get asset info for per-token calculation
    const asset = await storage.getRevenueAsset(assetId);
    if (!asset) {
      console.error(`  ✗ Asset ${assetId} not found`);
      return;
    }

    // Calculate per-token amount
    const totalSupplyNumber = parseInt(String(asset.totalTokenSupply || 0), 10);
    if (totalSupplyNumber === 0) {
      console.error(`  ✗ Asset ${assetId} has zero total supply, cannot distribute`);
      return;
    }

    const perTokenWei = amount / BigInt(totalSupplyNumber);
    const perTokenAmount = formatEther(perTokenWei);

    // Create distribution record
    await storage.createRevenueDistribution({
      assetId,
      totalAmount: amountEth,
      perTokenAmount,
      transactionHash: event.log.transactionHash,
    });

    // Update asset's distributed revenue
    await storage.updateRevenueAsset(assetId, {
      distributedRevenue: totalEth,
    });

    console.log(`    ✓ Created distribution record: ${amountEth} ETH (${perTokenAmount} ETH per token)`);
  }

  private async handleAutomatedRevenueRequested(assetId: string, requestId: string, timestamp: bigint, event: any) {
    console.log(`  ✓ Chainlink Automation requested revenue for asset ${assetId}`);
    
    // Update asset's last Oracle update time
    // Guard against unexpected timestamp types
    const timestampMs = typeof timestamp === 'bigint' 
      ? Number(timestamp) * 1000 
      : Number(timestamp) * 1000;
    
    await storage.updateRevenueAsset(assetId, {
      oracleLastUpdate: new Date(timestampMs),
    });
  }

  private async handleAutomatedRevenueDistributed(assetId: string, amount: bigint, timestamp: bigint, event: any) {
    const amountEth = formatEther(amount);
    console.log(`  ✓ Automated revenue distributed for asset ${assetId}: ${amountEth} ETH`);

    // Create distribution record
    const asset = await storage.getRevenueAsset(assetId);
    if (!asset) {
      console.error(`  ✗ Asset ${assetId} not found`);
      return;
    }

    // Calculate per-token amount using BigInt arithmetic to avoid precision loss
    // totalTokenSupply is stored as number of tokens (not wei), e.g., 1000 tokens
    const totalSupplyNumber = parseInt(String(asset.totalTokenSupply || 0), 10);
    if (totalSupplyNumber === 0) {
      console.error(`  ✗ Asset ${assetId} has zero total supply, cannot distribute`);
      return;
    }

    // amount is in wei, totalSupplyNumber is number of tokens
    // perTokenWei = amount / totalSupply (gives wei per token)
    // Example: 1 ETH (1e18 wei) / 1000 tokens = 1e15 wei per token = 0.001 ETH per token
    const perTokenWei = amount / BigInt(totalSupplyNumber);
    const perTokenAmount = formatEther(perTokenWei);

    // Guard against timestamp type
    const timestampMs = typeof timestamp === 'bigint' 
      ? Number(timestamp) * 1000 
      : Number(timestamp) * 1000;

    // Record the distribution in database
    await storage.createRevenueDistribution({
      assetId,
      totalAmount: amountEth,
      perTokenAmount,
      transactionHash: event.log.transactionHash,
    });

    // Update asset's last Oracle update time
    await storage.updateRevenueAsset(assetId, {
      oracleLastUpdate: new Date(timestampMs),
    });
  }

  /**
   * Handle ERC20 Token Transfer event
   * Updates token holder balances in database when tokens are transferred
   * Now with idempotency protection
   */
  private async handleTokenTransfer(
    assetId: string,
    tokenAddress: string,
    from: string,
    to: string,
    amount: bigint,
    event: any
  ) {
    console.log(`  Processing Transfer: ${from} -> ${to}, amount: ${formatEther(amount)}`);

    try {
      // Check if this event has already been processed (idempotency)
      const eventId = `${event.log.transactionHash}-${event.log.logIndex}`;
      const db = (storage as any).db;
      
      if (db) {
        const existing = await db.select().from(processedEvents)
          .where(eq(processedEvents.eventId, eventId));
        
        if (existing.length > 0) {
          console.log(`  ℹ Event ${eventId} already processed, skipping`);
          return;
        }
      }

      const provider = await getProvider();
      const tokenContract = await getERC20Contract(tokenAddress, provider);

      // Skip mint/burn events (from/to zero address) - these are handled elsewhere
      const zeroAddress = '0x0000000000000000000000000000000000000000';
      if (from.toLowerCase() === zeroAddress || to.toLowerCase() === zeroAddress) {
        console.log(`  ℹ Skipping mint/burn event`);
        
        // Still mark as processed
        if (db) {
          await db.insert(processedEvents).values({
            eventId,
            eventType: 'Transfer',
            assetId,
            blockNumber: event.log.blockNumber,
            transactionHash: event.log.transactionHash,
          }).onConflictDoNothing();
        }
        return;
      }

      // Update balances for both sender and receiver
      const [fromBalance, toBalance] = await Promise.all([
        tokenContract.balanceOf(from),
        tokenContract.balanceOf(to),
      ]);

      const fromBalanceWei = fromBalance.toString();
      const toBalanceWei = toBalance.toString();

      // Update or create token holder records
      const existingFromHolder = await storage.getTokenHolderByAssetAndAddress(assetId, from);
      const existingToHolder = await storage.getTokenHolderByAssetAndAddress(assetId, to);

      // Calculate percentages (based on total supply)
      const totalSupply = await tokenContract.totalSupply();
      const totalSupplyBigInt = BigInt(totalSupply.toString());

      const fromPercentage = totalSupplyBigInt > 0n
        ? ((BigInt(fromBalanceWei) * 10000n) / totalSupplyBigInt).toString()
        : '0';
      const toPercentage = totalSupplyBigInt > 0n
        ? ((BigInt(toBalanceWei) * 10000n) / totalSupplyBigInt).toString()
        : '0';

      // Update sender (from)
      if (existingFromHolder) {
        await storage.updateTokenHolder(existingFromHolder.id, {
          tokenAmount: fromBalanceWei,
          percentage: (parseFloat(fromPercentage) / 100).toFixed(2),
        });
        console.log(`  ✓ Updated holder ${from}: ${formatEther(fromBalanceWei)} tokens`);
      }

      // Update or create receiver (to)
      if (existingToHolder) {
        await storage.updateTokenHolder(existingToHolder.id, {
          tokenAmount: toBalanceWei,
          percentage: (parseFloat(toPercentage) / 100).toFixed(2),
        });
        console.log(`  ✓ Updated holder ${to}: ${formatEther(toBalanceWei)} tokens`);
      } else {
        // Create new holder record
        await storage.createTokenHolder({
          assetId,
          holderAddress: to,
          tokenAmount: toBalanceWei,
          percentage: (parseFloat(toPercentage) / 100).toFixed(2),
        });
        console.log(`  ✓ Created new holder ${to}: ${formatEther(toBalanceWei)} tokens`);
      }

      // Note: We keep zero-balance holders in database for historical tracking
      // If you want to delete them, add a deleteTokenHolder method to storage
      
      // Mark this event as processed
      if (db) {
        await db.insert(processedEvents).values({
          eventId,
          eventType: 'Transfer',
          assetId,
          blockNumber: event.log.blockNumber,
          transactionHash: event.log.transactionHash,
        }).onConflictDoNothing();
        console.log(`  ✓ Event ${eventId} marked as processed`);
      }
    } catch (error: any) {
      console.error(`  ✗ Failed to handle token transfer:`, error.message);
    }
  }

  /**
   * Manually refresh asset data from blockchain
   */
  async refreshAsset(assetId: string) {
    console.log(`Refreshing asset ${assetId} from blockchain...`);

    const asset = await storage.getRevenueAsset(assetId);
    if (!asset || !asset.erc20ContractAddress) {
      console.log('Asset not found or not fractionalized');
      return;
    }

    await this.indexERC20Token(assetId, asset.erc20ContractAddress);
    console.log(`Asset ${assetId} refreshed successfully`);
  }

  /**
   * Sync revenue data from blockchain for all fractionalized assets
   * This ensures database stays in sync with on-chain state
   */
  async syncRevenueDataFromChain() {
    console.log('Syncing revenue data from blockchain...');
    
    try {
      const assets = await storage.getAllRevenueAssets();
      const fractionalizedAssets = assets.filter(a => a.isFragmented && a.erc20ContractAddress);
      
      if (fractionalizedAssets.length === 0) {
        console.log('No fractionalized assets to sync');
        return;
      }
      
      const provider = await getProvider();
      let syncedCount = 0;
      let errorCount = 0;
      
      for (const asset of fractionalizedAssets) {
        try {
          const tokenContract = await getERC20Contract(asset.erc20ContractAddress!, provider);
          
          // Fetch revenue data from blockchain
          const [operatingRevenue, operatingDistributed] = await Promise.all([
            tokenContract.operatingRevenue(),
            tokenContract.operatingDistributed(),
          ]);
          
          const totalRevenueEth = formatEther(operatingRevenue);
          const distributedRevenueEth = formatEther(operatingDistributed);
          
          // Check if data has changed
          const totalRevenueChanged = asset.totalRevenue !== totalRevenueEth;
          const distributedRevenueChanged = asset.distributedRevenue !== distributedRevenueEth;
          
          if (totalRevenueChanged || distributedRevenueChanged) {
            await storage.updateRevenueAsset(asset.id, {
              totalRevenue: totalRevenueEth,
              distributedRevenue: distributedRevenueEth,
            });
            
            console.log(`  ✓ Synced ${asset.name}: revenue=${totalRevenueEth} ETH, distributed=${distributedRevenueEth} ETH`);
            syncedCount++;
          }
        } catch (error: any) {
          console.error(`  ✗ Failed to sync ${asset.name}:`, error.message);
          errorCount++;
        }
      }
      
      console.log(`Revenue sync complete: ${syncedCount} updated, ${errorCount} errors`);
    } catch (error: any) {
      console.error('Failed to sync revenue data:', error.message);
    }
  }

  /**
   * Start periodic revenue data sync (every 5 minutes)
   */
  startPeriodicSync() {
    // Sync immediately on start
    this.syncRevenueDataFromChain().catch(err => {
      console.error('Initial revenue sync failed:', err);
    });
    
    // Then sync every 5 minutes
    setInterval(async () => {
      try {
        await this.syncRevenueDataFromChain();
      } catch (error) {
        console.error('Periodic revenue sync failed:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes
    
    console.log('Started periodic revenue sync (every 5 minutes)');
  }

  /**
   * Stop the indexer
   */
  stop() {
    console.log('Stopping blockchain indexer...');
    this.isRunning = false;
    // Note: WebSocket provider cleanup is handled by cleanupProviders()
  }
}

// Export singleton instance
export const blockchainIndexer = new BlockchainIndexer();
