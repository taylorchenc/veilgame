import { useEffect, useMemo, useState } from "react";
import { Contract } from "ethers";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { zeroHash } from "viem";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../config/contracts";
import { useZamaInstance } from "../hooks/useZamaInstance";
import { useEthersSigner } from "../hooks/useEthersSigner";
import { Header } from "./Header";
import "../styles/GameApp.css";

const BUILDINGS = [
  {
    id: 1,
    name: "Lookout Post",
    cost: 100,
    detail: "Low cost scout tower for early control.",
  },
  {
    id: 2,
    name: "Workshop",
    cost: 200,
    detail: "Boosts crafting and supply pacing.",
  },
  {
    id: 3,
    name: "Barracks",
    cost: 400,
    detail: "Trains units and reinforces territory.",
  },
  {
    id: 4,
    name: "Citadel",
    cost: 1000,
    detail: "Heavy defense and late game anchor.",
  },
] as const;

const TILE_COUNT = 9;

const parseDecryptedValue = (value: unknown) => {
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return Number(value);
  }
  return 0;
};

export function GameApp() {
  const { address, isConnected } = useAccount();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();
  const signerPromise = useEthersSigner();
  const isContractConfigured =
    true;

  const [selectedTile, setSelectedTile] = useState(0);
  const [selectedBuilding, setSelectedBuilding] = useState(1);
  const [clearBalance, setClearBalance] = useState<number | null>(null);
  const [decryptedTiles, setDecryptedTiles] = useState<Record<number, number>>({});
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [isJoining, setIsJoining] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isDecryptingBalance, setIsDecryptingBalance] = useState(false);
  const [isDecryptingTile, setIsDecryptingTile] = useState(false);

  useEffect(() => {
    setClearBalance(null);
    setDecryptedTiles({});
    setStatusMessage("");
  }, [address, isContractConfigured]);

  const { data: joinedData } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "isJoined",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && isContractConfigured,
    },
  });

  const isJoined = Boolean(joinedData);

  const {
    data: balanceData,
    refetch: refetchBalance,
  } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getBalance",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && isContractConfigured,
    },
  });

  const tileContracts = useMemo(() => {
    if (!address) {
      return [];
    }
    if (!isContractConfigured) {
      return [];
    }
    return Array.from({ length: TILE_COUNT }, (_, index) => ({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "getTile",
      args: [address, index],
    }));
  }, [address]);

  const {
    data: tileData,
    refetch: refetchTiles,
  } = useReadContracts({
    contracts: tileContracts,
    allowFailure: true,
    query: {
      enabled: tileContracts.length > 0,
    },
  });

  const tileHandles = useMemo(() => {
    if (!tileData) {
      return [];
    }
    const results = tileData as Array<{ status: "success" | "failure"; result?: unknown } | null>;
    return results.map((entry) => {
      if (!entry || entry.status !== "success") {
        return undefined;
      }
      return entry.result as string;
    });
  }, [tileData]);

  const selectedTileHandle = tileHandles[selectedTile];

  const decryptHandles = async (handles: string[]) => {
    if (!instance || !address || !signerPromise) {
      throw new Error("Missing wallet or encryption service");
    }

    const keypair = instance.generateKeypair();
    const handleContractPairs = handles.map((handle) => ({
      handle,
      contractAddress: CONTRACT_ADDRESS,
    }));

    const startTimeStamp = Math.floor(Date.now() / 1000).toString();
    const durationDays = "10";
    const contractAddresses = [CONTRACT_ADDRESS];
    const eip712 = instance.createEIP712(
      keypair.publicKey,
      contractAddresses,
      startTimeStamp,
      durationDays,
    );

    const signer = await signerPromise;
    if (!signer) {
      throw new Error("Signer not available");
    }

    const signature = await signer.signTypedData(
      eip712.domain,
      {
        UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
      },
      eip712.message,
    );

    return instance.userDecrypt(
      handleContractPairs,
      keypair.privateKey,
      keypair.publicKey,
      signature.replace("0x", ""),
      contractAddresses,
      address,
      startTimeStamp,
      durationDays,
    );
  };

  const handleJoin = async () => {
    if (!isContractConfigured) {
      setStatusMessage("Set the contract address before joining.");
      return;
    }
    if (!address || !signerPromise) {
      setStatusMessage("Connect your wallet to join.");
      return;
    }

    setIsJoining(true);
    setStatusMessage("");
    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error("Signer not available");
      }
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.joinGame();
      await tx.wait();
      await refetchBalance();
      await refetchTiles();
      setStatusMessage("Joined the game and minted encrypted coins.");
    } catch (error) {
      console.error(error);
      setStatusMessage("Failed to join. Please try again.");
    } finally {
      setIsJoining(false);
    }
  };

  const handleBuild = async () => {
    if (!isContractConfigured) {
      setStatusMessage("Set the contract address before building.");
      return;
    }
    if (!instance || !address || !signerPromise) {
      setStatusMessage("Connect your wallet and wait for encryption setup.");
      return;
    }

    setIsBuilding(true);
    setStatusMessage("");
    try {
      const input = instance.createEncryptedInput(CONTRACT_ADDRESS, address);
      input.add8(BigInt(selectedBuilding));
      const encryptedInput = await input.encrypt();

      const signer = await signerPromise;
      if (!signer) {
        throw new Error("Signer not available");
      }
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.build(
        selectedTile,
        encryptedInput.handles[0],
        encryptedInput.inputProof,
      );
      await tx.wait();
      await refetchBalance();
      await refetchTiles();
      setStatusMessage("Build submitted. Decrypt tiles to reveal the choice.");
    } catch (error) {
      console.error(error);
      setStatusMessage("Build failed. Check your balance and try again.");
    } finally {
      setIsBuilding(false);
    }
  };

  const handleDecryptBalance = async () => {
    if (!isContractConfigured) {
      setStatusMessage("Set the contract address before decrypting.");
      return;
    }
    if (!balanceData || balanceData === zeroHash) {
      setStatusMessage("No encrypted balance to decrypt.");
      return;
    }

    setIsDecryptingBalance(true);
    setStatusMessage("");
    try {
      const result = await decryptHandles([balanceData as string]);
      const decryptedValue = parseDecryptedValue(result[balanceData as string]);
      setClearBalance(decryptedValue);
      setStatusMessage("Balance decrypted.");
    } catch (error) {
      console.error(error);
      setStatusMessage("Balance decryption failed.");
    } finally {
      setIsDecryptingBalance(false);
    }
  };

  const handleDecryptTile = async () => {
    if (!isContractConfigured) {
      setStatusMessage("Set the contract address before decrypting.");
      return;
    }
    if (!selectedTileHandle || selectedTileHandle === zeroHash) {
      setStatusMessage("No encrypted tile to decrypt.");
      return;
    }

    setIsDecryptingTile(true);
    setStatusMessage("");
    try {
      const result = await decryptHandles([selectedTileHandle]);
      const decryptedValue = parseDecryptedValue(result[selectedTileHandle]);
      setDecryptedTiles((prev) => ({
        ...prev,
        [selectedTile]: decryptedValue,
      }));
      setStatusMessage("Tile decrypted.");
    } catch (error) {
      console.error(error);
      setStatusMessage("Tile decryption failed.");
    } finally {
      setIsDecryptingTile(false);
    }
  };

  return (
    <div className="game-shell">
      <Header />
      <main className="game-main">
        <section className="hero">
          <div className="hero-content">
            <p className="hero-kicker">Encrypted territory builder</p>
            <h2 className="hero-title">Shape a 3 by 3 domain without revealing your plan.</h2>
            <p className="hero-subtitle">
              Join to mint encrypted coins, select a building, and decrypt the result only when you
              decide. All choices stay sealed until you unlock them.
            </p>
          </div>
          <div className="hero-card">
            <div className="hero-card-row">
              <span className="hero-label">Status</span>
              <span className="hero-value">{isConnected ? "Wallet connected" : "Connect to begin"}</span>
            </div>
            <div className="hero-card-row">
              <span className="hero-label">Player</span>
              <span className="hero-value">{isJoined ? "Joined" : "Not joined"}</span>
            </div>
            <div className="hero-card-row">
              <span className="hero-label">Encrypted coins</span>
              <span className="hero-value">
                {clearBalance !== null ? clearBalance : "Encrypted"}
              </span>
            </div>
            <div className="hero-actions">
              <button
                className="primary-button"
                onClick={handleJoin}
                disabled={!isConnected || isJoining || isJoined || !isContractConfigured}
              >
                {isJoined ? "Joined" : isJoining ? "Joining..." : "Join game"}
              </button>
              <button
                className="ghost-button"
                onClick={handleDecryptBalance}
                disabled={!isJoined || isDecryptingBalance || !isContractConfigured}
              >
                {isDecryptingBalance ? "Decrypting..." : "Decrypt balance"}
              </button>
            </div>
            {!isContractConfigured && (
              <p className="hint warning">Contract address is not configured.</p>
            )}
            {zamaLoading && <p className="hint">Loading encryption service...</p>}
            {zamaError && <p className="hint warning">{zamaError}</p>}
          </div>
        </section>

        <section className="play-grid">
          <div className="panel map-panel">
            <div className="panel-header">
              <div>
                <h3>Territory map</h3>
                <p className="panel-subtitle">Click a tile to target your build.</p>
              </div>
              <div className="panel-chip">Selected: {selectedTile + 1}</div>
            </div>
            <div className="tile-grid">
              {Array.from({ length: TILE_COUNT }, (_, index) => {
                const decryptedValue = decryptedTiles[index];
                const isActive = index === selectedTile;
                const label =
                  decryptedValue !== undefined
                    ? decryptedValue === 0
                      ? "Empty"
                      : `Building ${decryptedValue}`
                    : "Encrypted";
                return (
                  <button
                    key={`tile-${index}`}
                    type="button"
                    className={`tile ${isActive ? "active" : ""}`}
                    onClick={() => setSelectedTile(index)}
                  >
                    <span className="tile-index">{index + 1}</span>
                    <span className="tile-label">{label}</span>
                  </button>
                );
              })}
            </div>
            <div className="panel-footer">
              <button
                className="ghost-button"
                onClick={handleDecryptTile}
                disabled={!isJoined || isDecryptingTile || !isContractConfigured}
              >
                {isDecryptingTile ? "Decrypting..." : "Decrypt selected tile"}
              </button>
              <p className="hint">
                Decryption reveals the building type only to you.
              </p>
            </div>
          </div>

          <div className="panel build-panel">
            <div className="panel-header">
              <div>
                <h3>Build console</h3>
                <p className="panel-subtitle">Choose a structure to place.</p>
              </div>
            </div>
            <div className="build-list">
              {BUILDINGS.map((building) => (
                <button
                  key={`building-${building.id}`}
                  type="button"
                  className={`build-card ${
                    selectedBuilding === building.id ? "selected" : ""
                  }`}
                  onClick={() => setSelectedBuilding(building.id)}
                >
                  <div className="build-card-header">
                    <span className="build-name">{building.name}</span>
                    <span className="build-cost">{building.cost} coins</span>
                  </div>
                  <p className="build-detail">{building.detail}</p>
                </button>
              ))}
            </div>
            <div className="panel-footer">
              <button
                className="primary-button"
                onClick={handleBuild}
                disabled={!isJoined || isBuilding || !isContractConfigured}
              >
                {isBuilding ? "Building..." : "Build on selected tile"}
              </button>
              <p className="hint">
                The building type is encrypted before it hits the chain.
              </p>
            </div>
          </div>
        </section>

        {statusMessage && (
          <div className="status-banner">
            <span>{statusMessage}</span>
          </div>
        )}
      </main>
    </div>
  );
}
