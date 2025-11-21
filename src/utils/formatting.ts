import { formatEther } from 'viem';

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

/**
 * Shorten address for display (0x1234...5678)
 */
export function shortenAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Shorten transaction hash for display
 */
export function shortenTxHash(hash: string): string {
  if (hash.length < 10) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

/**
 * Format timestamp to ISO string
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}
