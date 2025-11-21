import { describe, it, expect } from 'vitest';
import type { Address, Hash } from 'viem';
import type { AppConfig } from '../types.js';
import { buildTransferEvent, shouldProcessTransaction, type RawTransaction } from './event.js';

describe('Event Utils', () => {
  const mockConfig: AppConfig = {
    wssRpcUrl: 'wss://test',
    thresholdWei: BigInt(100) * BigInt(10 ** 18), // 100 ETH
    thresholdETH: 100,
    logLevel: 'info',
    watchedWallets: [
      { label: 'Binance 1', address: '0xd551234ae421e3bcba99a0da6d736074f22192ff' as Address },
      { label: 'Coinbase 1', address: '0x503828976d22510aad0201ac7ec88293211d23da' as Address },
    ],
    watchedAddressesSet: new Set<Address>([
      '0xd551234ae421e3bcba99a0da6d736074f22192ff' as Address,
      '0x503828976d22510aad0201ac7ec88293211d23da' as Address,
    ]),
    addressLabelMap: new Map<Address, string>([
      ['0xd551234ae421e3bcba99a0da6d736074f22192ff' as Address, 'Binance 1'],
      ['0x503828976d22510aad0201ac7ec88293211d23da' as Address, 'Coinbase 1'],
    ]),
  };

  describe('buildTransferEvent', () => {
    it('should build event with watchedSide "from"', () => {
      const tx: RawTransaction = {
        hash: '0x123' as Hash,
        from: '0xd551234ae421e3bcba99a0da6d736074f22192ff',
        to: '0x1234567890123456789012345678901234567890',
        value: BigInt(150) * BigInt(10 ** 18),
      };

      const event = buildTransferEvent(tx, mockConfig, 'pending', true);

      expect(event.type).toBe('pending');
      expect(event.watchedSide).toBe('from');
      expect(event.fromLabel).toBe('Binance 1');
      expect(event.toLabel).toBeUndefined();
      expect(event.seenInMempool).toBe(true);
    });

    it('should build event with watchedSide "to"', () => {
      const tx: RawTransaction = {
        hash: '0x123' as Hash,
        from: '0x1234567890123456789012345678901234567890',
        to: '0xd551234ae421e3bcba99a0da6d736074f22192ff',
        value: BigInt(150) * BigInt(10 ** 18),
      };

      const event = buildTransferEvent(tx, mockConfig, 'pending', true);

      expect(event.watchedSide).toBe('to');
      expect(event.fromLabel).toBeUndefined();
      expect(event.toLabel).toBe('Binance 1');
    });

    it('should build event with watchedSide "both"', () => {
      const tx: RawTransaction = {
        hash: '0x123' as Hash,
        from: '0xd551234ae421e3bcba99a0da6d736074f22192ff',
        to: '0x503828976d22510aad0201ac7ec88293211d23da',
        value: BigInt(150) * BigInt(10 ** 18),
      };

      const event = buildTransferEvent(tx, mockConfig, 'pending', true);

      expect(event.watchedSide).toBe('both');
      expect(event.fromLabel).toBe('Binance 1');
      expect(event.toLabel).toBe('Coinbase 1');
    });

    it('should build confirmed event with block number', () => {
      const tx: RawTransaction = {
        hash: '0x123' as Hash,
        from: '0xd551234ae421e3bcba99a0da6d736074f22192ff',
        to: '0x1234567890123456789012345678901234567890',
        value: BigInt(150) * BigInt(10 ** 18),
        blockNumber: BigInt(12345),
      };

      const event = buildTransferEvent(tx, mockConfig, 'confirmed', false);

      expect(event.type).toBe('confirmed');
      expect(event.blockNumber).toBe(BigInt(12345));
      expect(event.seenInMempool).toBe(false);
    });

    it('should throw error if neither from nor to is watched', () => {
      const tx: RawTransaction = {
        hash: '0x123' as Hash,
        from: '0x1234567890123456789012345678901234567890',
        to: '0x0987654321098765432109876543210987654321',
        value: BigInt(150) * BigInt(10 ** 18),
      };

      expect(() => buildTransferEvent(tx, mockConfig, 'pending', true)).toThrow(
        'Neither from nor to address is watched'
      );
    });
  });

  describe('shouldProcessTransaction', () => {
    const seenHashes = new Set<Hash>();

    it('should return false for already seen transaction', () => {
      const tx: RawTransaction = {
        hash: '0x123' as Hash,
        from: '0xd551234ae421e3bcba99a0da6d736074f22192ff',
        to: '0x1234567890123456789012345678901234567890',
        value: BigInt(150) * BigInt(10 ** 18),
      };

      seenHashes.add('0x123' as Hash);
      expect(shouldProcessTransaction(tx, mockConfig, seenHashes)).toBe(false);
    });

    it('should return false for contract creation (null to)', () => {
      const tx: RawTransaction = {
        hash: '0x456' as Hash,
        from: '0xd551234ae421e3bcba99a0da6d736074f22192ff',
        to: null,
        value: BigInt(150) * BigInt(10 ** 18),
      };

      expect(shouldProcessTransaction(tx, mockConfig, new Set())).toBe(false);
    });

    it('should return false when value below threshold', () => {
      const tx: RawTransaction = {
        hash: '0x789' as Hash,
        from: '0xd551234ae421e3bcba99a0da6d736074f22192ff',
        to: '0x1234567890123456789012345678901234567890',
        value: BigInt(50) * BigInt(10 ** 18), // Below 100 ETH threshold
      };

      expect(shouldProcessTransaction(tx, mockConfig, new Set())).toBe(false);
    });

    it('should return false when neither address is watched', () => {
      const tx: RawTransaction = {
        hash: '0xabc' as Hash,
        from: '0x1234567890123456789012345678901234567890',
        to: '0x0987654321098765432109876543210987654321',
        value: BigInt(150) * BigInt(10 ** 18),
      };

      expect(shouldProcessTransaction(tx, mockConfig, new Set())).toBe(false);
    });

    it('should return true for valid transaction', () => {
      const tx: RawTransaction = {
        hash: '0xdef' as Hash,
        from: '0xd551234ae421e3bcba99a0da6d736074f22192ff',
        to: '0x1234567890123456789012345678901234567890',
        value: BigInt(150) * BigInt(10 ** 18),
      };

      expect(shouldProcessTransaction(tx, mockConfig, new Set())).toBe(true);
    });

    it('should return true when value equals threshold', () => {
      const tx: RawTransaction = {
        hash: '0xghi' as Hash,
        from: '0xd551234ae421e3bcba99a0da6d736074f22192ff',
        to: '0x1234567890123456789012345678901234567890',
        value: BigInt(100) * BigInt(10 ** 18), // Exactly 100 ETH
      };

      expect(shouldProcessTransaction(tx, mockConfig, new Set())).toBe(true);
    });
  });
});
