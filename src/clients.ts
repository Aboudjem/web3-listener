import { type PublicClient } from 'viem';
import {
  initializeWsPool,
  getWsPool,
  DEFAULT_WSS_RPC_ENDPOINTS,
} from './rpcPool.js';
import { config } from './config.js';
import { logger } from './logger.js';

/**
 * Initialize WebSocket RPC pool with endpoints from config
 */
export function initializeRpcPools(): void {
  // Build endpoint list, using config URL as primary endpoint
  const wssEndpoints = [config.wssRpcUrl, ...DEFAULT_WSS_RPC_ENDPOINTS].filter(
    (url, index, self) => self.indexOf(url) === index
  );

  initializeWsPool(wssEndpoints);

  logger.info(
    {
      wssEndpoints: wssEndpoints.length,
      endpoints: wssEndpoints,
    },
    'WebSocket RPC pool initialized with failover support'
  );
}

/**
 * Get the WebSocket client from the pool
 */
export async function getWsClient(): Promise<PublicClient> {
  return await getWsPool().connect();
}

/**
 * Register a callback for WebSocket reconnection events
 */
export function onWsReconnect(callback: (client: PublicClient) => void | Promise<void>): void {
  getWsPool().onReconnect(callback);
}

/**
 * Get the current active WebSocket endpoint URL
 */
export function getCurrentWsEndpoint(): string | null {
  return getWsPool().getCurrentEndpoint();
}
