import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedVeilGame = await deploy("VeilGame", {
    from: deployer,
    log: true,
  });

  console.log(`VeilGame contract: `, deployedVeilGame.address);
};
export default func;
func.id = "deploy_veilGame"; // id required to prevent reexecution
func.tags = ["VeilGame"];
