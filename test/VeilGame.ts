import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { VeilGame, VeilGame__factory } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("VeilGame")) as VeilGame__factory;
  const veilGame = (await factory.deploy()) as VeilGame;
  const veilGameAddress = await veilGame.getAddress();

  return { veilGame, veilGameAddress };
}

describe("VeilGame", function () {
  let signers: Signers;
  let veilGame: VeilGame;
  let veilGameAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ veilGame, veilGameAddress } = await deployFixture());
  });

  it("joins with a starting balance and empty tiles", async function () {
    await (await veilGame.connect(signers.alice).joinGame()).wait();

    const encryptedBalance = await veilGame.getBalance(signers.alice.address);
    const clearBalance = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      encryptedBalance,
      veilGameAddress,
      signers.alice,
    );
    expect(clearBalance).to.eq(10000);

    const encryptedTile = await veilGame.getTile(signers.alice.address, 0);
    const clearTile = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      encryptedTile,
      veilGameAddress,
      signers.alice,
    );
    expect(clearTile).to.eq(0);
  });

  it("builds with encrypted input and deducts balance", async function () {
    await (await veilGame.connect(signers.alice).joinGame()).wait();

    const encryptedInput = await fhevm
      .createEncryptedInput(veilGameAddress, signers.alice.address)
      .add8(3)
      .encrypt();

    await (await veilGame.connect(signers.alice).build(2, encryptedInput.handles[0], encryptedInput.inputProof)).wait();

    const encryptedTile = await veilGame.getTile(signers.alice.address, 2);
    const clearTile = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      encryptedTile,
      veilGameAddress,
      signers.alice,
    );
    expect(clearTile).to.eq(3);

    const encryptedBalance = await veilGame.getBalance(signers.alice.address);
    const clearBalance = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      encryptedBalance,
      veilGameAddress,
      signers.alice,
    );
    expect(clearBalance).to.eq(9600);
  });

  it("ignores invalid building types", async function () {
    await (await veilGame.connect(signers.alice).joinGame()).wait();

    const encryptedInput = await fhevm
      .createEncryptedInput(veilGameAddress, signers.alice.address)
      .add8(9)
      .encrypt();

    await (await veilGame.connect(signers.alice).build(1, encryptedInput.handles[0], encryptedInput.inputProof)).wait();

    const encryptedTile = await veilGame.getTile(signers.alice.address, 1);
    const clearTile = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      encryptedTile,
      veilGameAddress,
      signers.alice,
    );
    expect(clearTile).to.eq(0);

    const encryptedBalance = await veilGame.getBalance(signers.alice.address);
    const clearBalance = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      encryptedBalance,
      veilGameAddress,
      signers.alice,
    );
    expect(clearBalance).to.eq(10000);
  });
});
