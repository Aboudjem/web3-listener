import { describe, it, expect } from 'vitest';
import type { Address } from 'viem';
import { normalizeAddress, isAddressWatched, getAddressLabel, getWatchedSide } from './address.js';

describe('Address Utils', () => {
  describe('normalizeAddress', () => {
    it('should convert address to lowercase', () => {
      const addr = '0xD551234Ae421e3BCBA99A0dA6d736074f22192Ff';
      expect(normalizeAddress(addr)).toBe('0xd551234ae421e3bcba99a0da6d736074f22192ff');
    });

    it('should handle already lowercase addresses', () => {
      const addr = '0xd551234ae421e3bcba99a0da6d736074f22192ff';
      expect(normalizeAddress(addr)).toBe(addr);
    });
  });

  describe('isAddressWatched', () => {
    const watchedSet = new Set<Address>([
      '0xd551234ae421e3bcba99a0da6d736074f22192ff' as Address,
      '0xfe9e8709d3215310075d67e3ed32a380ccf451c8' as Address,
    ]);

    it('should return true for watched address (exact case)', () => {
      expect(isAddressWatched('0xd551234ae421e3bcba99a0da6d736074f22192ff', watchedSet)).toBe(true);
    });

    it('should return true for watched address (different case)', () => {
      expect(isAddressWatched('0xD551234Ae421e3BCBA99A0dA6d736074f22192Ff', watchedSet)).toBe(true);
    });

    it('should return false for non-watched address', () => {
      expect(isAddressWatched('0x1234567890123456789012345678901234567890', watchedSet)).toBe(
        false
      );
    });
  });

  describe('getAddressLabel', () => {
    const labelMap = new Map<Address, string>([
      ['0xd551234ae421e3bcba99a0da6d736074f22192ff' as Address, 'Binance 1'],
      ['0xfe9e8709d3215310075d67e3ed32a380ccf451c8' as Address, 'Binance 2'],
    ]);

    it('should return label for known address (exact case)', () => {
      expect(getAddressLabel('0xd551234ae421e3bcba99a0da6d736074f22192ff', labelMap)).toBe(
        'Binance 1'
      );
    });

    it('should return label for known address (different case)', () => {
      expect(getAddressLabel('0xD551234Ae421e3BCBA99A0dA6d736074f22192Ff', labelMap)).toBe(
        'Binance 1'
      );
    });

    it('should return undefined for unknown address', () => {
      expect(
        getAddressLabel('0x1234567890123456789012345678901234567890', labelMap)
      ).toBeUndefined();
    });
  });

  describe('getWatchedSide', () => {
    const watchedSet = new Set<Address>([
      '0xd551234ae421e3bcba99a0da6d736074f22192ff' as Address,
      '0xfe9e8709d3215310075d67e3ed32a380ccf451c8' as Address,
    ]);

    it('should return "from" when only from address is watched', () => {
      const result = getWatchedSide(
        '0xd551234ae421e3bcba99a0da6d736074f22192ff',
        '0x1234567890123456789012345678901234567890',
        watchedSet
      );
      expect(result).toBe('from');
    });

    it('should return "to" when only to address is watched', () => {
      const result = getWatchedSide(
        '0x1234567890123456789012345678901234567890',
        '0xd551234ae421e3bcba99a0da6d736074f22192ff',
        watchedSet
      );
      expect(result).toBe('to');
    });

    it('should return "both" when both addresses are watched', () => {
      const result = getWatchedSide(
        '0xd551234ae421e3bcba99a0da6d736074f22192ff',
        '0xfe9e8709d3215310075d67e3ed32a380ccf451c8',
        watchedSet
      );
      expect(result).toBe('both');
    });

    it('should return null when neither address is watched', () => {
      const result = getWatchedSide(
        '0x1234567890123456789012345678901234567890',
        '0x0987654321098765432109876543210987654321',
        watchedSet
      );
      expect(result).toBeNull();
    });

    it('should handle case-insensitive matching', () => {
      const result = getWatchedSide(
        '0xD551234Ae421e3BCBA99A0dA6d736074f22192Ff',
        '0xFE9e8709D3215310075d67e3eD32a380cCF451c8',
        watchedSet
      );
      expect(result).toBe('both');
    });

    it('should return null when to is null and from is not watched', () => {
      const result = getWatchedSide('0x1234567890123456789012345678901234567890', null, watchedSet);
      expect(result).toBeNull();
    });
  });
});
