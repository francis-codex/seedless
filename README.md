# Lazor Wallet Starter

A React Native (Expo) starter template demonstrating a passkey-based wallet authentication and gasless transactions on Solana using LazorKit SDK.

## Demo

**[Download Android APK](https://expo.dev/accounts/solana-bridge/projects/seedless/builds/8c0916af-80c7-4f73-a57c-3a752da5917b)**

## Screenshots

### Passkey Authentication
<p align="left">
  <img src="./assets/screenshots/01-home-screen.jpg" width="180" alt="Home Screen" />
  <img src="./assets/screenshots/02-creating-account.jpg" width="180" alt="Creating Account" />
  <img src="./assets/screenshots/03-passkey-prompt.jpg" width="180" alt="Passkey Prompt" />
</p>

### Wallet & Balance Display
<p align="left">
  <img src="./assets/screenshots/04-wallet-balance-hidden.jpg" width="180" alt="Balance Hidden" />
  <img src="./assets/screenshots/05-wallet-balance-visible.jpg" width="180" alt="Balance Visible" />
</p>

### Gasless SOL Transfer
<p align="left">
  <img src="./assets/screenshots/06-send-sol-form.jpg" width="180" alt="Send SOL Form" />
  <img src="./assets/screenshots/07-send-transaction.jpg" width="180" alt="Transaction Preview" />
  <img src="./assets/screenshots/08-transaction-passkey.jpg" width="180" alt="Transaction Passkey" />
</p>

### Jupiter Token Swap (Mainnet)
<p align="left">
  <img src="./assets/screenshots/09-jupiter-swap.jpg" width="180" alt="Jupiter Swap" />
</p>

### Stealth Addresses
<p align="left">
  <img src="./assets/screenshots/10-stealth-home.jpg" width="180" alt="Stealth Home" />
  <img src="./assets/screenshots/11-stealth-payment-request.jpg" width="180" alt="Payment Request QR" />
</p>

### Burner Wallets
<p align="left">
  <img src="./assets/screenshots/12-burner-home.jpg" width="180" alt="Burner Home" />
  <img src="./assets/screenshots/13-burner-with-balance.jpg" width="180" alt="Burner With Balance" />
</p>

### X402 Paywall Demo
<p align="left">
  <img src="./assets/screenshots/14-x402-home.jpg" width="180" alt="X402 Content List" />
  <img src="./assets/screenshots/15-x402-payment.jpg" width="180" alt="X402 Payment" />
  <img src="./assets/screenshots/16-x402-unlocked.jpg" width="180" alt="Content Unlocked" />
</p>

## Features

- **Passkey Authentication**: No seed phrases. Users authenticate with FaceID, TouchID, or fingerprint
- **Gasless Transactions**: Send SOL without holding any for fees. Kora paymaster sponsors transactions
- **Smart Wallet**: PDA-based wallet with recovery and programmable logic
- **Balance Display**: Real-time SOL and USDC balance with refresh functionality
- **Jupiter Gasless Swaps**: Swap tokens (SOL - USDC) with zero gas fees using Jupiter aggregator
- **Private Mode**: Hide balances. Requires biometric auth to reveal
- **Stealth Addresses**: One-time receiving addresses for private payments with Solana Pay QR codes
- **Burner Wallets**: Completely isolated disposable identities with zero on-chain link
- **X402 Paywall Demo**: Pay-per-view content using HTTP 402 micropayments
- **Clean Architecture**: Minimal, well-documented code ready to extend

## Quick Start

### Prerequisites

- Node.js 20+
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator or Android Emulator

### Installation

```bash
# Clone the repo
git clone https://github.com/francis-codex/seedless.git
cd seedless

# Install dependencies
npm install

# Start the development server
npx expo start
```

### Running the App

```bash
# iOS Simulator
npx expo start --ios

# Android Emulator
npx expo start --android
```

**Note**: Passkeys require a native environment. They won't work in Expo Go web mode.

## Project Structure

```
lazor-wallet-starter/
├── App.tsx                 # Main app component
├── index.ts                # Entry point with polyfills
├── app.json                # Expo configuration
├── src/
│   ├── AppContent.tsx      # Navigation router
│   ├── constants/          # Configuration constants
│   │   └── index.ts        # RPC, Jupiter API, token configs
│   ├── providers/          # React context providers
│   │   └── LazorProvider.tsx
│   ├── screens/            # App screens
│   │   ├── HomeScreen.tsx  # Passkey connect screen
│   │   ├── WalletScreen.tsx # Wallet, balance, and transfer screen
│   │   ├── SwapScreen.tsx  # Jupiter gasless swap screen
│   │   ├── StealthScreen.tsx # Stealth address management
│   │   ├── BurnerScreen.tsx  # Burner wallet management
│   │   └── PaywallScreen.tsx # X402 pay-per-view demo
│   └── utils/              # Utility functions
│       ├── jupiter.ts      # Jupiter swap integration
│       ├── stealth.ts      # Stealth address cryptography
│       ├── paymentRequest.ts # Solana Pay URL generation
│       ├── burner.ts       # Burner wallet management
│       └── x402.ts         # X402 protocol utilities
└── docs/
    ├── tutorial-1-passkey-wallet.md
    ├── tutorial-2-gasless-transactions.md
    ├── tutorial-3-jupiter-gasless-swaps.md
    ├── tutorial-4-privacy-features.md
    └── tutorial-5-x402-paywall.md
```

## Configuration

Update `src/constants/index.ts` with your settings:

```typescript
// RPC endpoint (use private RPC for production)
export const SOLANA_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=YOUR_KEY';

// LazorKit configuration
export const PORTAL_URL = 'https://portal.lazor.sh';
export const PAYMASTER_URL = 'https://kora.lazorkit.com';

// Jupiter Swap API (get free key at portal.jup.ag)
export const JUPITER_API_URL = 'https://api.jup.ag';
export const JUPITER_API_KEY = 'YOUR_JUPITER_API_KEY';
```

For production, use a private RPC endpoint (e.g., Helius) to avoid rate limits.

## How It Works

### Passkey Authentication

1. User taps "Connect"
2. App opens LazorKit portal in browser
3. User authenticates with device biometrics
4. Smart wallet PDA is created/retrieved
5. Session is established

### Gasless Transactions

1. App creates transaction instructions
2. LazorKit wraps transaction with paymaster
3. User signs with biometrics
4. Kora paymaster pays the fee
5. Transaction is broadcast and confirmed

### Jupiter Gasless Swaps

We use an unconventional approach to combine Jupiter with LazorKit's gasless flow:

1. Get quote from Jupiter `/quote` endpoint
2. Get raw instructions from `/swap-instructions` (not the serialized transaction)
3. **Filter out compute budget instructions** (critical for Kora compatibility)
4. Pass filtered instructions to LazorKit's `signAndSendTransaction`
5. Kora paymaster sponsors the gas
6. User gets best-price swap with zero fees

**Why this approach?** Jupiter Ultra returns a transaction blob, but LazorKit needs instruction arrays. Using `/swap-instructions` gives us composability to plug Jupiter's routing into LazorKit's signing flow.

## SDK Reference

### Provider

```tsx
import { LazorKitProvider } from '@lazorkit/wallet-mobile-adapter';

<LazorKitProvider
  rpcUrl="https://api.devnet.solana.com"
  portalUrl="https://portal.lazor.sh"
  configPaymaster={{ paymasterUrl: "https://kora.devnet.lazorkit.com" }}
>
  {children}
</LazorKitProvider>
```

### Hook

```tsx
import { useWallet } from '@lazorkit/wallet-mobile-adapter';

const {
  smartWalletPubkey,  // PublicKey | null
  isConnected,        // boolean
  isConnecting,       // boolean
  isSigning,          // boolean
  connect,            // (options) => Promise<WalletInfo>
  disconnect,         // () => Promise<void>
  signAndSendTransaction,  // (payload, options) => Promise<string>
} = useWallet();
```

### Connect

```tsx
import * as Linking from 'expo-linking';

await connect({
  redirectUrl: Linking.createURL('callback'),
  onSuccess: (wallet) => console.log('Connected:', wallet),
  onFail: (error) => console.error('Failed:', error),
});
```

### Send Transaction

```tsx
await signAndSendTransaction(
  {
    instructions: [transferInstruction],
    transactionOptions: {
      clusterSimulation: 'mainnet',
      // feeToken: USDC_MINT,  // Optional: pay fees in USDC
    },
  },
  {
    redirectUrl: Linking.createURL('sign-callback'),
    onSuccess: () => console.log('Sent'),
    onFail: (error) => console.error('Failed:', error),
  }
);
```

## Tutorials

- [Tutorial 1: Creating a Passkey Wallet](./docs/tutorial-1-passkey-wallet.md)
- [Tutorial 2: Gasless Transactions](./docs/tutorial-2-gasless-transactions.md)
- [Tutorial 3: Jupiter Gasless Swaps](./docs/tutorial-3-jupiter-gasless-swaps.md)

## Resources

- [LazorKit Documentation](https://docs.lazorkit.com/)
- [LazorKit GitHub](https://github.com/lazor-kit/lazor-kit)
- [Kora Documentation](https://launch.solana.com/docs/kora)
- [Jupiter Swap API Docs](https://dev.jup.ag/docs/swap-api)
- [Jupiter API Portal](https://portal.jup.ag) (get your API key)
- [Solana Passkeys Blog](https://www.helius.dev/blog/solana-passkeys)

## Tech Stack

- React Native (Expo SDK 54)
- TypeScript
- LazorKit SDK
- Kora Paymaster (Solana Foundation)
- Solana Web3.js
- Jupiter Swap API
- SPL Token

## Deployment

### Expo Go (Development)

```bash
npx expo start
```

Scan QR code with Expo Go app.

### Development Build (Recommended for Passkeys)

```bash
npx expo prebuild
npx expo run:ios
# or
npx expo run:android
```

### Production Build

```bash
eas build --platform ios
eas build --platform android
```

## Troubleshooting

### Passkey not working

- Ensure you're running on a native device/simulator, not web
- Check that `scheme` is set in app.json
- Verify deep linking is configured correctly

### Transaction fails

- Check wallet has sufficient balance for transfer amount
- Verify recipient address is valid
- Check Kora paymaster status

### Polyfill errors

- Ensure polyfills are imported at the very top of index.ts
- Run `npx expo install expo-crypto` if crypto errors persist

## License

MIT
