import type { Address, Hash } from 'viem';

export interface WatchedWallet {
  label: string;
  address: Address;
}

export interface TransferEvent {
  type: 'pending' | 'confirmed';
  txHash: Hash;
  blockNumber?: bigint;
  from: Address;
  fromLabel?: string;
  to: Address | null;
  toLabel?: string;
  valueWei: bigint;
  valueETH: string;
  watchedSide: 'from' | 'to' | 'both';
  seenInMempool: boolean;
  timestamp: number;
}

export interface AppConfig {
  wssRpcUrl: string;
  thresholdWei: bigint;
  thresholdETH: number;
  logLevel: string;
  watchedWallets: WatchedWallet[];
  watchedAddressesSet: Set<Address>;
  addressLabelMap: Map<Address, string>;
}
