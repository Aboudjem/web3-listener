import { describe, it, expect } from 'vitest';
import { meetsThreshold, ethToWei, weiToEth } from './threshold.js';

describe('Threshold Utils', () => {
  describe('meetsThreshold', () => {
    const threshold = BigInt(100) * BigInt(10 ** 18); // 100 ETH in wei

    it('should return false when value is below threshold', () => {
      const value = BigInt(99) * BigInt(10 ** 18); // 99 ETH
      expect(meetsThreshold(value, threshold)).toBe(false);
    });

    it('should return true when value equals threshold', () => {
      const value = BigInt(100) * BigInt(10 ** 18); // 100 ETH
      expect(meetsThreshold(value, threshold)).toBe(true);
    });

    it('should return true when value exceeds threshold', () => {
      const value = BigInt(101) * BigInt(10 ** 18); // 101 ETH
      expect(meetsThreshold(value, threshold)).toBe(true);
    });

    it('should handle very large values', () => {
      const value = BigInt(1000000) * BigInt(10 ** 18); // 1M ETH
      expect(meetsThreshold(value, threshold)).toBe(true);
    });

    it('should handle zero value', () => {
      const value = BigInt(0);
      expect(meetsThreshold(value, threshold)).toBe(false);
    });
  });

  describe('ethToWei', () => {
    it('should convert 1 ETH to wei', () => {
      expect(ethToWei(1)).toBe(BigInt(10 ** 18));
    });

    it('should convert 100 ETH to wei', () => {
      expect(ethToWei(100)).toBe(BigInt(100) * BigInt(10 ** 18));
    });

    it('should convert 0.1 ETH to wei', () => {
      expect(ethToWei(0.1)).toBe(BigInt(10 ** 17)); // 0.1 ETH = 10^17 wei
    });

    it('should handle zero', () => {
      expect(ethToWei(0)).toBe(BigInt(0));
    });
  });

  describe('weiToEth', () => {
    it('should convert 1 ETH worth of wei to ETH', () => {
      const wei = BigInt(10 ** 18);
      expect(weiToEth(wei)).toBe(1);
    });

    it('should convert 100 ETH worth of wei to ETH', () => {
      const wei = BigInt(100) * BigInt(10 ** 18);
      expect(weiToEth(wei)).toBe(100);
    });

    it('should convert 0.5 ETH worth of wei to ETH', () => {
      const wei = BigInt(5) * BigInt(10 ** 17);
      expect(weiToEth(wei)).toBe(0.5);
    });

    it('should handle zero wei', () => {
      expect(weiToEth(BigInt(0))).toBe(0);
    });

    it('should handle very large values', () => {
      const wei = BigInt(1000000) * BigInt(10 ** 18);
      expect(weiToEth(wei)).toBe(1000000);
    });
  });
});
