# RevShare - NFT Fractionalization with Revenue Distribution

## Overview

RevShare is an Ethereum-based decentralized application that tokenizes income-generating assets as NFTs, fractionalizes them into ERC-20 tokens, and automatically distributes operational revenue to token holders. The platform implements a dual-revenue model that separates initial token sale proceeds from ongoing operational income.

**Core Purpose**: Demonstrate blockchain-based automated revenue distribution for real-world assets (RWA) on Ethereum Sepolia testnet.

**Key Features**:
- Asset tokenization as ERC-721 NFTs
- Fractionalization into ERC-20 tokens
- Automated revenue distribution using pull pattern
- Optional Chainlink oracle integration for asset verification and revenue automation

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack**:
- React with TypeScript
- Vite for build tooling
- TanStack Query for server state management
- Wouter for client-side routing
- Ethers.js v6 for blockchain interactions
- Shadcn/ui components with Tailwind CSS

**Design Patterns**:
- Component-based architecture with clear separation of concerns
- Custom hooks for blockchain operations (wallet connection, contract interactions)
- Error boundaries for graceful error handling
- Theme context for dark/light mode support

**Key Components**:
- MetaMask integration for wallet connectivity
- Transaction status tracking with toast notifications
- Responsive UI for asset management (create, view, fractionalize, trade)
- Real-time blockchain data display with caching

### Backend Architecture

**Technology Stack**:
- Express.js server
- Drizzle ORM with PostgreSQL (Neon serverless)
- WebSocket provider for blockchain event listening

**Purpose**: Performance optimization layer, NOT authoritative data source

**Design Principle**: The backend is a stateless cache that auto-recovers from blockchain on restart. The blockchain remains the single source of truth.

**Indexer Pattern**:
- Listens to smart contract events (NFT minting, token creation, revenue distribution)
- Caches data in PostgreSQL for fast queries (100ms vs 2-3s from blockchain)
- Automatically rebuilds state from on-chain events on server restart
- No business logic - pure data transformation and caching

**Benefits**:
- Fast API responses for better UX
- Reduces RPC calls to blockchain
- No trust assumptions - all data verifiable on-chain

### Smart Contract Architecture

**Contract Suite**:

1. **RevenueAssetNFT** (ERC-721)
   - Represents ownership and control of revenue-generating assets
   - Stores asset metadata (name, type, description, estimated value)
   - Tracks fractionalization status
   - Links to corresponding ERC-20 token contract

2. **RevenueTokenFactory**
   - Factory pattern for creating ERC-20 token contracts
   - One token contract per fractionalized NFT
   - Maintains bidirectional mapping (NFT ↔ Token)
   - Enforces one-time fractionalization per NFT

3. **RevenueTokenV2** (ERC-20)
   - Fractional ownership tokens
   - Implements dual-revenue model:
     - **Initial sale revenue**: Sent to NFT creator on token purchase
     - **Operating revenue**: Distributed proportionally to all token holders
   - Pull pattern for revenue distribution (gas-efficient)
   - Holders call `withdrawRevenue()` to claim their share

4. **RevenueAssetNFT_Oracle** (Optional)
   - Enhanced NFT contract with Chainlink Functions integration
   - Verifies asset ownership before minting using external APIs
   - Supports Spotify songs, USPTO patents, GPU hardware, custom assets

5. **RevenueTokenV2_Oracle** (Optional)
   - Enhanced token contract with Chainlink Automation
   - Automatically fetches revenue data from external sources
   - Configurable update intervals
   - Maintains backward compatibility with standard RevenueTokenV2

**Key Design Decisions**:

- **Pull Pattern Revenue Distribution**: Chose pull over push to avoid gas limit issues when distributing to many holders. Each holder independently withdraws their share.

- **Factory Pattern**: Ensures standardized token deployment and maintains registry for lookup operations.

- **Dual Revenue Streams**: Separates initial token sale proceeds (goes to creator) from operational revenue (distributed to holders). This prevents dilution of creator's initial funding while ensuring holders benefit from ongoing income.

- **Oracle Integration as Optional Layer**: Base contracts work without oracles. Oracle variants add verification and automation but maintain compatibility with standard versions.

**Trust Model**:
- In standard mode: Asset owners manually report revenue by calling `recordOperatingRevenue()` with ETH. This creates a trust assumption.
- In oracle mode: Revenue data fetched from external APIs, but still requires honest API integration and Chainlink DON trust.
- Future improvement: Consider multi-oracle aggregation or on-chain verification mechanisms.

### Data Storage

**PostgreSQL Database** (via Neon serverless):
- **Purpose**: Cache layer for performance optimization
- **Tables**:
  - `revenue_assets`: NFT metadata, fractionalization status, revenue totals
  - `token_holders`: Token ownership records
  - `revenue_distributions`: Distribution event history

**Trust Model**: Database is NOT authoritative. All critical data verifiable on-chain through smart contract view functions.

**Recovery**: On server restart, indexer scans blockchain events from genesis block and rebuilds database state.

## External Dependencies

### Blockchain Infrastructure

**Network**: Ethereum Sepolia Testnet
- RPC Provider: Public endpoints (ethereum-sepolia-rpc.publicnode.com)
- WebSocket support for event listening
- Fallback to HTTP polling if WebSocket unavailable

**Deployed Contracts** (Sepolia):
- RevenueAssetNFT: `0xbc6a1736772386109D764E17d1080Fb76cCc4c48`
- RevenueTokenFactory: `0x58d6417535ae4F6EeA529850458ceF810D0ADbdf`
- RevenueTokenOracleFactory: `0x639ACBe3c067840aeD22cf1F9DCab0F78CF7e848`

### Chainlink Oracle Services (Optional)

**Chainlink Functions Router** (Sepolia): `0xb83E47C2bC239B3bf370bc41e1459A34b41238D0`

**Use Cases**:
- Asset ownership verification (Spotify, Patent, GPU)
- Automated revenue data fetching

**Operating Modes**:
- **Test Mode**: Uses public mock APIs (JSONPlaceholder, PublicAPIs) - no API keys required
- **Production Mode**: Integrates with real APIs (Spotify Web API, USPTO API, GPU marketplaces) - requires API credentials

**Cost Considerations**: Oracle integration requires LINK tokens (~0.1-0.5 LINK per request). For course demonstration, test mode is recommended.

**Configuration**: DON Secrets store API keys and environment variables (ENVIRONMENT=test|production)

### Third-Party APIs (Production Mode Only)

**Spotify Web API**:
- Purpose: Verify song ownership, fetch streaming revenue
- Authentication: OAuth 2.0 with Client ID/Secret
- Rate Limits: Standard tier limits apply

**USPTO Patent API**:
- Purpose: Verify patent ownership
- Authentication: API key
- Free tier with rate limits

**GPU Marketplace APIs** (Various):
- Examples: Vast.ai, RunPod, Lambda Labs
- Purpose: Verify hardware ownership, fetch rental revenue
- Authentication: Platform-specific API keys

### Database

**Neon Serverless PostgreSQL**:
- Connection pooling via `@neondatabase/serverless`
- WebSocket-based protocol for serverless environments
- Environment variable: `DATABASE_URL`

### UI Component Libraries

- Radix UI primitives (headless components)
- Shadcn/ui (styled components)
- Tailwind CSS for styling
- Custom theme system with CSS variables

### Build & Development Tools

- Vite for frontend bundling
- TypeScript for type safety
- Drizzle Kit for database migrations
- ESBuild for backend bundling
- Replit-specific plugins for development environment integration
