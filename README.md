# Seedless Wallet

A simple and private passkey wallet on Solana. No seed phrases. No gas. Just your face.

> **Live in private mainnet beta.** Dark by default. Built for people who get paid in crypto but don't want to live in crypto: receive, hold, send, and cash out, without ever learning what a seed phrase is.

## Download

**[Android APK](https://www.seedlesslabs.xyz/)** (request access via the waitlist)

## Screenshots

Fresh captures from the current dark-mode mainnet build are being added. The earlier light-mode devnet shots were removed because they no longer reflect the app.

<!--
Capture checklist (current dark build), drop into assets/screenshots/ as PNGs:
  01-passkey-login.png      passkey / FaceID create + sign-in
  02-wallet-dark.png        home, dark theme, multi-token balances
  03-send-token.png         multi-token send sheet (SOL/USDC/SEED)
  04-send-private.png       "Send privately" toggle (Umbra)
  05-swap.png               Jupiter swap with token picker
  06-stealth.png            stealth receive address + QR
  07-burner.png             burner wallet list + balance
  08-private-mode.png       hidden balances / biometric reveal
Then re-add the <img> grid here.
-->

## Features

- **Passkey login.** FaceID, fingerprint, or device biometrics through LazorKit. No seed phrase, ever.
- **No gas.** Sends and swaps are sponsored through the Kora paymaster, so you don't need to hold SOL just to pay fees.
- **Multi-token sends.** Send SOL, USDC, and SEED from one place, each with its own balance and max.
- **Send privately.** Flip one switch before you send and the amount stays between you and the person you're paying, powered by the Umbra SDK.
- **Stealth addresses.** One-time receiving addresses so incoming payments aren't tied to your main wallet.
- **Burner wallets.** Disposable, isolated wallets with no on-chain link to your identity, now with SPL token support.
- **Jupiter swaps.** Best-price token swaps with a live token picker, gas-free.
- **Private mode.** Hide balances behind a tap, biometric auth to reveal.
- **Wallet rename.** Name your wallet, persisted per passkey.

## Architecture

Seedless is a product, not a library, so this is a high-level look at how it works rather than a build guide.

- **Identity.** Every user is a LazorKit smart wallet controlled by a WebAuthn passkey held in the device Secure Enclave or Android Keystore. There is no seed phrase to store, leak, or recover.
- **No gas.** Transactions are relayed through the Kora paymaster, which sponsors the network fee, so a user never needs SOL just to move money. App-level rate limiting protects the relayer.
- **Private sends.** The Umbra SDK shields the transfer amount so it stays between the sender and the person being paid.
- **Swaps.** Jupiter routes best-price swaps, executed gas-free through the same relayer path.
- **Cross-chain (in progress).** The PasskeyDWalletController program verifies a passkey signature on-chain (secp256r1 precompile introspection, mirroring SIMD-0048) before authorizing an Ika MPC dWallet to sign EVM transactions.
- **Infrastructure.** Alchemy is the primary mainnet RPC, with Helius serving websockets.

The design goal is invisibility. The crypto is the engine, not the dashboard.

## Tech Stack

React Native (Expo) and TypeScript on the client. LazorKit for passkey smart wallets, Kora for gasless transactions, Umbra for private sends, Jupiter for swaps, and Solana web3.js throughout.

## Recognition

- **Bags Hackathon winner** (top 5).
- **2nd place, Umbra Colosseum Frontier sidetrack** for bringing private payments to the wallet layer.
- **Placed in the Encrypt/Ika Frontier sidetrack** with [PasskeyDWalletController](https://github.com/francis-codex/passkey-dwallet-controller), an on-chain authority that lets a passkey control an Ika MPC dWallet.

## On the roadmap

- **Cash out to your bank.** Crypto to local currency offramp, the retention piece that makes this real money for everyday users.
- **Cross-chain signing via Ika.** Sign EVM transactions from your passkey through the PasskeyDWalletController program (live on devnet), wiring into the app for mainnet.
- **Multi-token private send.** Extend private sends beyond SOL to USDC and other tokens.

## Links

- [Landing Page](https://seedlesslabs.xyz)
- [Twitter](https://x.com/seedless_wallet)
- [Seedless Labs](https://github.com/seedless-labs)

## License

MIT
