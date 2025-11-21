import type { Hash } from 'viem';
import { initConfig, getConfig } from './config.js';
import { logger } from './logger.js';
import { initializeRpcPools, getWsClient, onWsReconnect } from './clients.js';
import { watchPendingTransactions } from './watcher/pending.js';
import { watchBlocks, getContinuityManager } from './watcher/blocks.js';
import type { TransferEvent } from './types.js';
import { parseCliArgs } from './cli/parser.js';
import { printBanner, printTransferEvent, printError, printSuccess, printInfo } from './cli/formatter.js';
import { destroyWsPool } from './rpcPool.js';

// Track seen transaction hashes to avoid duplicates
const seenTxHashes = new Set<Hash>();

// Keep track of cleanup functions
let unwatchPending: (() => void) | null = null;
let unwatchBlocks: (() => void) | null = null;

// Keep reference to WebSocket client
let wsClient: any = null;

/**
 * Handle transfer events
 */
function handleTransferEvent(event: TransferEvent): void {
  // Print formatted event to console
  printTransferEvent(event);

  // Could extend to:
  // - Save to database
  // - Send webhook notifications
  // - Trigger alerts
  // - Update metrics
}

/**
 * Setup watchers with current WebSocket client
 */
async function setupWatchers(): Promise<void> {
  const config = getConfig();

  // Try to start pending transactions watcher (not all providers support this)
  try {
    unwatchPending = await watchPendingTransactions(
      wsClient,
      config,
      seenTxHashes,
      handleTransferEvent
    );
    logger.info('Pending transaction watcher started successfully');
  } catch (error) {
    const errorMessage = (error as Error).message.toLowerCase();
    if (
      errorMessage.includes('not supported') ||
      errorMessage.includes('not available') ||
      errorMessage.includes('unsupported')
    ) {
      logger.warn(
        'Pending transaction monitoring not supported by current RPC provider - only confirmed transactions will be monitored'
      );
      printInfo(
        'Note: Pending transaction monitoring is not supported by this provider. Only confirmed transactions will be detected.'
      );
    } else {
      throw error; // Re-throw unexpected errors
    }
  }

  // Start block watcher (widely supported)
  unwatchBlocks = await watchBlocks(wsClient, config, seenTxHashes, handleTransferEvent);

  logger.info('Block watcher started successfully');
}

/**
 * Start all watchers
 */
async function startWatchers(): Promise<void> {
  try {
    const config = getConfig();

    // Log to structured logger
    logger.info(
      {
        config: {
          threshold: `${config.thresholdETH} ETH`,
          watchedWallets: config.watchedWallets.length,
          wssRpcUrl: config.wssRpcUrl,
        },
      },
      'Initializing Base mainnet watcher (WebSocket-only)...'
    );

    // Initialize RPC pools with failover support
    initializeRpcPools();

    // Get WebSocket client
    wsClient = await getWsClient();

    // Register reconnection handler to re-setup watchers
    onWsReconnect(async (newClient) => {
      logger.info('WebSocket reconnected, re-establishing watchers');
      
      // Get the continuity manager before stopping watchers
      const continuityManager = getContinuityManager(unwatchBlocks);
      
      // Stop old watchers
      if (unwatchPending) unwatchPending();
      if (unwatchBlocks) unwatchBlocks();

      // Update client reference
      wsClient = newClient;

      // Handle reconnection in continuity manager (backfills missed blocks)
      if (continuityManager) {
        try {
          await continuityManager.handleReconnection(newClient);
          logger.info('Block continuity restored after reconnection');
        } catch (error) {
          logger.error(
            { error: (error as Error).message },
            'Failed to restore block continuity after reconnection'
          );
        }
      }

      // Re-setup watchers
      await setupWatchers();
    });

    // Setup initial watchers
    await setupWatchers();

    printSuccess('All watchers started successfully with failover support');
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to start watchers');
    printError('Failed to start watchers', error as Error);
    throw error;
  }
}

/**
 * Cleanup and shutdown gracefully
 */
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutdown signal received, cleaning up...');

  try {
    // Unwatch pending transactions
    if (unwatchPending) {
      unwatchPending();
      logger.info('Stopped pending transaction watcher');
    }

    // Unwatch blocks
    if (unwatchBlocks) {
      unwatchBlocks();
      logger.info('Stopped block watcher');
    }

    // Cleanup WebSocket pool
    destroyWsPool();

    logger.info('Cleanup complete, exiting');
    process.exit(0);
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Error during shutdown');
    process.exit(1);
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    // Parse CLI arguments
    const cliOptions = parseCliArgs();

    // Initialize config with CLI overrides
    const config = initConfig({
      thresholdOverride: cliOptions.threshold,
      demoMode: cliOptions.demo,
    });

    // Print startup banner
    printBanner({
      network: 'base-mainnet',
      threshold: `${config.thresholdETH} ETH`,
      walletCount: config.watchedWallets.length,
      demoMode: cliOptions.demo,
    });

    // Setup signal handlers for graceful shutdown
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error({ error: error.message, stack: error.stack }, 'Uncaught exception');
      printError('Uncaught exception', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason: unknown) => {
      const errorMessage = reason instanceof Error ? reason.message : String(reason);
      logger.error({ reason: errorMessage }, 'Unhandled promise rejection');
      if (reason instanceof Error) {
        printError('Unhandled promise rejection', reason);
      }
      // Don't exit on unhandled rejections - just log them
      // process.exit(1);
    });

    // Start the watchers
    await startWatchers();
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Fatal error in main');
    printError('Fatal error', error as Error);
    process.exit(1);
  }
}

// Start the application
main();
