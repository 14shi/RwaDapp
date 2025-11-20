import { storage } from '../storage';
import type { RevenueAsset } from '@shared/schema';

interface ScheduledTask {
  assetId: string;
  interval: number; // in seconds
  lastRun?: Date;
  enabled: boolean;
}

class OracleScheduler {
  private tasks: Map<string, NodeJS.Timeout> = new Map();
  private isInitialized = false;

  /**
   * Initialize the scheduler by loading all active Oracle tasks
   */
  async initialize() {
    if (this.isInitialized) {
      console.log('[OracleScheduler] Already initialized');
      return;
    }

    try {
      console.log('[OracleScheduler] Initializing Oracle Scheduler...');

      // Check if we have necessary environment variables
      const privateKey = process.env.ORACLE_PRIVATE_KEY || process.env.PRIVATE_KEY;
      if (!privateKey) {
        console.error('[OracleScheduler] No private key configured, scheduler will not start');
        return;
      }

      // Load all assets with Oracle enabled
      const allAssets = await storage.getAllRevenueAssets();
      const oracleAssets = allAssets.filter(asset => asset.isOracleEnabled);

      console.log(`[OracleScheduler] Found ${oracleAssets.length} assets with Oracle enabled`);

      for (const asset of oracleAssets) {
        if (asset.oracleAutoEnabled && asset.oracleUpdateInterval) {
          await this.scheduleTask(asset.id, asset.oracleUpdateInterval);
        }
      }

      this.isInitialized = true;
      console.log('[OracleScheduler] Scheduler initialized successfully');
    } catch (error) {
      console.error('[OracleScheduler] Failed to initialize scheduler:', error);
    }
  }

  /**
   * Schedule a task for an asset
   */
  async scheduleTask(assetId: string, intervalSeconds: number): Promise<void> {
    try {
      // Clear existing task if any
      this.clearTask(assetId);

      console.log(`[OracleScheduler] Scheduling task for asset ${assetId} with interval ${intervalSeconds}s`);

      // Create a new interval task
      const taskId = setInterval(async () => {
        await this.executeTask(assetId);
      }, intervalSeconds * 1000);

      this.tasks.set(assetId, taskId);

      // Run the task immediately for the first time
      await this.executeTask(assetId);
    } catch (error) {
      console.error(`[OracleScheduler] Failed to schedule task for asset ${assetId}:`, error);
    }
  }

  /**
   * Execute a scheduled task
   */
  private async executeTask(assetId: string): Promise<void> {
    const startTime = Date.now();
    console.log(`[OracleScheduler] Executing task for asset ${assetId}`);

    try {
      // Get the asset details
      const asset = await storage.getRevenueAsset(assetId);

      if (!asset) {
        console.error(`[OracleScheduler] Asset ${assetId} not found`);
        this.clearTask(assetId);
        return;
      }

      if (!asset.isOracleEnabled || !asset.oracleAutoEnabled) {
        console.log(`[OracleScheduler] Oracle disabled for asset ${assetId}, stopping task`);
        this.clearTask(assetId);
        return;
      }

      // TODO: Call Oracle functions to update revenue data
      // This would involve calling Chainlink Functions to get revenue data
      // and then updating the database with the new values
      console.log(`[OracleScheduler] Would trigger Oracle update for asset ${assetId}`);
      
      // Update last Oracle update time
      await storage.updateRevenueAsset(assetId, {
        oracleLastUpdate: new Date()
      });

      const duration = Date.now() - startTime;
      console.log(`[OracleScheduler] Task for asset ${assetId} completed in ${duration}ms`);
    } catch (error) {
      console.error(`[OracleScheduler] Failed to execute task for asset ${assetId}:`, error);
    }
  }

  /**
   * Manually trigger a task for an asset
   */
  async triggerTask(assetId: string): Promise<void> {
    console.log(`[OracleScheduler] Manually triggering task for asset ${assetId}`);
    await this.executeTask(assetId);
  }

  /**
   * Clear a scheduled task
   */
  clearTask(assetId: string): void {
    const task = this.tasks.get(assetId);
    if (task) {
      clearInterval(task);
      this.tasks.delete(assetId);
      console.log(`[OracleScheduler] Cleared task for asset ${assetId}`);
    }
  }

  /**
   * Clear all scheduled tasks
   */
  clearAllTasks(): void {
    console.log(`[OracleScheduler] Clearing all ${this.tasks.size} tasks`);
    this.tasks.forEach((task, assetId) => {
      clearInterval(task);
    });
    this.tasks.clear();
  }

  /**
   * Restart a task with new interval
   */
  async restartTask(assetId: string, intervalSeconds: number): Promise<void> {
    console.log(`[OracleScheduler] Restarting task for asset ${assetId} with new interval ${intervalSeconds}s`);
    this.clearTask(assetId);
    await this.scheduleTask(assetId, intervalSeconds);
  }

  /**
   * Stop a task for an asset
   */
  async stopTask(assetId: string): Promise<void> {
    console.log(`[OracleScheduler] Stopping task for asset ${assetId}`);
    this.clearTask(assetId);
    
    // Update asset to disable auto update
    await storage.updateRevenueAsset(assetId, {
      oracleAutoEnabled: false
    });
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    initialized: boolean;
    activeTaskCount: number;
    tasks: Array<{ assetId: string; running: boolean }>;
  } {
    const taskStatus = Array.from(this.tasks.keys()).map(assetId => ({
      assetId,
      running: true
    }));

    return {
      initialized: this.isInitialized,
      activeTaskCount: this.tasks.size,
      tasks: taskStatus
    };
  }

  /**
   * Shutdown the scheduler
   */
  shutdown(): void {
    console.log('[OracleScheduler] Shutting down scheduler...');
    this.clearAllTasks();
    this.isInitialized = false;
  }
}

// Export a singleton instance
export const oracleScheduler = new OracleScheduler();