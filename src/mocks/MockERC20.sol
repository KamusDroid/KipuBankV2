// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    uint8 private _customDecimals;
    constructor(string memory n, string memory s, uint8 d) ERC20(n, s) {
        _customDecimals = d;
    }
    function decimals() public view override returns (uint8) { return _customDecimals; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}
