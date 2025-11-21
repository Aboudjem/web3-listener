import pino from 'pino';
import { formatEther } from 'viem';
import { config } from './config.js';

export const logger = pino({
  level: config.logLevel,
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
      translateTime: 'SYS:standard',
    },
  },
  base: {
    service: 'base-large-transfer-watcher',
  },
});

/**
 * Format wei value to ETH string with proper decimals
 */
export function formatWeiToETH(wei: bigint): string {
  return formatEther(wei);
}

/**
 * Format address with optional label
 */
export function formatAddress(address: string, label?: string): string {
  if (label) {
    return `${address} (${label})`;
  }
  return address;
}
