import React from 'react';
import { LazorKitProvider } from '@lazorkit/wallet-mobile-adapter';
import { SOLANA_RPC_URL, PORTAL_URL, PAYMASTER_URL, PAYMASTER_API_KEY } from '../constants';

interface LazorProviderProps {
  children: React.JSX.Element | React.JSX.Element[];
}

  // LazorProvider wraps the app with LazorKitProvider
 
  // This enables:
  // Passkey-based wallet authentication (WebAuthn)
  // Gasless transactions via Kora paymaster
  // Smart wallet functionality (PDAs)

export function LazorProvider({ children }: LazorProviderProps) {
  return (
    <LazorKitProvider
      rpcUrl={SOLANA_RPC_URL}
      portalUrl={PORTAL_URL}
      configPaymaster={{
        paymasterUrl: PAYMASTER_URL,
        apiKey: PAYMASTER_API_KEY || undefined,
      }}
    >
      {children}
    </LazorKitProvider>
  );
}
