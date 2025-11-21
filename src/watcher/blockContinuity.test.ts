import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PublicClient, Block } from 'viem';
import { BlockContinuityManager } from './blockContinuity.js';

describe('BlockContinuityManager', () => {
  let mockClient: PublicClient;
  let processedBlocks: bigint[];
  let onBlockCallback: (block: Block) => Promise<void>;
  let onErrorCallback: (error: Error) => void;
  let errors: Error[];

  beforeEach(() => {
    processedBlocks = [];
    errors = [];

    onBlockCallback = vi.fn(async (block: Block) => {
      if (block.number) {
        processedBlocks.push(block.number);
      }
    });

    onErrorCallback = vi.fn((error: Error) => {
      errors.push(error);
    });

    // Create mock client
    mockClient = {
      getBlockNumber: vi.fn(),
      getBlock: vi.fn(),
    } as unknown as PublicClient;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize at latest block number', async () => {
      const latestBlock = 1000n;
      vi.mocked(mockClient.getBlockNumber).mockResolvedValue(latestBlock);

      const manager = new BlockContinuityManager(mockClient, {
        onBlock: onBlockCallback,
        onError: onErrorCallback,
      });

      await manager.initialize();

      expect(manager.isReady()).toBe(true);
      expect(manager.getLastProcessedBlockNumber()).toBe(latestBlock);
      expect(mockClient.getBlockNumber).toHaveBeenCalledTimes(1);
    });

    it('should not re-initialize if already initialized', async () => {
      vi.mocked(mockClient.getBlockNumber).mockResolvedValue(1000n);

      const manager = new BlockContinuityManager(mockClient, {
        onBlock: onBlockCallback,
        onError: onErrorCallback,
      });

      await manager.initialize();
      await manager.initialize();

      expect(mockClient.getBlockNumber).toHaveBeenCalledTimes(1);
    });
  });

  describe('processNewBlock - normal sequence', () => {
    it('should process blocks in sequence without gaps', async () => {
      vi.mocked(mockClient.getBlockNumber).mockResolvedValue(100n);
      vi.mocked(mockClient.getBlock).mockImplementation(async (params: any) => ({
        number: params?.blockNumber as bigint,
        transactions: [],
      }) as unknown as Block);

      const manager = new BlockContinuityManager(mockClient, {
        onBlock: onBlockCallback,
        onError: onErrorCallback,
      });

      await manager.initialize();
      await manager.processNewBlock(101n);
      await manager.processNewBlock(102n);
      await manager.processNewBlock(103n);

      expect(processedBlocks).toEqual([101n, 102n, 103n]);
      expect(manager.getLastProcessedBlockNumber()).toBe(103n);
      expect(errors).toHaveLength(0);
    });
  });

  describe('processNewBlock - gap detection and backfill', () => {
    it('should detect gap and backfill missing blocks', async () => {
      vi.mocked(mockClient.getBlockNumber).mockResolvedValue(100n);
      vi.mocked(mockClient.getBlock).mockImplementation(async (params: any) => ({
        number: params?.blockNumber as bigint,
        transactions: [],
      }) as unknown as Block);

      const manager = new BlockContinuityManager(mockClient, {
        onBlock: onBlockCallback,
        onError: onErrorCallback,
      });

      await manager.initialize();
      
      // Process block 101
      await manager.processNewBlock(101n);
      
      // Skip to block 105 (gap of 102, 103, 104)
      await manager.processNewBlock(105n);

      // Should have processed all blocks in order
      expect(processedBlocks).toEqual([101n, 102n, 103n, 104n, 105n]);
      expect(manager.getLastProcessedBlockNumber()).toBe(105n);
    });

    it('should handle large gaps', async () => {
      vi.mocked(mockClient.getBlockNumber).mockResolvedValue(100n);
      vi.mocked(mockClient.getBlock).mockImplementation(async (params: any) => ({
        number: params?.blockNumber as bigint,
        transactions: [],
      }) as unknown as Block);

      const manager = new BlockContinuityManager(mockClient, {
        onBlock: onBlockCallback,
        onError: onErrorCallback,
      });

      await manager.initialize();
      await manager.processNewBlock(101n);
      
      // Large gap
      await manager.processNewBlock(110n);

      expect(processedBlocks).toEqual([101n, 102n, 103n, 104n, 105n, 106n, 107n, 108n, 109n, 110n]);
      expect(manager.getLastProcessedBlockNumber()).toBe(110n);
    });

    it('should continue processing despite backfill errors', async () => {
      vi.mocked(mockClient.getBlockNumber).mockResolvedValue(100n);
      vi.mocked(mockClient.getBlock).mockImplementation(async (params: any) => {
        // Fail on block 103
        if (params?.blockNumber === 103n) {
          throw new Error('Failed to fetch block 103');
        }
        return {
          number: params?.blockNumber as bigint,
          transactions: [],
        } as unknown as Block;
      });

      const manager = new BlockContinuityManager(mockClient, {
        onBlock: onBlockCallback,
        onError: onErrorCallback,
      });

      await manager.initialize();
      await manager.processNewBlock(101n);
      await manager.processNewBlock(105n);

      // Should process all blocks except the failed one
      expect(processedBlocks).toEqual([101n, 102n, 104n, 105n]);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Failed to fetch block 103');
    });
  });

  describe('processNewBlock - duplicate and old blocks', () => {
    it('should skip duplicate blocks', async () => {
      vi.mocked(mockClient.getBlockNumber).mockResolvedValue(100n);
      vi.mocked(mockClient.getBlock).mockImplementation(async (params: any) => ({
        number: params?.blockNumber as bigint,
        transactions: [],
      }) as unknown as Block);

      const manager = new BlockContinuityManager(mockClient, {
        onBlock: onBlockCallback,
        onError: onErrorCallback,
      });

      await manager.initialize();
      await manager.processNewBlock(101n);
      await manager.processNewBlock(101n); // Duplicate

      expect(processedBlocks).toEqual([101n]); // Only processed once
    });

    it('should skip old blocks', async () => {
      vi.mocked(mockClient.getBlockNumber).mockResolvedValue(100n);
      vi.mocked(mockClient.getBlock).mockImplementation(async (params: any) => ({
        number: params?.blockNumber as bigint,
        transactions: [],
      }) as unknown as Block);

      const manager = new BlockContinuityManager(mockClient, {
        onBlock: onBlockCallback,
        onError: onErrorCallback,
      });

      await manager.initialize();
      await manager.processNewBlock(101n);
      await manager.processNewBlock(102n);
      await manager.processNewBlock(101n); // Old block

      expect(processedBlocks).toEqual([101n, 102n]); // Old block not processed
    });
  });

  describe('handleReconnection', () => {
    it('should backfill blocks missed during downtime', async () => {
      vi.mocked(mockClient.getBlockNumber).mockResolvedValueOnce(100n); // Initial
      vi.mocked(mockClient.getBlock).mockImplementation(async (params: any) => ({
        number: params?.blockNumber as bigint,
        transactions: [],
      }) as unknown as Block);

      const manager = new BlockContinuityManager(mockClient, {
        onBlock: onBlockCallback,
        onError: onErrorCallback,
      });

      await manager.initialize();
      await manager.processNewBlock(101n);
      await manager.processNewBlock(102n);

      // Simulate reconnection - new client shows we're at block 106
      const newMockClient = {
        getBlockNumber: vi.fn().mockResolvedValue(106n),
        getBlock: vi.fn().mockImplementation(async (params: any) => ({
          number: params?.blockNumber as bigint,
          transactions: [],
        }) as unknown as Block),
      } as unknown as PublicClient;

      await manager.handleReconnection(newMockClient);

      // Should have backfilled 103, 104, 105, 106
      expect(processedBlocks).toEqual([101n, 102n, 103n, 104n, 105n, 106n]);
      expect(manager.getLastProcessedBlockNumber()).toBe(106n);
    });

    it('should handle no missed blocks during reconnection', async () => {
      vi.mocked(mockClient.getBlockNumber).mockResolvedValueOnce(100n);
      vi.mocked(mockClient.getBlock).mockImplementation(async (params: any) => ({
        number: params?.blockNumber as bigint,
        transactions: [],
      }) as unknown as Block);

      const manager = new BlockContinuityManager(mockClient, {
        onBlock: onBlockCallback,
        onError: onErrorCallback,
      });

      await manager.initialize();
      await manager.processNewBlock(101n);

      // Reconnect at same block
      const newMockClient = {
        getBlockNumber: vi.fn().mockResolvedValue(101n),
        getBlock: vi.fn(),
      } as unknown as PublicClient;

      await manager.handleReconnection(newMockClient);

      expect(processedBlocks).toEqual([101n]); // No additional blocks
    });

    it('should initialize if not previously initialized', async () => {
      const newMockClient = {
        getBlockNumber: vi.fn().mockResolvedValue(200n),
        getBlock: vi.fn(),
      } as unknown as PublicClient;

      const manager = new BlockContinuityManager(mockClient, {
        onBlock: onBlockCallback,
        onError: onErrorCallback,
      });

      // Don't initialize, directly reconnect
      await manager.handleReconnection(newMockClient);

      expect(manager.isReady()).toBe(true);
      expect(manager.getLastProcessedBlockNumber()).toBe(200n);
    });
  });

  describe('reset', () => {
    it('should reset manager state', async () => {
      vi.mocked(mockClient.getBlockNumber).mockResolvedValue(100n);
      
      const manager = new BlockContinuityManager(mockClient, {
        onBlock: onBlockCallback,
        onError: onErrorCallback,
      });

      await manager.initialize();
      expect(manager.isReady()).toBe(true);

      manager.reset();

      expect(manager.isReady()).toBe(false);
      expect(manager.getLastProcessedBlockNumber()).toBe(null);
    });
  });
});
