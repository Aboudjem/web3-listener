import type { Address } from 'viem';

/**
 * Normalize an Ethereum address to lowercase
 */
export function normalizeAddress(address: string): Address {
  return address.toLowerCase() as Address;
}

/**
 * Check if an address is in a set of watched addresses (case-insensitive)
 */
export function isAddressWatched(address: string, watchedSet: Set<Address>): boolean {
  return watchedSet.has(normalizeAddress(address));
}

/**
 * Get the label for a watched address (case-insensitive lookup)
 */
export function getAddressLabel(
  address: string,
  labelMap: Map<Address, string>
): string | undefined {
  return labelMap.get(normalizeAddress(address));
}

/**
 * Determine which side(s) of a transaction involve watched addresses
 */
export function getWatchedSide(
  from: string,
  to: string | null,
  watchedSet: Set<Address>
): 'from' | 'to' | 'both' | null {
  const isFromWatched = isAddressWatched(from, watchedSet);
  const isToWatched = to ? isAddressWatched(to, watchedSet) : false;

  if (isFromWatched && isToWatched) return 'both';
  if (isFromWatched) return 'from';
  if (isToWatched) return 'to';
  return null;
}
