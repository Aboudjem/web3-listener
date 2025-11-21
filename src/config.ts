import { config as loadEnv } from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import type { Address } from 'viem';
import type { AppConfig, WatchedWallet } from './types.js';
import { ConfigError } from './errors.js';
import { ethToWei } from './utils/threshold.js';

// Load environment variables
loadEnv();

// Validation schemas
const envSchema = z.object({
  BASE_WSS_RPC_URL: z.string().url(),
  TRANSFER_THRESHOLD_ETH: z.string().transform(Number).pipe(z.number().positive()),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

const walletSchema = z.object({
  label: z.string(),
  address: z.string().refine((addr) => /^0x[a-fA-F0-9]{40}$/.test(addr), {
    message: 'Invalid Ethereum address format',
  }),
});

const walletsArraySchema = z.array(walletSchema);

function loadWallets(): WatchedWallet[] {
  const walletsPath = join(process.cwd(), 'config', 'wallets.json');
  
  try {
    const walletsData = readFileSync(walletsPath, 'utf-8');
    const wallets = JSON.parse(walletsData);
    
    const validated = walletsArraySchema.parse(wallets);
    
    // Normalize addresses to lowercase
    return validated.map((wallet) => ({
      label: wallet.label,
      address: wallet.address.toLowerCase() as Address,
    }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Wallets config file not found at: ${walletsPath}`);
    }
    throw new Error(`Failed to load wallets config: ${(error as Error).message}`);
  }
}

function loadConfig(): AppConfig {
  // Validate environment variables
  const envResult = envSchema.safeParse({
    BASE_WSS_RPC_URL: process.env.BASE_WSS_RPC_URL,
    TRANSFER_THRESHOLD_ETH: process.env.TRANSFER_THRESHOLD_ETH,
    LOG_LEVEL: process.env.LOG_LEVEL,
  });

  if (!envResult.success) {
    const errors = envResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
  }

  const env = envResult.data;

  // Load watched wallets
  const watchedWallets = loadWallets();

  if (watchedWallets.length === 0) {
    throw new Error('No wallets configured in config/wallets.json');
  }

  // Convert threshold from ETH to wei
  const thresholdWei = BigInt(env.TRANSFER_THRESHOLD_ETH) * BigInt(10 ** 18);

  // Create set of watched addresses for fast lookup
  const watchedAddressesSet = new Set<Address>(
    watchedWallets.map((w) => w.address)
  );

  // Create address to label map
  const addressLabelMap = new Map<Address, string>(
    watchedWallets.map((w) => [w.address, w.label])
  );

  return {
    wssRpcUrl: env.BASE_WSS_RPC_URL,
    thresholdWei,
    thresholdETH: env.TRANSFER_THRESHOLD_ETH,
    logLevel: env.LOG_LEVEL,
    watchedWallets,
    watchedAddressesSet,
    addressLabelMap,
  };
}

export interface ConfigOptions {
  thresholdOverride?: number;
  demoMode?: boolean;
}

let configInstance: AppConfig | null = null;

/**
 * Load config with optional CLI overrides
 */
export function initConfig(options?: ConfigOptions): AppConfig {
  const baseConfig = loadConfig();

  // Apply CLI overrides
  let thresholdETH = baseConfig.thresholdETH;

  if (options?.demoMode) {
    thresholdETH = 0.1; // Demo mode uses 0.1 ETH threshold
  } else if (options?.thresholdOverride) {
    thresholdETH = options.thresholdOverride;
  }

  const thresholdWei = ethToWei(thresholdETH);

  configInstance = {
    ...baseConfig,
    thresholdETH,
    thresholdWei,
  };

  return configInstance;
}

/**
 * Get the current config instance
 */
export function getConfig(): AppConfig {
  if (!configInstance) {
    throw new ConfigError('Config not initialized. Call initConfig() first.');
  }
  return configInstance;
}

// Export default config for backward compatibility
export const config = loadConfig();
