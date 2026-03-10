// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AriToken} from "../src/AriToken.sol";
import {VeARI} from "../src/VeARI.sol";
import {SolverRegistry} from "../src/SolverRegistry.sol";
import {SimplePriceOracle} from "../src/SimplePriceOracle.sol";
import {ConditionalIntent} from "../src/ConditionalIntent.sol";
import {PerpetualMarket} from "../src/PerpetualMarket.sol";
import {CrossChainIntent} from "../src/CrossChainIntent.sol";
import {IntentComposer} from "../src/IntentComposer.sol";
import {PrivatePool} from "../src/PrivatePool.sol";
import {AriPaymaster} from "../src/AriPaymaster.sol";

/// @title DeployAll
/// @notice Deploys all remaining ARI DEX contracts (Settlement/VaultFactory already deployed).
contract DeployAll is Script {
    // Already deployed
    address constant SETTLEMENT = 0x536EeDA7d07cF7Af171fBeD8FAe7987a5c63B822;

    function run() external {
        vm.startBroadcast();

        // 1. ARI Token
        AriToken ariToken = new AriToken(msg.sender);
        console.log("AriToken:", address(ariToken));

        // 2. VeARI (vote-escrowed governance)
        VeARI veAri = new VeARI(address(ariToken));
        console.log("VeARI:", address(veAri));

        // 3. SolverRegistry (requires ARI token for staking)
        SolverRegistry solverRegistry = new SolverRegistry(address(ariToken));
        console.log("SolverRegistry:", address(solverRegistry));

        // 4. SimplePriceOracle
        SimplePriceOracle oracle = new SimplePriceOracle();
        console.log("SimplePriceOracle:", address(oracle));

        // 5. ConditionalIntent (limit orders, stop loss, DCA)
        ConditionalIntent conditionalIntent = new ConditionalIntent(address(oracle));
        console.log("ConditionalIntent:", address(conditionalIntent));

        // 6. PerpetualMarket (use ARI as collateral, initial price $1)
        PerpetualMarket perpMarket = new PerpetualMarket(address(ariToken), 1e18);
        console.log("PerpetualMarket:", address(perpMarket));

        // 7. CrossChainIntent (ERC-7683)
        CrossChainIntent crossChain = new CrossChainIntent();
        console.log("CrossChainIntent:", address(crossChain));

        // 8. IntentComposer (atomic multi-action)
        IntentComposer composer = new IntentComposer();
        console.log("IntentComposer:", address(composer));

        // 9. PrivatePool (whitelisted AMM)
        PrivatePool privatePool = new PrivatePool();
        console.log("PrivatePool:", address(privatePool));

        // 10. AriPaymaster (ERC-4337 gas sponsorship)
        AriPaymaster paymaster = new AriPaymaster(SETTLEMENT);
        console.log("AriPaymaster:", address(paymaster));

        vm.stopBroadcast();
    }
}
