import type { Hash } from 'viem';
import type { TransferEvent, AppConfig } from '../types.js';
import { normalizeAddress, getWatchedSide, getAddressLabel } from './address.js';
import { formatWeiToETH } from './formatting.js';

export interface RawTransaction {
  hash: Hash;
  from: string;
  to: string | null;
  value: bigint;
  blockNumber?: bigint;
}

/**
 * Build a TransferEvent from a raw transaction
 */
export function buildTransferEvent(
  tx: RawTransaction,
  config: AppConfig,
  type: 'pending' | 'confirmed',
  seenInMempool: boolean
): TransferEvent {
  const fromAddress = normalizeAddress(tx.from);
  const toAddress = tx.to ? normalizeAddress(tx.to) : null;

  const watchedSide = getWatchedSide(tx.from, tx.to, config.watchedAddressesSet);

  if (!watchedSide) {
    throw new Error('Neither from nor to address is watched');
  }

  return {
    type,
    txHash: tx.hash,
    blockNumber: tx.blockNumber,
    from: fromAddress,
    fromLabel: getAddressLabel(fromAddress, config.addressLabelMap),
    to: toAddress,
    toLabel: toAddress ? getAddressLabel(toAddress, config.addressLabelMap) : undefined,
    valueWei: tx.value,
    valueETH: formatWeiToETH(tx.value),
    watchedSide,
    seenInMempool,
    timestamp: Date.now(),
  };
}

/**
 * Check if a transaction should be processed (meets criteria)
 */
export function shouldProcessTransaction(
  tx: RawTransaction,
  config: AppConfig,
  seenTxHashes: Set<Hash>
): boolean {
  // Skip if already seen
  if (seenTxHashes.has(tx.hash)) {
    return false;
  }

  // Skip contract creation
  if (!tx.to) {
    return false;
  }

  // Check if value meets threshold
  if (tx.value < config.thresholdWei) {
    return false;
  }

  // Check if either from or to is watched
  const watchedSide = getWatchedSide(tx.from, tx.to, config.watchedAddressesSet);
  return watchedSide !== null;
}
