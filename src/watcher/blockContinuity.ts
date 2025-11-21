import type { PublicClient, Block } from 'viem';
import { logger } from '../logger.js';

export interface BlockContinuityConfig {
  onBlock: (block: Block) => Promise<void> | void;
  onError?: (error: Error) => void;
}

/**
 * BlockContinuityManager ensures no blocks are skipped
 * - Tracks the last processed block number
 * - Detects gaps in block sequence
 * - Backfills missing blocks via WebSocket JSON-RPC
 * - Handles reconnection scenarios
 */
export class BlockContinuityManager {
  private lastProcessedBlockNumber: bigint | null = null;
  private isInitialized: boolean = false;
  private config: BlockContinuityConfig;
  private client: PublicClient;

  constructor(client: PublicClient, config: BlockContinuityConfig) {
    this.client = client;
    this.config = config;
  }

  /**
   * Initialize the manager by fetching the latest block number
   * This is called on first startup
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      const latestBlockNumber = await this.client.getBlockNumber();
      this.lastProcessedBlockNumber = latestBlockNumber;
      this.isInitialized = true;

      logger.info(
        { blockNumber: latestBlockNumber.toString() },
        'block_continuity: initialized at latest block'
      );
    } catch (error) {
      logger.error(
        { error: (error as Error).message },
        'block_continuity: failed to initialize'
      );
      throw error;
    }
  }

  /**
   * Process a new block from the subscription
   * Detects gaps and backfills if necessary
   */
  async processNewBlock(newBlockNumber: bigint): Promise<void> {
    // If not initialized, initialize now
    if (!this.isInitialized) {
      await this.initialize();
    }

    // If this is the first block we're processing, just process it
    if (this.lastProcessedBlockNumber === null) {
      await this.fetchAndProcessBlock(newBlockNumber);
      this.lastProcessedBlockNumber = newBlockNumber;
      return;
    }

    const expectedBlockNumber = this.lastProcessedBlockNumber + 1n;

    // Normal case: next block in sequence
    if (newBlockNumber === expectedBlockNumber) {
      await this.fetchAndProcessBlock(newBlockNumber);
      this.lastProcessedBlockNumber = newBlockNumber;
      return;
    }

    // Gap detected: we missed some blocks
    if (newBlockNumber > expectedBlockNumber) {
      const gapSize = Number(newBlockNumber - expectedBlockNumber);
      logger.warn(
        {
          lastProcessed: this.lastProcessedBlockNumber.toString(),
          received: newBlockNumber.toString(),
          gapSize,
        },
        `block_continuity: gap detected, backfilling ${gapSize} blocks`
      );

      // Backfill all missing blocks
      await this.backfillBlocks(expectedBlockNumber, newBlockNumber - 1n);

      // Process the new block
      await this.fetchAndProcessBlock(newBlockNumber);
      this.lastProcessedBlockNumber = newBlockNumber;
      return;
    }

    // Received an old block (should be rare, might indicate reorg or duplicate)
    if (newBlockNumber <= this.lastProcessedBlockNumber) {
      logger.debug(
        {
          lastProcessed: this.lastProcessedBlockNumber.toString(),
          received: newBlockNumber.toString(),
        },
        'block_continuity: received old/duplicate block, skipping'
      );
      return;
    }
  }

  /**
   * Backfill blocks from start to end (inclusive)
   */
  private async backfillBlocks(startBlock: bigint, endBlock: bigint): Promise<void> {
    const blockCount = Number(endBlock - startBlock + 1n);
    logger.info(
      {
        startBlock: startBlock.toString(),
        endBlock: endBlock.toString(),
        count: blockCount,
      },
      'block_continuity: starting backfill'
    );

    for (let blockNum = startBlock; blockNum <= endBlock; blockNum++) {
      try {
        await this.fetchAndProcessBlock(blockNum);
        this.lastProcessedBlockNumber = blockNum;
      } catch (error) {
        logger.error(
          {
            blockNumber: blockNum.toString(),
            error: (error as Error).message,
          },
          'block_continuity: failed to backfill block'
        );
        
        // Call error handler if provided
        if (this.config.onError) {
          this.config.onError(error as Error);
        }

        // Continue with next block despite error
        continue;
      }
    }

    logger.info(
      {
        startBlock: startBlock.toString(),
        endBlock: endBlock.toString(),
        count: blockCount,
      },
      'block_continuity: backfill complete'
    );
  }

  /**
   * Fetch a block by number and process it
   */
  private async fetchAndProcessBlock(blockNumber: bigint): Promise<void> {
    try {
      const block = await this.client.getBlock({
        blockNumber,
        includeTransactions: true,
      });

      await this.config.onBlock(block);
    } catch (error) {
      logger.error(
        {
          blockNumber: blockNumber.toString(),
          error: (error as Error).message,
        },
        'block_continuity: failed to fetch/process block'
      );
      throw error;
    }
  }

  /**
   * Handle reconnection: backfill any blocks missed during downtime
   */
  async handleReconnection(newClient: PublicClient): Promise<void> {
    logger.info('block_continuity: handling reconnection');

    // Update client reference
    this.client = newClient;

    // If we were never initialized, initialize now
    if (!this.isInitialized || this.lastProcessedBlockNumber === null) {
      await this.initialize();
      return;
    }

    try {
      // Get the latest block number from the new connection
      const latestBlockNumber = await this.client.getBlockNumber();

      logger.info(
        {
          lastProcessed: this.lastProcessedBlockNumber.toString(),
          latest: latestBlockNumber.toString(),
        },
        'block_continuity: checking for missed blocks after reconnection'
      );

      // If we're behind, backfill
      if (latestBlockNumber > this.lastProcessedBlockNumber) {
        const missedBlocks = Number(latestBlockNumber - this.lastProcessedBlockNumber);
        logger.warn(
          {
            missedBlocks,
            lastProcessed: this.lastProcessedBlockNumber.toString(),
            latest: latestBlockNumber.toString(),
          },
          'block_continuity: missed blocks during downtime, backfilling'
        );

        await this.backfillBlocks(this.lastProcessedBlockNumber + 1n, latestBlockNumber);
        this.lastProcessedBlockNumber = latestBlockNumber;
      } else if (latestBlockNumber === this.lastProcessedBlockNumber) {
        logger.info('block_continuity: no blocks missed during reconnection');
      } else {
        // Latest is less than last processed (rare, might indicate different node or reorg)
        logger.warn(
          {
            lastProcessed: this.lastProcessedBlockNumber.toString(),
            latest: latestBlockNumber.toString(),
          },
          'block_continuity: latest block is behind last processed (possible reorg)'
        );
        // Reset to latest
        this.lastProcessedBlockNumber = latestBlockNumber;
      }
    } catch (error) {
      logger.error(
        { error: (error as Error).message },
        'block_continuity: failed to handle reconnection'
      );
      throw error;
    }
  }

  /**
   * Get the last processed block number
   */
  getLastProcessedBlockNumber(): bigint | null {
    return this.lastProcessedBlockNumber;
  }

  /**
   * Check if the manager is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.lastProcessedBlockNumber !== null;
  }

  /**
   * Reset the manager (useful for testing)
   */
  reset(): void {
    this.lastProcessedBlockNumber = null;
    this.isInitialized = false;
  }
}
