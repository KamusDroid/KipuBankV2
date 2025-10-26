// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

/**
 * @title KipuBankV2
 * @notice Multi-asset vault with USD(6) caps using Chainlink feeds.
 * @dev Uses AccessControl (admin + FEED_MANAGER_ROLE), Pausable, ReentrancyGuard, CEI, SafeERC20.
 */
contract KipuBankV2 is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                                TYPES
    //////////////////////////////////////////////////////////////*/

    bytes32 public constant FEED_MANAGER_ROLE = keccak256("FEED_MANAGER_ROLE");
    address public constant ETH = address(0);

    /*//////////////////////////////////////////////////////////////
                           STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Chainlink ETH/USD feed
    AggregatorV3Interface public immutable i_ethUsdFeed;

    /// @notice Global bank cap in USD6 (e.g., 1_000 USD = 1_000_000_000)
    uint256 public immutable i_bankCapUsd6;

    /// @notice Per-transaction withdraw cap in USD6 (e.g., 10 USD = 10_000_000)
    uint256 public immutable i_withdrawCapUsd6;

    /// @notice Remaining used capacity in USD6
    uint256 private s_usedCapUsd6;

    /// @dev mapping(token => mapping(user => balance))
    mapping(address => mapping(address => uint256)) private s_balances;

    /// @dev mapping(token => mapping(user => depositsCount))
    mapping(address => mapping(address => uint256)) private s_userDepositsCount;

    /// @dev mapping(token => mapping(user => withdrawalsCount))
    mapping(address => mapping(address => uint256)) private s_userWithdrawalsCount;

    /// @notice Registered ERC-20 -> USD feed
    mapping(address => AggregatorV3Interface) public s_tokenFeeds;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event KipuBank_Deposited(address indexed token, address indexed user, uint256 amount, uint256 usd6);
    event KipuBank_Withdrawn(address indexed token, address indexed user, uint256 amount, uint256 usd6);
    event KipuBank_TokenFeedSet(address indexed token, address indexed feed);
    event KipuBank_Paused(address indexed admin, bool paused);

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    error KipuBank_InvalidFeed(address token, address feed);
    error KipuBank_TokenNotSupported(address token);
    error KipuBank_ExceedsBankCap(uint256 attemptedUsd6, uint256 remainingUsd6);
    error KipuBank_ExceedsWithdrawCap(uint256 usd6Amount, uint256 capUsd6);
    error KipuBank_InsufficientBalance(uint256 balance, uint256 requested);
    error KipuBank_PriceStaleOrNegative(address feed);
    error KipuBank_TransferFailed();

    /*//////////////////////////////////////////////////////////////
                               CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /**
     * @param admin EOA to receive DEFAULT_ADMIN_ROLE and FEED_MANAGER_ROLE
     * @param ethUsdFeed Chainlink ETH/USD Aggregator
     * @param bankCapUsd6 Global bank cap in USD(6)
     * @param withdrawCapUsd6 Per-transaction withdraw cap in USD(6)
     */
    constructor(
        address admin,
        address ethUsdFeed,
        uint256 bankCapUsd6,
        uint256 withdrawCapUsd6
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(FEED_MANAGER_ROLE, admin);
        i_ethUsdFeed = AggregatorV3Interface(ethUsdFeed);
        i_bankCapUsd6 = bankCapUsd6;
        i_withdrawCapUsd6 = withdrawCapUsd6;
    }

    /*//////////////////////////////////////////////////////////////
                            ADMIN / GOVERNANCE
    //////////////////////////////////////////////////////////////*/

    /// @notice Pause/unpause deposits and withdrawals
    function setPaused(bool paused) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (paused) _pause();
        else _unpause();
        emit KipuBank_Paused(msg.sender, paused);
    }

    /// @notice Register or update an ERC-20 -> USD feed
    function setTokenFeed(address token, address feed) external onlyRole(FEED_MANAGER_ROLE) {
        if (token == address(0) || feed == address(0)) {
            revert KipuBank_InvalidFeed(token, feed);
        }
        s_tokenFeeds[token] = AggregatorV3Interface(feed);
        emit KipuBank_TokenFeedSet(token, feed);
    }

    /*//////////////////////////////////////////////////////////////
                              USER ACTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Deposit native ETH
    function depositETH() external payable whenNotPaused nonReentrant {
        uint256 usd6 = _quoteToUsd6(ETH, msg.value);
        _enforceBankCap(usd6);

        s_balances[ETH][msg.sender] += msg.value;
        unchecked {
            ++s_userDepositsCount[ETH][msg.sender];
        }
        s_usedCapUsd6 += usd6;

        emit KipuBank_Deposited(ETH, msg.sender, msg.value, usd6);
    }

    /// @notice Withdraw native ETH
    function withdrawETH(uint256 amount) external whenNotPaused nonReentrant {
        uint256 bal = s_balances[ETH][msg.sender];
        if (bal < amount) revert KipuBank_InsufficientBalance(bal, amount);
       
        uint256 usd6 = _quoteToUsd6(ETH, amount);
        if (usd6 > i_withdrawCapUsd6) revert KipuBank_ExceedsWithdrawCap(usd6, i_withdrawCapUsd6);

       
        // effects
        s_balances[ETH][msg.sender] = bal - amount;
        unchecked {
            ++s_userWithdrawalsCount[ETH][msg.sender];
        }
        // total used decreases by the USD6 representation of withdrawn
        s_usedCapUsd6 -= usd6;

        // interaction
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert KipuBank_TransferFailed();

        emit KipuBank_Withdrawn(ETH, msg.sender, amount, usd6);
    }

    /// @notice Deposit ERC-20 supported by a registered feed
    function depositERC20(address token, uint256 amount) external whenNotPaused nonReentrant {
        AggregatorV3Interface feed = s_tokenFeeds[token];
        if (address(feed) == address(0)) revert KipuBank_TokenNotSupported(token);

        uint256 usd6 = _quoteErc20ToUsd6(token, feed, amount);
        _enforceBankCap(usd6);

        s_balances[token][msg.sender] += amount;
        unchecked {
            ++s_userDepositsCount[token][msg.sender];
        }
        s_usedCapUsd6 += usd6;

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit KipuBank_Deposited(token, msg.sender, amount, usd6);
    }

    /// @notice Withdraw ERC-20 supported by a registered feed
    function withdrawERC20(address token, uint256 amount) external whenNotPaused nonReentrant {
        AggregatorV3Interface feed = s_tokenFeeds[token];
        if (address(feed) == address(0)) revert KipuBank_TokenNotSupported(token);

        uint256 bal = s_balances[token][msg.sender];
        if (bal < amount) revert KipuBank_InsufficientBalance(bal, amount);

        uint256 usd6 = _quoteErc20ToUsd6(token, feed, amount);
        if (usd6 > i_withdrawCapUsd6) revert KipuBank_ExceedsWithdrawCap(usd6, i_withdrawCapUsd6);

        s_balances[token][msg.sender] = bal - amount;
        unchecked {
            ++s_userWithdrawalsCount[token][msg.sender];
        }
        s_usedCapUsd6 -= usd6;

        IERC20(token).safeTransfer(msg.sender, amount);
        emit KipuBank_Withdrawn(token, msg.sender, amount, usd6);
    }

    /*//////////////////////////////////////////////////////////////
                                 VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice Vault info for a user/token
    function getVault(address token, address user)
        external
        view
        returns (uint256 balance, uint256 deposits, uint256 withdrawals)
    {
        balance = s_balances[token][user];
        deposits = s_userDepositsCount[token][user];
        withdrawals = s_userWithdrawalsCount[token][user];
    }

    /// @notice Remaining capacity (USD6)
    function getRemainingBankCapacityUsd6() external view returns (uint256) {
        return i_bankCapUsd6 - s_usedCapUsd6;
    }

    /// @notice Quote token amount to USD6; ETH is address(0)
    function quoteTokenToUsd6(address token, uint256 amount) external view returns (uint256) {
        if (token == ETH) {
            return _quoteToUsd6(ETH, amount);
        }
        AggregatorV3Interface feed = s_tokenFeeds[token];
        if (address(feed) == address(0)) revert KipuBank_TokenNotSupported(token);
        return _quoteErc20ToUsd6(token, feed, amount);
    }

    /*//////////////////////////////////////////////////////////////
                           INTERNAL HELPERS
    //////////////////////////////////////////////////////////////*/

    function _enforceBankCap(uint256 usd6) internal view {
        uint256 remaining = i_bankCapUsd6 - s_usedCapUsd6;
        if (usd6 > remaining) revert KipuBank_ExceedsBankCap(usd6, remaining);
    }

    function _latestPrice(AggregatorV3Interface feed) internal view returns (uint256 price, uint8 decimals) {
        (, int256 answer, , uint256 updatedAt, ) = feed.latestRoundData();
        decimals = feed.decimals();
        if (answer <= 0 || updatedAt == 0) revert KipuBank_PriceStaleOrNegative(address(feed));
        price = uint256(answer);
    }

    function _quoteToUsd6(address token, uint256 amount) internal view returns (uint256) {
        if (token == ETH) {
            (uint256 price, uint8 pDec) = _latestPrice(i_ethUsdFeed); // ETH/USD
            // amount [1e18], price [1e pDec] => USD6 = amount * price * 1e6 / (1e18 * 1e pDec)
            return (amount * price * 1e6) / (1e18 * (10 ** pDec));
        }
        AggregatorV3Interface feed = s_tokenFeeds[token];
        if (address(feed) == address(0)) revert KipuBank_TokenNotSupported(token);
        return _quoteErc20ToUsd6(token, feed, amount);
    }

    function _quoteErc20ToUsd6(address token, AggregatorV3Interface feed, uint256 amount) internal view returns (uint256) {
        (uint256 price, uint8 pDec) = _latestPrice(feed);
        uint8 tDec = IERC20Metadata(token).decimals();
        // amount [1e tDec], price [1e pDec] => USD6 = amount * price * 1e6 / (1e tDec * 1e pDec)
        return (amount * price * 1e6) / ((10 ** tDec) * (10 ** pDec));
    }
}
