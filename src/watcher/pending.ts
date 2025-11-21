import type { Hash } from 'viem';
import type { AppConfig, TransferEvent } from '../types.js';
import { logger } from '../logger.js';
import { shouldProcessTransaction, buildTransferEvent } from '../utils/event.js';
import { formatAddress } from '../utils/formatting.js';

/**
 * Watch for pending transactions in the mempool
 */
export async function watchPendingTransactions(
  wsClient: any,
  config: AppConfig,
  seenTxHashes: Set<Hash>,
  onTransfer: (event: TransferEvent) => void
): Promise<() => void> {
  logger.info('Starting pending transaction watcher...');

  const unwatch = wsClient.watchPendingTransactions({
    onTransactions: async (hashes: Hash[]) => {
      // Process transactions in parallel
      await Promise.allSettled(
        hashes.map((hash) =>
          processPendingTransaction(wsClient, config, hash, seenTxHashes, onTransfer)
        )
      );
    },
    onError: (error: Error) => {
      const errorMessage = error.message.toLowerCase();
      // Don't log "not supported" errors repeatedly - these are expected for many providers
      if (
        !errorMessage.includes('not supported') &&
        !errorMessage.includes('not available') &&
        !errorMessage.includes('unsupported')
      ) {
        logger.error({ error: error.message }, 'Error in pending transactions watcher');
      }
    },
  });

  return unwatch;
}

/**
 * Process a single pending transaction
 */
async function processPendingTransaction(
  client: any,
  config: AppConfig,
  txHash: Hash,
  seenTxHashes: Set<Hash>,
  onTransfer: (event: TransferEvent) => void
): Promise<void> {
  try {
    // Fetch transaction details
    const tx = await client.getTransaction({ hash: txHash });

    if (!tx) {
      return;
    }

    // Check if transaction should be processed
    if (!shouldProcessTransaction(tx, config, seenTxHashes)) {
      return;
    }

    // Mark as seen
    seenTxHashes.add(txHash);

    // Build transfer event
    const event = buildTransferEvent(tx, config, 'pending', true);

    // Log the event
    logger.info(
      {
        type: event.type,
        txHash: event.txHash,
        from: formatAddress(event.from, event.fromLabel),
        to: event.to ? formatAddress(event.to, event.toLabel) : 'null',
        valueETH: event.valueETH,
        valueWei: event.valueWei.toString(),
        watchedSide: event.watchedSide,
      },
      '🚨 Large pending transfer detected'
    );

    // Callback
    onTransfer(event);
  } catch (error) {
    // Silently skip errors for individual transactions (might be replaced/dropped)
    logger.debug(
      { txHash, error: (error as Error).message },
      'Failed to fetch pending transaction'
    );
  }
}
