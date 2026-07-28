# Changelog

All notable changes to the Seedless wallet. Newest first.

## 0.4.5-beta

- Multi-wallet support, add and switch between wallets on one passkey.
- Any-coin swaps with automatic SPL detection and a curated token list.
- Transaction history and incoming payment notifications.
- Address book, wallet lock, and a settings screen.
- Light and dark theme toggle, dark by default.

## 0.4.4-beta

- Balances refresh on an incoming payment instead of waiting for a manual pull.
- Fixed the toast banner clipping behind the dynamic island.
- Fixed a history screen hang and reduced secure storage noise on startup.

## 0.4.2-beta

- Burner wallets now support SPL tokens, with a per-token balance list.
- Stealth address QR readable in dark mode.
- Shortened the stealth and private mode copy.
- Fixed retry spam on rate limited RPC responses.

## 0.4.1-beta

- Multi-token sends for SOL, USDC and SEED, each with its own balance and max.
- New token registry as the single source of truth for supported tokens.
- Swap token picker reads from the registry and shows a live balance per row.
- Preflight balance check before a private mode deposit, with clearer errors.
- Shared loading, success and error screens.

## 0.4.0-beta

- First public beta on mainnet.
- Passkey login through LazorKit, no seed phrase.
- Gasless sends and swaps sponsored through the Kora paymaster.
- Stealth addresses, burner wallets, and private sends via Umbra.
