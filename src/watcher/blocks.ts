import type { Hash, Block } from 'viem';
import type { AppConfig, TransferEvent } from '../types.js';
import { logger } from '../logger.js';
import { shouldProcessTransaction, buildTransferEvent } from '../utils/event.js';
import { formatAddress } from '../utils/formatting.js';
import { BlockContinuityManager } from './blockContinuity.js';

/**
 * Watch for new blocks and check transactions with block continuity guarantees
 */
export async function watchBlocks(
  wsClient: any,
  config: AppConfig,
  seenTxHashes: Set<Hash>,
  onTransfer: (event: TransferEvent) => void
): Promise<() => void> {
  logger.info('Starting block watcher with continuity guarantees...');

  // Create block continuity manager
  const continuityManager = new BlockContinuityManager(wsClient, {
    onBlock: async (block: Block) => {
      await processBlock(block, config, seenTxHashes, onTransfer);
    },
    onError: (error: Error) => {
      logger.error(
        { error: error.message },
        'Error in block continuity manager'
      );
    },
  });

  // Initialize the continuity manager
  await continuityManager.initialize();

  // Subscribe to new blocks
  const unwatch = wsClient.watchBlocks({
    onBlock: async (block: any) => {
      try {
        // Skip if block number is missing
        if (!block || !block.number) {
          logger.debug('Received block event without number, skipping');
          return;
        }

        // Process through continuity manager (handles gap detection and backfill)
        await continuityManager.processNewBlock(block.number);
      } catch (error) {
        logger.error(
          { blockNumber: block.number, error: (error as Error).message },
          'Error processing block in watcher'
        );
      }
    },
    onError: (error: Error) => {
      logger.error({ error: error.message }, 'Error in block watcher subscription');
    },
  });

  // Return cleanup function that includes continuity manager reference
  const cleanup = () => {
    unwatch();
    logger.info('Block watcher stopped');
  };

  // Store the continuity manager reference for reconnection handling
  (cleanup as any).continuityManager = continuityManager;

  return cleanup;
}

/**
 * Process a complete block with all its transactions
 */
async function processBlock(
  block: Block,
  config: AppConfig,
  seenTxHashes: Set<Hash>,
  onTransfer: (event: TransferEvent) => void
): Promise<void> {
  try {
    // Skip if block has no transactions
    if (!block.transactions || block.transactions.length === 0) {
      return;
    }

    const blockNumber = block.number!;

    logger.debug(
      {
        blockNumber: blockNumber.toString(),
        txCount: block.transactions.length,
      },
      'Processing block'
    );

    // Process each transaction in the block
    for (const tx of block.transactions) {
      if (typeof tx === 'string') {
        continue; // Skip if only hash is returned
      }

      await processBlockTransaction(tx, blockNumber, config, seenTxHashes, onTransfer);
    }
  } catch (error) {
    logger.error(
      { blockNumber: block.number?.toString(), error: (error as Error).message },
      'Error processing block'
    );
  }
}

/**
 * Process a single transaction from a block
 */
async function processBlockTransaction(
  tx: any,
  blockNumber: bigint,
  config: AppConfig,
  seenTxHashes: Set<Hash>,
  onTransfer: (event: TransferEvent) => void
): Promise<void> {
  try {
    // Add blockNumber to the transaction object
    const txWithBlock = { ...tx, blockNumber };

    // Check if already seen (from pending) - if so, skip but don't emit again
    const wasSeenInMempool = seenTxHashes.has(tx.hash);

    // If not seen yet, check if it should be processed
    if (!wasSeenInMempool && !shouldProcessTransaction(txWithBlock, config, seenTxHashes)) {
      return;
    }

    // If already seen in mempool, we already logged it, so skip
    if (wasSeenInMempool) {
      return;
    }

    // Mark as seen
    seenTxHashes.add(tx.hash);

    // Build transfer event (not seen in mempool since we got here)
    const event = buildTransferEvent(txWithBlock, config, 'confirmed', false);

    // Log the event
    logger.info(
      {
        type: event.type,
        txHash: event.txHash,
        blockNumber: event.blockNumber?.toString(),
        from: formatAddress(event.from, event.fromLabel),
        to: event.to ? formatAddress(event.to, event.toLabel) : 'null',
        valueETH: event.valueETH,
        valueWei: event.valueWei.toString(),
        watchedSide: event.watchedSide,
      },
      '✅ Large confirmed transfer detected'
    );

    // Callback
    onTransfer(event);
  } catch (error) {
    logger.debug(
      { txHash: tx.hash, error: (error as Error).message },
      'Failed to process block transaction'
    );
  }
}

/**
 * Get the continuity manager from a block watcher cleanup function
 * This is used for reconnection handling
 */
export function getContinuityManager(unwatchFn: (() => void) | null): BlockContinuityManager | null {
  if (!unwatchFn) return null;
  return (unwatchFn as any).continuityManager || null;
}
