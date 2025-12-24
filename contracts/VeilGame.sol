// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint8, euint32, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title VeilGame
/// @notice Confidential builder game with encrypted balances and map tiles.
contract VeilGame is ZamaEthereumConfig {
    uint32 public constant STARTING_BALANCE = 10000;
    uint8 public constant MAP_SIZE = 9;

    struct PlayerState {
        bool joined;
        euint32 balance;
        euint8[MAP_SIZE] tiles;
    }

    mapping(address => PlayerState) private _players;

    event PlayerJoined(address indexed player);
    event BuildingPlaced(address indexed player, uint8 indexed tileIndex);

    /// @notice Join the game and receive the encrypted starting balance.
    function joinGame() external {
        PlayerState storage player = _players[msg.sender];
        require(!player.joined, "Already joined");

        player.joined = true;
        player.balance = FHE.asEuint32(STARTING_BALANCE);

        for (uint8 i = 0; i < MAP_SIZE; i++) {
            player.tiles[i] = FHE.asEuint8(0);
            FHE.allowThis(player.tiles[i]);
            FHE.allow(player.tiles[i], msg.sender);
        }

        FHE.allowThis(player.balance);
        FHE.allow(player.balance, msg.sender);

        emit PlayerJoined(msg.sender);
    }

    /// @notice Place a building on a tile using an encrypted building type.
    /// @param tileIndex Tile index from 0 to 8.
    /// @param buildingType Encrypted building type (1-4).
    /// @param inputProof Proof for the encrypted input.
    function build(uint8 tileIndex, externalEuint8 buildingType, bytes calldata inputProof) external {
        require(_players[msg.sender].joined, "Join first");
        require(tileIndex < MAP_SIZE, "Invalid tile");

        PlayerState storage player = _players[msg.sender];
        euint8 chosenType = FHE.fromExternal(buildingType, inputProof);

        euint32 cost = _buildingCost(chosenType);
        ebool hasCost = FHE.ne(cost, 0);
        ebool canAfford = FHE.ge(player.balance, cost);
        ebool shouldBuild = FHE.and(hasCost, canAfford);

        player.balance = FHE.select(shouldBuild, FHE.sub(player.balance, cost), player.balance);
        player.tiles[tileIndex] = FHE.select(shouldBuild, chosenType, player.tiles[tileIndex]);

        FHE.allowThis(player.balance);
        FHE.allow(player.balance, msg.sender);
        FHE.allowThis(player.tiles[tileIndex]);
        FHE.allow(player.tiles[tileIndex], msg.sender);

        emit BuildingPlaced(msg.sender, tileIndex);
    }

    /// @notice Returns whether a player has joined.
    function isJoined(address player) external view returns (bool) {
        return _players[player].joined;
    }

    /// @notice Returns the encrypted balance for a player.
    function getBalance(address player) external view returns (euint32) {
        return _players[player].balance;
    }

    /// @notice Returns the encrypted building type at a tile.
    function getTile(address player, uint8 tileIndex) external view returns (euint8) {
        require(tileIndex < MAP_SIZE, "Invalid tile");
        return _players[player].tiles[tileIndex];
    }

    function _buildingCost(euint8 buildingType) internal returns (euint32) {
        euint32 cost = FHE.asEuint32(0);
        cost = FHE.select(FHE.eq(buildingType, 1), FHE.asEuint32(100), cost);
        cost = FHE.select(FHE.eq(buildingType, 2), FHE.asEuint32(200), cost);
        cost = FHE.select(FHE.eq(buildingType, 3), FHE.asEuint32(400), cost);
        cost = FHE.select(FHE.eq(buildingType, 4), FHE.asEuint32(1000), cost);
        return cost;
    }
}
