# Web3 Base Mainnet Transfer Monitor

A robust, production-ready TypeScript application that monitors large ETH transfers on Base mainnet, tracking transactions from major exchange wallets in real-time with **WebSocket-only architecture** and **guaranteed block continuity**.

## Features

- 🔍 **Real-time Monitoring**: Watches both mempool (pending) and confirmed transactions
- 🌐 **WebSocket-Only Architecture**: 100% WebSocket-based for efficient, real-time data streaming
- 🛡️ **Block Continuity Guarantees**: No blocks are ever skipped - automatic gap detection and backfill
- 🔄 **Automatic Failover**: Seamless rotation between multiple WSS endpoints when failures occur
- 🏦 **Exchange Tracking**: Pre-configured with 30+ major exchange wallet addresses (Binance, Coinbase, MEXC, Bybit, OKX, KuCoin, HTX, Bitget)
- 🎨 **Beautiful CLI**: Colorful, formatted console output for easy reading
- 🧪 **Fully Tested**: Comprehensive test suite with 90+ tests including block continuity verification
- 🛡️ **Type Safe**: Built with TypeScript in strict mode
- ⚡ **Demo Mode**: Test with lower thresholds (0.1 ETH) for easy verification
- 🔧 **Configurable**: CLI arguments for threshold overrides and modes
- 📊 **Structured Logging**: Pino logger with JSON output option

## Architecture Highlights

### WebSocket-Only Design

The application uses **exclusively WebSocket connections** for all blockchain interactions:

- ✅ Block subscriptions via WebSocket (`eth_subscribe` with `newHeads`)
- ✅ Pending transaction subscriptions via WebSocket (`eth_subscribe` with `newPendingTransactions`)
- ✅ Block data fetching via WebSocket (`eth_getBlockByNumber`)
- ✅ Transaction data fetching via WebSocket (`eth_getTransactionByHash`)
- ✅ All JSON-RPC calls over WebSocket transport

**No HTTP clients** are used anywhere in the codebase.

### Block Continuity System

The `BlockContinuityManager` ensures **zero missed blocks**:

1. **Gap Detection**: Compares incoming block numbers with last processed block
2. **Automatic Backfill**: Fetches and processes all missed blocks via WebSocket
3. **Reconnection Handling**: On reconnect, backfills any blocks missed during downtime
4. **Sequential Processing**: Maintains strict block order even after gaps

Example logs:
```
block_continuity: gap detected, backfilling 3 blocks
block_continuity: starting backfill from 38475461 to 38475463
block_continuity: backfill complete
```

### Resilient WebSocket Pool

The `WsRpcPool` provides automatic failover across multiple WSS endpoints:

- **Built-in Endpoints**:
  - `wss://base.gateway.tenderly.co`
  - `wss://base.callstaticrpc.com`
  - `wss://base-rpc.publicnode.com`
  - `wss://base-mainnet.infura.io/ws/v3/YOUR_API_KEY`

- **Automatic Rotation**: Switches to next endpoint on errors, rate limits, or disconnections
- **Exponential Backoff**: Degraded endpoints are retried with increasing delays (5s → 5min)
- **Health Checks**: Background health monitoring recovers failed endpoints
- **Connection Persistence**: Maintains single active connection, recreates on failure

Example logs:
```
ws_manager: connected to wss://base.gateway.tenderly.co
ws_manager: endpoint failed, rotating to wss://base-rpc.publicnode.com
ws_manager: all endpoints temporarily unavailable, retrying in 10s
```

## Quick Start

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 8.0.0

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env

# Edit .env with your WebSocket RPC endpoint
```

### Configuration

Edit `.env`:

```env
# WebSocket RPC endpoint (required)
BASE_WSS_RPC_URL=wss://base-mainnet.infura.io/ws/v3/YOUR_API_KEY

# Transfer threshold in ETH
TRANSFER_THRESHOLD_ETH=100

# Logging level (debug, info, warn, error)
LOG_LEVEL=info
```

**Note**: The application includes 4 hardcoded fallback WSS endpoints, so even if your configured endpoint fails, the system will continue operating.

### Running

```bash
# Development mode (with auto-reload)
pnpm dev

# Or use the watch command
pnpm watch

# Demo mode (0.1 ETH threshold for testing)
pnpm watch --demo

# Custom threshold
pnpm watch --threshold 50

# Production build and run
pnpm build
pnpm start
```

## CLI Options

```bash
Options:
  -V, --version              output the version number
  -t, --threshold <number>   Override transfer threshold in ETH
  -d, --demo                 Run in demo mode with lower threshold (0.1 ETH)
  -h, --help                 display help for command
```

## Project Structure

```
src/
├── cli/                    # CLI components
│   ├── parser.ts          # Argument parsing
│   └── formatter.ts       # Colored console output
├── utils/                 # Utility functions
│   ├── address.ts         # Address normalization & matching
│   ├── threshold.ts       # Threshold comparison
│   ├── formatting.ts      # ETH/Wei conversions
│   └── event.ts           # Event building (DRY)
├── watcher/               # Transaction watchers
│   ├── pending.ts         # Mempool watcher
│   ├── blocks.ts          # Block watcher with continuity
│   └── blockContinuity.ts # Block gap detection & backfill
├── rpcPool.ts             # WebSocket pool manager with failover
├── clients.ts             # WebSocket client initialization
├── types.ts               # TypeScript types
├── config.ts              # Configuration loader
├── logger.ts              # Structured logging
├── errors.ts              # Custom error classes
└── index.ts               # Main entry point

config/
└── wallets.json           # Watched wallet addresses

tests/
└── *.test.ts             # Test files (90+ tests)
```

## Architecture Deep Dive

### WebSocket Pool Manager (`WsRpcPool`)

Manages a pool of WebSocket endpoints with:

- **Health Tracking**: Each endpoint has status (healthy/degraded/down)
- **Fail Counters**: Tracks consecutive failures per endpoint
- **Backoff Timers**: Exponential delay before retrying failed endpoints
- **Event Handlers**: Automatic reconnection on `close` or `error` events
- **Reconnection Callbacks**: Notifies watchers to re-subscribe after reconnect

### Block Continuity Manager

Ensures no blocks are missed:

```typescript
// Initialize at latest block
await continuityManager.initialize();

// Process new blocks (automatic gap detection)
await continuityManager.processNewBlock(newBlockNumber);

// On reconnection (automatic backfill)
await continuityManager.handleReconnection(newClient);
```

**Gap Detection Logic**:
- If `newBlock == lastProcessed + 1` → Normal, process block
- If `newBlock > lastProcessed + 1` → Gap detected, backfill missing blocks
- If `newBlock <= lastProcessed` → Duplicate/old block, skip

### Dependency Injection

Watchers receive dependencies explicitly:

```typescript
watchPendingTransactions(wsClient, config, seenTxHashes, onTransfer);
watchBlocks(wsClient, config, seenTxHashes, onTransfer);
```

### Utilities

Core logic extracted into pure functions:

- **Address Utils**: Normalization, watching, side detection
- **Threshold Utils**: ETH/Wei conversion, comparison
- **Event Utils**: Transaction processing, event building

### Error Handling

Custom error classes for different scenarios:

- `ConfigError`: Configuration issues
- `NetworkError`: RPC/network failures (triggers failover)
- `ValidationError`: Data validation failures

### Deduplication

Transactions seen in mempool are tracked and not logged again when confirmed:

1. Pending tx → logged, hash added to `seenTxHashes`
2. Confirmed tx → if hash in set, skip (already logged)

## Testing

Comprehensive test suite with 90+ tests:

- ✅ Address normalization (case-insensitive)
- ✅ Threshold comparisons (below, equal, above)
- ✅ Event building (watchedSide logic)
- ✅ Transaction filtering
- ✅ Config validation
- ✅ **Block continuity gap detection**
- ✅ **Block continuity backfill logic**
- ✅ **Block continuity reconnection handling**
- ✅ **Duplicate/old block handling**

Run tests:

```bash
pnpm test          # Run all tests
pnpm test:watch    # Watch mode
pnpm test:ui       # UI mode
pnpm test:coverage # Coverage report
```

## Resilience & Fault Tolerance

### Automatic Failover Scenarios

1. **Endpoint Disconnects**:
   - Detected via WebSocket `close` event
   - Rotates to next healthy endpoint
   - Re-subscribes to blocks and pending transactions
   - Backfills any missed blocks

2. **Rate Limiting**:
   - Detected by error messages (429, "rate limit", "quota")
   - Endpoint marked as degraded
   - Cooldown period with exponential backoff
   - Rotates to next endpoint immediately

3. **Network Errors**:
   - Connection refused, timeout, DNS failures
   - Endpoint marked as down
   - Retries with exponential backoff (5s → 10s → 20s → ... → 5min)
   - Background health checks attempt recovery

4. **All Endpoints Down**:
   - System waits for earliest `nextAvailableTime`
   - Logs: "all endpoints temporarily unavailable, retrying in Xs"
   - Never crashes, keeps retrying

### Block Continuity Guarantees

**During Normal Operation**:
- Blocks processed sequentially: 100 → 101 → 102 → ...
- Any gap triggers immediate backfill

**During Downtime/Reconnection**:
- Last processed block: 200
- After reconnect, latest block: 205
- System automatically fetches and processes blocks 201, 202, 203, 204, 205
- Seamless continuity restored

**Pending Transactions**:
- Cannot be backfilled (mempool-only)
- Re-subscribes on reconnect
- Logs: "pending tx stream resumed after reconnection"

## Demo Mode

For testing without waiting for real large transfers:

```bash
pnpm watch --demo
```

This:
- Reduces threshold to 0.1 ETH
- Shows warning banner
- Makes it easy to verify functionality with smaller amounts

## Output Example

```
╔═══════════════════════════════════════════════╗
║   BASE MAINNET LARGE TRANSFER MONITOR         ║
╚═══════════════════════════════════════════════╝

Network:         base-mainnet
Threshold:       100 ETH
Watched Wallets: 30
Demo Mode:       OFF

ws_manager: connected to wss://base.gateway.tenderly.co
block_continuity: initialized at latest block 38475460

✓ Monitoring active...

┌─────────────────────────────────────────────────────────┐
│ 🚨 [PENDING] LARGE TRANSFER DETECTED                    │
├─────────────────────────────────────────────────────────┤
│ Wallet:  Binance 1 (FROM)                               │
│ Tx:      0xabc123...def456                              │
│ From:    0xd551...92ff                                  │
│ To:      0x1234...5678                                  │
│ Value:   123.456 ETH                                    │
│ Block:   (pending)                                      │
│ Time:    2025-01-01T12:34:56.789Z                       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ ✅ [CONFIRMED] LARGE TRANSFER DETECTED                  │
├─────────────────────────────────────────────────────────┤
│ Wallet:  Binance 1 (FROM)                               │
│ Tx:      0xabc123...def456                              │
│ From:    0xd551...92ff                                  │
│ To:      0x1234...5678                                  │
│ Value:   123.456 ETH                                    │
│ Block:   38475461                                       │
│ Time:    2025-01-01T12:35:02.123Z                       │
└─────────────────────────────────────────────────────────┘

# If a gap is detected:
block_continuity: gap detected, backfilling 3 blocks
block_continuity: starting backfill from 38475462 to 38475464
block_continuity: backfill complete

# If endpoint fails:
ws_manager: endpoint failed, rotating to wss://base-rpc.publicnode.com
ws_manager: connected to wss://base-rpc.publicnode.com
block_continuity: checking for missed blocks after reconnection
block_continuity: no blocks missed during reconnection
```

## Development

### Scripts

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with UI
pnpm test:ui

# Coverage report
pnpm test:coverage

# Linting
pnpm lint
pnpm lint:fix

# Formatting
pnpm format
pnpm format:check

# Type checking
pnpm type-check
```

### Adding Watched Wallets

Edit `config/wallets.json`:

```json
[
  {
    "label": "Exchange Name",
    "address": "0x..."
  }
]
```

Addresses are automatically normalized to lowercase.

## Best Practices Implemented

- ✅ TypeScript strict mode
- ✅ WebSocket-only architecture (no HTTP)
- ✅ Block continuity guarantees (zero missed blocks)
- ✅ Automatic failover and reconnection
- ✅ Exponential backoff for rate limiting
- ✅ Health monitoring and recovery
- ✅ Small, focused functions
- ✅ DRY principles (no code duplication)
- ✅ Dependency injection
- ✅ Centralized utilities
- ✅ Custom error classes
- ✅ Comprehensive error handling
- ✅ Structured logging
- ✅ Input validation (Zod)
- ✅ Graceful shutdown
- ✅ 90+ test coverage
- ✅ ESLint + Prettier

## Monitored Exchanges

- Binance (13 wallets)
- Coinbase (6 wallets)
- MEXC (2 wallets)
- Bybit (1 wallet)
- OKX (1 wallet)
- KuCoin (4 wallets)
- HTX (1 wallet)
- Bitget (1 wallet)

## Performance & Reliability

- **Zero Missed Blocks**: Block continuity system ensures every block is processed
- **Automatic Recovery**: Failed endpoints recover via background health checks
- **No Single Point of Failure**: 4 fallback WSS endpoints
- **Efficient Resource Usage**: Single WebSocket connection (vs polling)
- **Low Latency**: Real-time WebSocket subscriptions
- **Production Ready**: Comprehensive error handling and logging

## License

MIT

## Contributing

Contributions welcome! Please:

1. Fork the repo
2. Create a feature branch
3. Add tests for new features
4. Run `pnpm lint && pnpm test`
5. Submit a pull request

## Changelog

### v2.0.0 - WebSocket-Only Architecture

- **Breaking**: Removed all HTTP RPC clients
- **New**: WebSocket-only architecture with automatic failover
- **New**: Block continuity manager (guarantees zero missed blocks)
- **New**: Resilient WebSocket pool with multiple fallback endpoints
- **New**: Automatic gap detection and backfill
- **New**: Exponential backoff for rate limiting
- **New**: Background health checks and endpoint recovery
- **New**: 90+ comprehensive tests including block continuity tests
- **Improved**: Enhanced logging for failover and continuity events
