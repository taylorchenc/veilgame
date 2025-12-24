# VeilGame

VeilGame is a fully onchain strategy builder that keeps player choices private using Zama FHEVM. Players join to mint an
encrypted coin balance, then place encrypted building types on a 3x3 territory map. Only the player can decrypt the
chosen buildings and balances, while everyone else sees encrypted state.

## Project Summary

VeilGame demonstrates how confidential gameplay works on public chains. The contract stores balances and tile states as
encrypted values and only allows the player and the contract to operate on them. The frontend uses Zama's relayer SDK to
encrypt inputs and decrypt outputs client-side, so strategy remains hidden without sacrificing onchain verifiability.

## Problems Solved

- Strategy privacy on public chains: opponents cannot see your build choices or spending.
- Fair play: no front-running of hidden decisions because the building type is encrypted on-chain.
- Transparent logic: costs and rules are public and deterministic, but the sensitive inputs stay sealed.
- Trust minimization: no offchain server stores player secrets or balances.

## Advantages

- Confidential state with FHE: balances and tiles are encrypted at rest on-chain.
- Deterministic economics: costs are fixed and enforced inside the contract logic.
- Player-controlled revelation: only the player can decrypt balances and tiles.
- Simple, auditable rule set: small contract surface and explicit state transitions.
- Clear separation of concerns: smart contract enforces rules, frontend handles encryption and UX.

## Gameplay Mechanics

- Map size: 3x3 grid (9 tiles), indexed 0 to 8 in the contract and 1 to 9 in the UI.
- Starting balance: 10,000 encrypted coins per player upon joining.
- Building types (encrypted input):
  - Type 1: 100 coins
  - Type 2: 200 coins
  - Type 3: 400 coins
  - Type 4: 1,000 coins
- Invalid type or insufficient balance: the build is ignored and the encrypted state remains unchanged.
- Decryption: balances and tiles can be decrypted by the player in the frontend or via Hardhat tasks.

## Smart Contract Overview

Contract: `contracts/VeilGame.sol`

Constants:
- `STARTING_BALANCE = 10000`
- `MAP_SIZE = 9`

State:
- Per-player encrypted balance (`euint32`)
- Per-player encrypted tiles (`euint8[9]`)
- Join flag

External functions:
- `joinGame()` - marks the player as joined, mints encrypted balance, initializes tiles.
- `build(uint8 tileIndex, externalEuint8 buildingType, bytes inputProof)` - encrypted build.
- `isJoined(address player) view` - returns join state.
- `getBalance(address player) view` - returns encrypted balance handle.
- `getTile(address player, uint8 tileIndex) view` - returns encrypted tile handle.

Events:
- `PlayerJoined(address player)`
- `BuildingPlaced(address player, uint8 tileIndex)`

Encrypted build logic:
- Building type is provided as encrypted input plus proof.
- Cost is computed using FHE comparisons.
- Balance and tile updates use `FHE.select` so the write only happens when inputs are valid and affordable.

## Privacy Model

1. The player connects a wallet in the UI.
2. The frontend encrypts the building type with Zama relayer SDK.
3. The encrypted input and proof are sent to `build`.
4. The contract stores encrypted results and allows access for the player.
5. The frontend decrypts balances or tiles using the player's wallet signature.

All decryptions are performed client-side. No encrypted values are stored in local storage and no frontend environment
variables are used.

## Frontend Overview

Location: `app/`

Key behaviors:
- Reads use `viem` via `wagmi` hooks.
- Writes use `ethers` with an injected wallet signer.
- Encryption and decryption use `@zama-fhe/relayer-sdk`.
- Network is Sepolia (no localhost network usage in the UI).

Frontend configuration:
- Update `app/src/config/contracts.ts` with the deployed contract address and ABI.
- Set the WalletConnect project id in `app/src/config/wagmi.ts`.
- The ABI must be copied from `deployments/sepolia/VeilGame.json`.

User flows:
- Join game: mints encrypted balance and initializes tiles.
- Build: selects a tile and encrypts the chosen building type.
- Decrypt balance: reveals the player's balance locally.
- Decrypt tile: reveals the chosen building on a specific tile.

## Repository Layout

- `contracts/` Solidity smart contracts
- `deploy/` Hardhat deployment scripts
- `tasks/` Hardhat CLI tasks for joining/building/decrypting
- `test/` Test suites (local mock and Sepolia)
- `app/` React + Vite frontend
- `docs/` Zama FHEVM reference docs

## Prerequisites

- Node.js 20+
- npm
- A Sepolia RPC key (Infura)
- A funded Sepolia account private key for deployment

## Install Dependencies

Root (contracts + tasks):

```bash
npm install
```

Frontend:

```bash
cd app
npm install
```

## Environment Variables (Hardhat Only)

Create a `.env` in the project root:

```bash
INFURA_API_KEY=your_infura_key
PRIVATE_KEY=your_private_key
ETHERSCAN_API_KEY=optional_for_verification
REPORT_GAS=true_or_false
```

No frontend environment variables are used.

## Local Development Workflow

1. Compile and run local tests:

   ```bash
   npm run compile
   npm run test
   ```

2. Start a local node and deploy:

   ```bash
   npx hardhat node
   npx hardhat deploy --network localhost
   ```

3. Use tasks to play locally:

   ```bash
   npx hardhat task:join --network localhost
   npx hardhat task:build --network localhost --tile 4 --type 2
   npx hardhat task:decrypt-balance --network localhost
   npx hardhat task:decrypt-tile --network localhost --tile 4
   ```

## Sepolia Deployment Workflow

1. Deploy to Sepolia:

   ```bash
   npx hardhat deploy --network sepolia
   ```

2. Optional verification:

   ```bash
   npx hardhat verify --network sepolia <DEPLOYED_ADDRESS>
   ```

3. Run the Sepolia test:

   ```bash
   npx hardhat test --network sepolia
   ```

4. Update the frontend:
   - Copy the ABI from `deployments/sepolia/VeilGame.json` into `app/src/config/contracts.ts`.
   - Set the deployed address in `app/src/config/contracts.ts`.
   - Set the WalletConnect project id in `app/src/config/wagmi.ts`.

## Hardhat Tasks

- `task:address` - print the deployed contract address.
- `task:join` - call `joinGame`.
- `task:build` - build with encrypted input (`--tile`, `--type`).
- `task:decrypt-balance` - decrypt and print encrypted balance.
- `task:decrypt-tile` - decrypt and print a tile (`--tile`).

## Testing

- `test/VeilGame.ts` runs against the local FHE mock.
- `test/VeilGameSepolia.ts` runs against Sepolia after deployment.

## Limitations

- Single-player state per wallet; no cross-player interactions yet.
- Fixed 3x3 map and fixed cost table.
- No upgrades, unit production, or resource generation beyond starting coins.
- No competitive mechanics, battles, or matchmaking.
- No offchain indexer; UI reads directly from the chain.

## Future Plans

- Larger map sizes and map upgrades.
- Additional building types and dynamic pricing.
- Player-to-player interactions (alliances, raids, and trading).
- Seasonal rule sets with configurable starting balances and costs.
- Event indexing and analytics for faster UI updates.
- Better gas profiling and optimization of encrypted operations.
- Multi-chain deployments as FHEVM networks expand.

## License

BSD-3-Clause-Clear. See `LICENSE`.
