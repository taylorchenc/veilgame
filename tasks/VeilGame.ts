import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

/**
 * Local usage:
 *   npx hardhat node
 *   npx hardhat --network localhost deploy
 *   npx hardhat --network localhost task:join
 *   npx hardhat --network localhost task:build --tile 4 --type 2
 *   npx hardhat --network localhost task:decrypt-balance
 *   npx hardhat --network localhost task:decrypt-tile --tile 4
 */

task("task:address", "Prints the VeilGame address").setAction(async function (_taskArguments: TaskArguments, hre) {
  const { deployments } = hre;
  const veilGame = await deployments.get("VeilGame");
  console.log("VeilGame address is " + veilGame.address);
});

task("task:join", "Calls joinGame() on VeilGame")
  .addOptionalParam("address", "Optionally specify the VeilGame contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("VeilGame");
    const signers = await ethers.getSigners();
    const veilGame = await ethers.getContractAt("VeilGame", deployment.address);

    const tx = await veilGame.connect(signers[0]).joinGame();
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

task("task:build", "Place an encrypted building on a tile")
  .addOptionalParam("address", "Optionally specify the VeilGame contract address")
  .addParam("tile", "Tile index 0-8")
  .addParam("type", "Building type 1-4")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    const tileIndex = parseInt(taskArguments.tile);
    const buildingType = parseInt(taskArguments.type);
    if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex > 8) {
      throw new Error(`Argument --tile must be 0-8`);
    }
    if (!Number.isInteger(buildingType) || buildingType < 1 || buildingType > 4) {
      throw new Error(`Argument --type must be 1-4`);
    }

    await fhevm.initializeCLIApi();

    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("VeilGame");
    const signers = await ethers.getSigners();
    const veilGame = await ethers.getContractAt("VeilGame", deployment.address);

    const encryptedInput = await fhevm
      .createEncryptedInput(deployment.address, signers[0].address)
      .add8(buildingType)
      .encrypt();

    const tx = await veilGame
      .connect(signers[0])
      .build(tileIndex, encryptedInput.handles[0], encryptedInput.inputProof);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

task("task:decrypt-balance", "Decrypt the caller balance from VeilGame")
  .addOptionalParam("address", "Optionally specify the VeilGame contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("VeilGame");
    const signers = await ethers.getSigners();
    const veilGame = await ethers.getContractAt("VeilGame", deployment.address);

    const encryptedBalance = await veilGame.getBalance(signers[0].address);
    if (encryptedBalance === ethers.ZeroHash) {
      console.log(`encrypted balance: ${encryptedBalance}`);
      console.log("clear balance    : 0");
      return;
    }

    const clearBalance = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      encryptedBalance,
      deployment.address,
      signers[0],
    );
    console.log(`Encrypted balance: ${encryptedBalance}`);
    console.log(`Clear balance    : ${clearBalance}`);
  });

task("task:decrypt-tile", "Decrypt a tile value from VeilGame")
  .addOptionalParam("address", "Optionally specify the VeilGame contract address")
  .addParam("tile", "Tile index 0-8")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    const tileIndex = parseInt(taskArguments.tile);
    if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex > 8) {
      throw new Error(`Argument --tile must be 0-8`);
    }

    await fhevm.initializeCLIApi();

    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("VeilGame");
    const signers = await ethers.getSigners();
    const veilGame = await ethers.getContractAt("VeilGame", deployment.address);

    const encryptedTile = await veilGame.getTile(signers[0].address, tileIndex);
    if (encryptedTile === ethers.ZeroHash) {
      console.log(`encrypted tile: ${encryptedTile}`);
      console.log("clear tile    : 0");
      return;
    }

    const clearTile = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      encryptedTile,
      deployment.address,
      signers[0],
    );
    console.log(`Encrypted tile: ${encryptedTile}`);
    console.log(`Clear tile    : ${clearTile}`);
  });
