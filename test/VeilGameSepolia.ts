import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, deployments } from "hardhat";
import { VeilGame } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  alice: HardhatEthersSigner;
};

describe("VeilGameSepolia", function () {
  let signers: Signers;
  let veilGame: VeilGame;
  let veilGameAddress: string;

  before(async function () {
    if (fhevm.isMock) {
      console.warn(`This hardhat test suite can only run on Sepolia Testnet`);
      this.skip();
    }

    try {
      const deployment = await deployments.get("VeilGame");
      veilGameAddress = deployment.address;
      veilGame = await ethers.getContractAt("VeilGame", deployment.address);
    } catch (e) {
      (e as Error).message += ". Call 'npx hardhat deploy --network sepolia'";
      throw e;
    }

    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { alice: ethSigners[0] };
  });

  it("joins if needed and spends on a build", async function () {
    this.timeout(4 * 40000);

    const joined = await veilGame.isJoined(signers.alice.address);
    if (!joined) {
      const joinTx = await veilGame.connect(signers.alice).joinGame();
      await joinTx.wait();
    }

    const encryptedBalanceBefore = await veilGame.getBalance(signers.alice.address);
    const clearBalanceBefore = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      encryptedBalanceBefore,
      veilGameAddress,
      signers.alice,
    );
    const balanceBefore = BigInt(clearBalanceBefore);

    await fhevm.initializeCLIApi();
    const encryptedInput = await fhevm
      .createEncryptedInput(veilGameAddress, signers.alice.address)
      .add8(1)
      .encrypt();

    const buildTx = await veilGame
      .connect(signers.alice)
      .build(0, encryptedInput.handles[0], encryptedInput.inputProof);
    await buildTx.wait();

    const encryptedBalanceAfter = await veilGame.getBalance(signers.alice.address);
    const clearBalanceAfter = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      encryptedBalanceAfter,
      veilGameAddress,
      signers.alice,
    );
    const balanceAfter = BigInt(clearBalanceAfter);

    if (balanceBefore >= 100n) {
      expect(balanceAfter).to.eq(balanceBefore - 100n);

      const encryptedTile = await veilGame.getTile(signers.alice.address, 0);
      const clearTile = await fhevm.userDecryptEuint(
        FhevmType.euint8,
        encryptedTile,
        veilGameAddress,
        signers.alice,
      );
      expect(clearTile).to.eq(1);
    } else {
      expect(balanceAfter).to.eq(balanceBefore);
    }
  });
});
