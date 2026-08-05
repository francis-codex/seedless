// Transfer instruction assembly.
//
// SECURITY.md puts "instruction assembly, associated token account creation
// and idempotency, fee and rent accounting, mint validation" at the top of
// what is in scope for us. The properties that matter: the recipient ATA is
// created only when it is genuinely missing, the rent for it is charged to
// the declared payer rather than the sender, the transfer encodes decimals so
// a wrong-scale amount fails on chain instead of moving the wrong value, and
// both ATAs are derived allowing an off-curve owner, since the sender is a
// smart wallet PDA rather than a keypair.

import { PublicKey, SystemProgram } from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from '@solana/spl-token';

import { TOKEN_REGISTRY } from './registry';
import { buildTransferInstructions } from './transfer';

const SOL = TOKEN_REGISTRY.SOL;
const USDC = TOKEN_REGISTRY.USDC;

const fromOwner = new PublicKey('11111111111111111111111111111112');
const toOwner = new PublicKey('So11111111111111111111111111111111111111112');
const ataPayer = new PublicKey('SysvarRent111111111111111111111111111111111');

function connectionWith(accountExists: boolean) {
  return {
    getAccountInfo: jest.fn(async () => (accountExists ? ({ lamports: 2_039_280 } as any) : null)),
  } as any;
}

describe('native SOL', () => {
  it('uses a system transfer and touches no token accounts', async () => {
    const connection = connectionWith(false);

    const { instructions, createsRecipientAta } = await buildTransferInstructions({
      token: SOL,
      fromOwner,
      toOwner,
      amount: 1_000_000_000n,
      connection,
      ataPayer,
    });

    expect(createsRecipientAta).toBe(false);
    expect(instructions).toHaveLength(1);
    expect(instructions[0].programId.equals(SystemProgram.programId)).toBe(true);
  });

  it('does not probe the chain for a native transfer', async () => {
    const connection = connectionWith(false);

    await buildTransferInstructions({
      token: SOL,
      fromOwner,
      toOwner,
      amount: 1n,
      connection,
      ataPayer,
    });

    expect(connection.getAccountInfo).not.toHaveBeenCalled();
  });
});

describe('SPL transfer when the recipient already has an ATA', () => {
  it('emits only the transfer, so a repeat send costs no extra rent', async () => {
    const connection = connectionWith(true);

    const { instructions, createsRecipientAta } = await buildTransferInstructions({
      token: USDC,
      fromOwner,
      toOwner,
      amount: 1_000_000n,
      connection,
      ataPayer,
    });

    expect(createsRecipientAta).toBe(false);
    expect(instructions).toHaveLength(1);
    expect(instructions[0].programId.equals(TOKEN_PROGRAM_ID)).toBe(true);
  });

  it('checks the recipient ATA, not the sender ATA', async () => {
    const connection = connectionWith(true);

    await buildTransferInstructions({
      token: USDC,
      fromOwner,
      toOwner,
      amount: 1n,
      connection,
      ataPayer,
    });

    const expected = await getAssociatedTokenAddress(
      new PublicKey(USDC.mint),
      toOwner,
      true,
    );
    expect(connection.getAccountInfo).toHaveBeenCalledTimes(1);
    expect(connection.getAccountInfo.mock.calls[0][0].toBase58()).toBe(
      expected.toBase58(),
    );
  });
});

describe('SPL transfer when the recipient has no ATA', () => {
  it('creates the ATA before transferring into it', async () => {
    const connection = connectionWith(false);

    const { instructions, createsRecipientAta } = await buildTransferInstructions({
      token: USDC,
      fromOwner,
      toOwner,
      amount: 1_000_000n,
      connection,
      ataPayer,
    });

    expect(createsRecipientAta).toBe(true);
    expect(instructions).toHaveLength(2);
    expect(instructions[0].programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(true);
    expect(instructions[1].programId.equals(TOKEN_PROGRAM_ID)).toBe(true);
  });

  // Rent is an irreversible cost. It has to land on the declared payer, which
  // for a sponsored send is the paymaster, not the user.
  it('charges the rent to the declared payer rather than the sender', async () => {
    const connection = connectionWith(false);

    const { instructions } = await buildTransferInstructions({
      token: USDC,
      fromOwner,
      toOwner,
      amount: 1n,
      connection,
      ataPayer,
    });

    const payer = instructions[0].keys[0];
    expect(payer.pubkey.toBase58()).toBe(ataPayer.toBase58());
    expect(payer.isSigner).toBe(true);
    expect(payer.isWritable).toBe(true);
  });

  it('creates the ATA for the recipient, not the sender', async () => {
    const connection = connectionWith(false);

    const { instructions } = await buildTransferInstructions({
      token: USDC,
      fromOwner,
      toOwner,
      amount: 1n,
      connection,
      ataPayer,
    });

    const recipientAta = await getAssociatedTokenAddress(
      new PublicKey(USDC.mint),
      toOwner,
      true,
    );
    expect(instructions[0].keys[1].pubkey.toBase58()).toBe(recipientAta.toBase58());
    expect(instructions[0].keys[2].pubkey.toBase58()).toBe(toOwner.toBase58());
  });

  it('signals ATA creation to the caller so the cost can be disclosed', async () => {
    const exists = await buildTransferInstructions({
      token: USDC,
      fromOwner,
      toOwner,
      amount: 1n,
      connection: connectionWith(true),
      ataPayer,
    });
    const missing = await buildTransferInstructions({
      token: USDC,
      fromOwner,
      toOwner,
      amount: 1n,
      connection: connectionWith(false),
      ataPayer,
    });

    expect(exists.createsRecipientAta).toBe(false);
    expect(missing.createsRecipientAta).toBe(true);
  });
});

describe('transfer encoding', () => {
  it('encodes the token decimals, so a wrong-scale amount fails on chain', async () => {
    const connection = connectionWith(true);

    const { instructions } = await buildTransferInstructions({
      token: USDC,
      fromOwner,
      toOwner,
      amount: 1_000_000n,
      connection,
      ataPayer,
    });

    // TransferChecked layout: [instruction, amount u64, decimals u8].
    const data = instructions[0].data;
    expect(data[data.length - 1]).toBe(USDC.decimals);
  });

  it('derives both ATAs off-curve, since the sender is a smart wallet PDA', async () => {
    const connection = connectionWith(true);

    const { instructions } = await buildTransferInstructions({
      token: USDC,
      fromOwner,
      toOwner,
      amount: 1n,
      connection,
      ataPayer,
    });

    const senderAta = await getAssociatedTokenAddress(
      new PublicKey(USDC.mint),
      fromOwner,
      true,
    );
    expect(instructions[0].keys[0].pubkey.toBase58()).toBe(senderAta.toBase58());
  });

  it('names the sender as the authority on the transfer', async () => {
    const connection = connectionWith(true);

    const { instructions } = await buildTransferInstructions({
      token: USDC,
      fromOwner,
      toOwner,
      amount: 1n,
      connection,
      ataPayer,
    });

    const authority = instructions[0].keys[3];
    expect(authority.pubkey.toBase58()).toBe(fromOwner.toBase58());
    expect(authority.isSigner).toBe(true);
  });
});
