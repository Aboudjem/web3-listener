/**
 * Check if a value meets or exceeds a threshold
 */
export function meetsThreshold(value: bigint, threshold: bigint): boolean {
  return value >= threshold;
}

/**
 * Convert ETH to Wei
 */
export function ethToWei(eth: number): bigint {
  // Handle decimals by converting to string with proper precision
  const weiString = (eth * 10 ** 18).toFixed(0);
  return BigInt(weiString);
}

/**
 * Convert Wei to ETH (as number)
 */
export function weiToEth(wei: bigint): number {
  return Number(wei) / 10 ** 18;
}
