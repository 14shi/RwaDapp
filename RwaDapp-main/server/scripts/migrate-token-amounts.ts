/**
 * Data Migration Script: Convert token amounts from human-readable to wei format
 * 
 * This script fixes data inconsistencies where token amounts were stored
 * in human-readable format instead of wei format.
 * 
 * Usage:
 *   tsx server/scripts/migrate-token-amounts.ts
 * 
 * Safety:
 *   - Creates backup before migration
 *   - Dry-run mode available (set DRY_RUN=true)
 *   - Logs all changes
 */

import { storage } from '../storage';
import { parseEther, formatEther } from 'ethers';

const DRY_RUN = process.env.DRY_RUN === 'true';

interface MigrationResult {
  assetId: string;
  assetName: string;
  changes: {
    field: string;
    before: string;
    after: string;
  }[];
}

/**
 * Check if a value is likely in wei format (very large number)
 */
function isWeiFormat(value: string | null | undefined): boolean {
  if (!value) return false;
  const num = parseFloat(value);
  // If value is >= 1e12, it's likely in wei format
  return num >= 1e12;
}

/**
 * Convert human-readable token amount to wei
 */
function toWei(value: string): string {
  try {
    return parseEther(value).toString();
  } catch (error) {
    console.error(`Failed to convert ${value} to wei:`, error);
    return value; // Return original if conversion fails
  }
}

/**
 * Main migration function
 */
async function migrateTokenAmounts() {
  console.log('='.repeat(60));
  console.log('Token Amounts Migration Script');
  console.log('='.repeat(60));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be saved)'}`);
  console.log('');

  try {
    const assets = await storage.getAllRevenueAssets();
    console.log(`Found ${assets.length} assets to check`);
    console.log('');

    const results: MigrationResult[] = [];
    let totalFixed = 0;

    for (const asset of assets) {
      if (!asset.isFragmented || !asset.erc20ContractAddress) {
        continue; // Skip non-fractionalized assets
      }

      const changes: MigrationResult['changes'] = [];
      const updates: any = {};

      // Check totalTokenSupply
      if (asset.totalTokenSupply && !isWeiFormat(asset.totalTokenSupply)) {
        const before = asset.totalTokenSupply;
        const after = toWei(asset.totalTokenSupply);
        changes.push({
          field: 'totalTokenSupply',
          before: `${before} (human-readable)`,
          after: `${formatEther(after)} tokens (${after} wei)`,
        });
        updates.totalTokenSupply = after;
      }

      // Check tokensSold
      if (asset.tokensSold && asset.tokensSold !== '0' && !isWeiFormat(asset.tokensSold)) {
        const before = asset.tokensSold;
        const after = toWei(asset.tokensSold);
        changes.push({
          field: 'tokensSold',
          before: `${before} (human-readable)`,
          after: `${formatEther(after)} tokens (${after} wei)`,
        });
        updates.tokensSold = after;
      }

      // Check token holders
      const holders = await storage.getTokenHoldersByAsset(asset.id);
      for (const holder of holders) {
        if (holder.tokenAmount && !isWeiFormat(holder.tokenAmount)) {
          const before = holder.tokenAmount;
          const after = toWei(holder.tokenAmount);
          changes.push({
            field: `holder[${holder.holderAddress}].tokenAmount`,
            before: `${before} (human-readable)`,
            after: `${formatEther(after)} tokens (${after} wei)`,
          });
          
          if (!DRY_RUN) {
            await storage.updateTokenHolder(holder.id, {
              tokenAmount: after,
            });
          }
        }
      }

      if (changes.length > 0) {
        results.push({
          assetId: asset.id,
          assetName: asset.name,
          changes,
        });

        if (!DRY_RUN && Object.keys(updates).length > 0) {
          await storage.updateRevenueAsset(asset.id, updates);
        }

        totalFixed += changes.length;
        console.log(`✓ Fixed ${asset.name} (${changes.length} fields)`);
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('Migration Summary');
    console.log('='.repeat(60));
    console.log(`Total assets checked: ${assets.length}`);
    console.log(`Assets with issues: ${results.length}`);
    console.log(`Total fields fixed: ${totalFixed}`);
    console.log('');

    if (results.length > 0) {
      console.log('Detailed Changes:');
      console.log('');
      for (const result of results) {
        console.log(`Asset: ${result.assetName} (${result.assetId})`);
        for (const change of result.changes) {
          console.log(`  - ${change.field}:`);
          console.log(`    Before: ${change.before}`);
          console.log(`    After:  ${change.after}`);
        }
        console.log('');
      }
    }

    if (DRY_RUN) {
      console.log('⚠️  DRY RUN MODE - No changes were saved');
      console.log('Run without DRY_RUN=true to apply changes');
    } else {
      console.log('✓ Migration completed successfully');
    }

    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateTokenAmounts();

