import {
  createPublicClient,
  webSocket,
  type PublicClient,
} from 'viem';
import { base } from 'viem/chains';
import { logger } from './logger.js';

// Default WSS endpoints for Base mainnet (WebSocket-only architecture)
export const DEFAULT_WSS_RPC_ENDPOINTS = [
  'wss://base.gateway.tenderly.co',
  'wss://base.callstaticrpc.com',
  'wss://base-rpc.publicnode.com',
  'wss://base-mainnet.infura.io/ws/v3/7a978bfcd53a4a03aa45791bf57e40a4',
];

export enum EndpointStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  DOWN = 'down',
}

export interface EndpointHealth {
  url: string;
  status: EndpointStatus;
  failCount: number;
  lastErrorTime: number;
  lastSuccessTime: number;
  nextAvailableTime: number;
}

export interface RpcPoolConfig {
  baseDelay?: number; // Base delay for exponential backoff (ms)
  maxCooldown?: number; // Maximum cooldown period (ms)
  healthCheckInterval?: number; // Health check interval (ms)
  requestTimeout?: number; // Request timeout (ms)
}

const DEFAULT_CONFIG: Required<RpcPoolConfig> = {
  baseDelay: 5000, // 5 seconds
  maxCooldown: 300000, // 5 minutes
  healthCheckInterval: 60000, // 60 seconds
  requestTimeout: 10000, // 10 seconds
};

/**
 * WebSocket RPC Pool Manager
 * Manages a pool of WebSocket RPC endpoints with automatic failover and reconnection
 */
export class WsRpcPool {
  private endpoints: string[];
  private healthMap: Map<string, EndpointHealth>;
  private currentIndex: number;
  private currentClient: PublicClient | null = null;
  private currentEndpoint: string | null = null;
  private config: Required<RpcPoolConfig>;
  private reconnectCallbacks: Array<(client: PublicClient) => void | Promise<void>> = [];
  private isConnecting: boolean = false;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private isDestroyed: boolean = false;

  constructor(endpoints: string[], config: RpcPoolConfig = {}) {
    if (endpoints.length === 0) {
      throw new Error('At least one WebSocket endpoint is required');
    }

    this.endpoints = endpoints;
    this.currentIndex = 0;
    this.healthMap = new Map();
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize health tracking for all endpoints
    for (const url of endpoints) {
      this.healthMap.set(url, {
        url,
        status: EndpointStatus.HEALTHY,
        failCount: 0,
        lastErrorTime: 0,
        lastSuccessTime: Date.now(),
        nextAvailableTime: 0,
      });
    }

    logger.info(
      { endpointCount: endpoints.length, endpoints },
      'WebSocket RPC pool initialized'
    );

    // Start background health checks
    this.startHealthChecks();
  }

  /**
   * Explicitly connect to WebSocket (initial connection)
   */
  async connect(): Promise<PublicClient> {
    if (this.currentClient) {
      return this.currentClient;
    }

    logger.info('ws_manager: initiating connection to WebSocket pool');
    return await this.connectToHealthyEndpoint();
  }

  /**
   * Create and connect to a WebSocket client (legacy method, calls connect)
   */
  async createClient(): Promise<PublicClient> {
    return await this.connect();
  }

  /**
   * Get the current active client
   */
  getClient(): PublicClient {
    if (!this.currentClient) {
      throw new Error('WebSocket client not connected. Call connect() first.');
    }
    return this.currentClient;
  }

  /**
   * Get the current active endpoint URL
   */
  getCurrentEndpoint(): string | null {
    return this.currentEndpoint;
  }

  /**
   * Connect to the current healthy endpoint
   */
  private async connectToHealthyEndpoint(): Promise<PublicClient> {
    if (this.isDestroyed) {
      throw new Error('WebSocket pool has been destroyed');
    }

    if (this.isConnecting) {
      // Wait for current connection attempt
      while (this.isConnecting && !this.isDestroyed) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (this.currentClient) {
        return this.currentClient;
      }
    }

    this.isConnecting = true;
    let lastError: Error | null = null;

    // Try all endpoints until one succeeds
    for (let attempt = 0; attempt < this.endpoints.length; attempt++) {
      if (this.isDestroyed) {
        this.isConnecting = false;
        throw new Error('WebSocket pool destroyed during connection');
      }

      const endpoint = this.getCurrentHealthyEndpoint();

      try {
        logger.info({ endpoint, attempt: attempt + 1 }, 'ws_manager: connecting to WebSocket endpoint');

        const client = createPublicClient({
          chain: base,
          transport: webSocket(endpoint, {
            timeout: this.config.requestTimeout,
            reconnect: false, // We handle reconnection ourselves
          }),
        }) as PublicClient;

        // Setup event handlers
        await this.setupEventHandlers(client, endpoint);

        // Test the connection with a simple call
        await client.getBlockNumber();

        this.currentClient = client;
        this.currentEndpoint = endpoint;
        this.recordSuccess(endpoint);
        this.isConnecting = false;

        logger.info({ endpoint }, 'ws_manager: connected to WebSocket endpoint');

        // Notify callbacks about new connection
        for (const callback of this.reconnectCallbacks) {
          try {
            await callback(client);
          } catch (error) {
            logger.error(
              { error: (error as Error).message },
              'Error in WebSocket reconnect callback'
            );
          }
        }

        return client;
      } catch (error) {
        lastError = error as Error;
        logger.warn(
          { endpoint, attempt: attempt + 1, error: (error as Error).message },
          'ws_manager: failed to connect to WebSocket endpoint'
        );

        this.handleConnectionError(endpoint, error as Error);
        this.rotateToNextHealthyEndpoint();
      }
    }

    this.isConnecting = false;

    // All endpoints failed
    const nextRetryTime = this.getNextRetryTime();
    if (nextRetryTime > 0) {
      const retryInSeconds = Math.ceil(nextRetryTime / 1000);
      logger.error(
        { retryInSeconds },
        `ws_manager: all endpoints temporarily unavailable, retrying in ${retryInSeconds}s`
      );

      // Wait and retry recursively
      await new Promise((resolve) => setTimeout(resolve, nextRetryTime));
      return await this.connectToHealthyEndpoint();
    }

    throw new Error(
      `Failed to connect to any WebSocket endpoint. Last error: ${lastError?.message}`
    );
  }

  /**
   * Get the time until the next endpoint retry (in ms)
   */
  private getNextRetryTime(): number {
    const now = Date.now();
    let minWaitTime = Infinity;

    for (const health of this.healthMap.values()) {
      if (health.nextAvailableTime > now) {
        const waitTime = health.nextAvailableTime - now;
        minWaitTime = Math.min(minWaitTime, waitTime);
      } else {
        return 0; // At least one endpoint is available now
      }
    }

    return minWaitTime === Infinity ? this.config.baseDelay : minWaitTime;
  }

  /**
   * Setup event handlers for WebSocket client
   */
  private async setupEventHandlers(
    client: PublicClient,
    endpoint: string
  ): Promise<void> {
    try {
      const socket = await client.transport.getSocket();

      socket.addEventListener('close', (event: any) => {
        logger.warn(
          { endpoint, code: event.code, reason: event.reason },
          'ws_manager: WebSocket connection closed'
        );

        if (!this.isDestroyed) {
          this.handleDisconnection(endpoint);
        }
      });

      socket.addEventListener('error', (error: any) => {
        logger.error(
          { endpoint, error: error.type || 'unknown' },
          'ws_manager: WebSocket error occurred'
        );

        if (!this.isDestroyed) {
          this.handleConnectionError(endpoint, new Error(error.type || 'WebSocket error'));
        }
      });
    } catch (error) {
      logger.error(
        { endpoint, error: (error as Error).message },
        'Failed to setup WebSocket event handlers'
      );
    }
  }

  /**
   * Handle WebSocket disconnection
   */
  private async handleDisconnection(endpoint: string): Promise<void> {
    if (this.isDestroyed) return;

    const health = this.healthMap.get(endpoint);
    if (!health) return;

    health.failCount++;
    health.lastErrorTime = Date.now();
    health.status = EndpointStatus.DEGRADED;

    this.currentClient = null;
    this.currentEndpoint = null;

    logger.info('ws_manager: attempting to reconnect to next WebSocket endpoint');
    this.rotateToNextHealthyEndpoint();

    // Reconnect
    try {
      await this.connectToHealthyEndpoint();
    } catch (error) {
      logger.error(
        { error: (error as Error).message },
        'ws_manager: failed to reconnect after disconnection'
      );
    }
  }

  /**
   * Handle WebSocket connection errors
   */
  private handleConnectionError(endpoint: string, _error: Error): void {
    const health = this.healthMap.get(endpoint)!;
    health.failCount++;
    health.lastErrorTime = Date.now();

    // Calculate cooldown with exponential backoff
    const cooldown = Math.min(
      Math.pow(2, health.failCount) * this.config.baseDelay,
      this.config.maxCooldown
    );
    health.nextAvailableTime = Date.now() + cooldown;

    if (health.failCount >= 3) {
      health.status = EndpointStatus.DOWN;
      logger.error(
        { endpoint, failCount: health.failCount, cooldownMs: cooldown },
        'ws_manager: WebSocket endpoint marked as DOWN'
      );
    } else {
      health.status = EndpointStatus.DEGRADED;
      logger.warn(
        { endpoint, failCount: health.failCount, cooldownMs: cooldown },
        'ws_manager: WebSocket endpoint marked as DEGRADED'
      );
    }
  }

  /**
   * Get the current healthy endpoint
   */
  private getCurrentHealthyEndpoint(): string {
    const now = Date.now();
    let attempts = 0;

    while (attempts < this.endpoints.length) {
      const endpoint = this.endpoints[this.currentIndex];
      const health = this.healthMap.get(endpoint)!;

      if (health.nextAvailableTime <= now && health.status !== EndpointStatus.DOWN) {
        return endpoint;
      }

      this.currentIndex = (this.currentIndex + 1) % this.endpoints.length;
      attempts++;
    }

    // All endpoints are down or in cooldown, return the one with earliest retry time
    logger.warn('ws_manager: all WebSocket endpoints are in cooldown or down');
    
    let bestEndpoint = this.endpoints[this.currentIndex];
    let earliestTime = this.healthMap.get(bestEndpoint)!.nextAvailableTime;

    for (const endpoint of this.endpoints) {
      const health = this.healthMap.get(endpoint)!;
      if (health.nextAvailableTime < earliestTime) {
        earliestTime = health.nextAvailableTime;
        bestEndpoint = endpoint;
      }
    }

    return bestEndpoint;
  }

  /**
   * Rotate to the next healthy endpoint
   */
  private rotateToNextHealthyEndpoint(): void {
    const startIndex = this.currentIndex;
    const now = Date.now();
    const previousEndpoint = this.endpoints[this.currentIndex];

    do {
      this.currentIndex = (this.currentIndex + 1) % this.endpoints.length;
      const endpoint = this.endpoints[this.currentIndex];
      const health = this.healthMap.get(endpoint)!;

      if (health.nextAvailableTime <= now && health.status !== EndpointStatus.DOWN) {
        logger.info(
          { from: previousEndpoint, to: endpoint, index: this.currentIndex },
          'ws_manager: rotating to next WebSocket endpoint'
        );
        return;
      }
    } while (this.currentIndex !== startIndex);

    logger.warn('ws_manager: no healthy WebSocket endpoints available for rotation');
  }

  /**
   * Record a successful connection
   */
  private recordSuccess(endpoint: string): void {
    const health = this.healthMap.get(endpoint)!;
    const wasUnhealthy = health.status !== EndpointStatus.HEALTHY;

    health.status = EndpointStatus.HEALTHY;
    health.failCount = 0;
    health.lastSuccessTime = Date.now();
    health.nextAvailableTime = 0;

    if (wasUnhealthy) {
      logger.info({ endpoint }, 'ws_manager: WebSocket endpoint recovered and marked as HEALTHY');
    }
  }

  /**
   * Register a callback to be called when reconnecting
   */
  onReconnect(callback: (client: PublicClient) => void | Promise<void>): void {
    this.reconnectCallbacks.push(callback);
  }

  /**
   * Start background health checks
   */
  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(() => {
      if (!this.isDestroyed) {
        this.performHealthChecks().catch((error) => {
          logger.error({ error: error.message }, 'Error during WebSocket health checks');
        });
      }
    }, this.config.healthCheckInterval);
  }

  /**
   * Perform health checks on degraded/down endpoints
   */
  private async performHealthChecks(): Promise<void> {
    const now = Date.now();

    for (const [endpoint, health] of this.healthMap.entries()) {
      // Only check degraded or down endpoints that are out of cooldown
      if (
        health.status !== EndpointStatus.HEALTHY &&
        health.nextAvailableTime <= now &&
        endpoint !== this.currentEndpoint // Don't health check the active endpoint
      ) {
        try {
          const client = createPublicClient({
            chain: base,
            transport: webSocket(endpoint, {
              timeout: 5000,
              reconnect: false,
            }),
          });

          // Simple health check: get latest block number
          await client.getBlockNumber();

          // Success! Mark as healthy
          this.recordSuccess(endpoint);

          logger.debug({ endpoint }, 'Health check passed for WebSocket endpoint');
        } catch (error) {
          logger.debug(
            { endpoint, error: (error as Error).message },
            'Health check failed for WebSocket endpoint'
          );
          // Keep current status, will retry in next health check
        }
      }
    }
  }

  /**
   * Get current pool status
   */
  getStatus(): Array<EndpointHealth> {
    return Array.from(this.healthMap.values());
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.isDestroyed = true;

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    this.currentClient = null;
    this.currentEndpoint = null;
    this.reconnectCallbacks = [];
    
    logger.info('WebSocket RPC pool destroyed');
  }
}

// Singleton instance
let wsPool: WsRpcPool | null = null;

/**
 * Initialize WebSocket RPC pool with custom endpoints
 */
export function initializeWsPool(
  wssEndpoints: string[] = DEFAULT_WSS_RPC_ENDPOINTS,
  config: RpcPoolConfig = {}
): void {
  if (wsPool) {
    wsPool.destroy();
  }

  wsPool = new WsRpcPool(wssEndpoints, config);

  logger.info('WebSocket RPC pool initialized successfully');
}

/**
 * Get the WebSocket pool instance
 */
export function getWsPool(): WsRpcPool {
  if (!wsPool) {
    throw new Error('WebSocket pool not initialized. Call initializeWsPool() first.');
  }
  return wsPool;
}

/**
 * Cleanup WebSocket pool
 */
export function destroyWsPool(): void {
  if (wsPool) {
    wsPool.destroy();
    wsPool = null;
  }
  logger.info('WebSocket pool destroyed');
}
