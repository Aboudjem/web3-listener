import chalk from 'chalk';
import type { TransferEvent } from '../types.js';
import { shortenAddress, formatTimestamp } from '../utils/formatting.js';

/**
 * Print a formatted transfer event to console
 */
export function printTransferEvent(event: TransferEvent): void {
  const isPending = event.type === 'pending';
  const color = isPending ? chalk.yellow : chalk.green;
  const typeLabel = isPending ? 'PENDING' : 'CONFIRMED';
  const statusEmoji = isPending ? '🟡' : '🟢';

  console.log('\n' + color('┌─────────────────────────────────────────────────────────┐'));
  console.log(
    color('│') +
      ` ${statusEmoji} ${chalk.bold(`[${typeLabel}] LARGE TRANSFER DETECTED`)}`.padEnd(58) +
      color('│')
  );
  console.log(color('├─────────────────────────────────────────────────────────┤'));

  // Wallet info (which side is watched)
  const watchedInfo =
    event.watchedSide === 'both'
      ? `${event.fromLabel} → ${event.toLabel} (BOTH WATCHED)`
      : event.watchedSide === 'from'
        ? `${event.fromLabel} (FROM)`
        : `${event.toLabel} (TO)`;

  console.log(color('│') + chalk.cyan(' Wallet:  ') + chalk.bold(watchedInfo).padEnd(44) + color('│'));
  
  // Clickable transaction link
  const txUrl = `https://basescan.org/tx/${event.txHash}`;
  console.log(color('│') + chalk.cyan(' Tx:      ') + chalk.blue.underline(txUrl) + color(' │'));
  
  const fromInfo = event.fromLabel 
    ? `${shortenAddress(event.from)} ${chalk.dim(`(${event.fromLabel})`)}`
    : shortenAddress(event.from);
  console.log(color('│') + chalk.cyan(' From:    ') + chalk.gray(fromInfo).padEnd(44) + color('│'));
  
  const toInfo = event.to
    ? event.toLabel
      ? `${shortenAddress(event.to)} ${chalk.dim(`(${event.toLabel})`)}`
      : shortenAddress(event.to)
    : 'null';
  console.log(color('│') + chalk.cyan(' To:      ') + chalk.gray(toInfo).padEnd(44) + color('│'));
  
  console.log(
    color('│') +
      chalk.cyan(' Value:   ') +
      chalk.bold.white(event.valueETH) +
      ' ' +
      chalk.gray('ETH') +
      ''.padEnd(30) +
      color('│')
  );

  const blockInfo = event.blockNumber ? event.blockNumber.toString() : '(pending)';
  console.log(color('│') + chalk.cyan(' Block:   ') + chalk.gray(blockInfo).padEnd(44) + color('│'));

  console.log(
    color('│') +
      chalk.cyan(' Time:    ') +
      chalk.gray(formatTimestamp(event.timestamp)).padEnd(44) +
      color('│')
  );

  console.log(color('└─────────────────────────────────────────────────────────┘'));
}

/**
 * Print startup banner with configuration
 */
export function printBanner(config: {
  network: string;
  threshold: string;
  walletCount: number;
  demoMode: boolean;
}): void {
  console.log('\n');
  console.log(chalk.bold.cyan('╔═══════════════════════════════════════════════╗'));
  console.log(
    chalk.bold.cyan('║') +
      chalk.bold.white('   BASE MAINNET LARGE TRANSFER MONITOR         ') +
      chalk.bold.cyan('║')
  );
  console.log(chalk.bold.cyan('╚═══════════════════════════════════════════════╝'));
  console.log();
  console.log(`${chalk.gray('Network:')}         ${chalk.white(config.network)}`);
  console.log(`${chalk.gray('Threshold:')}       ${chalk.white(config.threshold)}`);
  console.log(`${chalk.gray('Watched Wallets:')} ${chalk.white(config.walletCount)}`);

  if (config.demoMode) {
    console.log();
    console.log(chalk.bold.yellow('⚠️  DEMO MODE ACTIVE - Using reduced threshold for testing ⚠️'));
  }

  console.log();
  console.log(chalk.green('✓') + ' Monitoring active...');
  console.log();
}

/**
 * Print error message
 */
export function printError(message: string, error?: Error): void {
  console.log();
  console.log(chalk.red.bold('✗ ERROR: ') + chalk.red(message));
  if (error && error.stack) {
    console.log(chalk.gray(error.stack));
  }
  console.log();
}

/**
 * Print info message
 */
export function printInfo(message: string): void {
  console.log(chalk.blue('ℹ') + ' ' + chalk.white(message));
}

/**
 * Print success message
 */
export function printSuccess(message: string): void {
  console.log(chalk.green('✓') + ' ' + chalk.white(message));
}
