import { Command } from 'commander';

export interface CLIOptions {
  threshold?: number;
  demo: boolean;
}

/**
 * Parse command line arguments
 */
export function parseCliArgs(): CLIOptions {
  const program = new Command();

  program
    .name('web3-listener')
    .description('Base mainnet large transfer watcher')
    .version('1.0.0')
    .option('-t, --threshold <number>', 'Override transfer threshold in ETH')
    .option('-d, --demo', 'Run in demo mode with lower threshold (0.1 ETH)', false)
    .parse();

  const options = program.opts<CLIOptions>();

  return {
    threshold: options.threshold ? parseFloat(options.threshold.toString()) : undefined,
    demo: options.demo,
  };
}
