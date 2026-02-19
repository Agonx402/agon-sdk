import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createTransferCheckedInstruction,
  createApproveCheckedInstruction,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { USDC } from "@agonx402/types";

const USDC_DECIMALS = 6;

/**
 * Send USDC from the consumer's wallet to a destination address.
 * Used for depositing USDC to Agon's wallet.
 *
 * Returns the transaction signature.
 */
export async function sendUsdc(
  connection: Connection,
  wallet: Keypair,
  destination: string,
  amount: bigint,
  usdcMint: string
): Promise<string> {
  const mintPubkey = new PublicKey(usdcMint);
  const destPubkey = new PublicKey(destination);

  const sourceAta = await getAssociatedTokenAddress(mintPubkey, wallet.publicKey);

  // Ensure destination ATA exists
  const destAta = await getOrCreateAssociatedTokenAccount(
    connection,
    wallet,
    mintPubkey,
    destPubkey
  );

  const tx = new Transaction().add(
    createTransferCheckedInstruction(
      sourceAta,
      mintPubkey,
      destAta.address,
      wallet.publicKey,
      amount,
      USDC_DECIMALS
    )
  );

  const signature = await sendAndConfirmTransaction(connection, tx, [wallet], {
    commitment: "confirmed",
  });

  return signature;
}

/**
 * Approve Agon as a delegate on the consumer's USDC ATA.
 * Required for auto-refill — allows Agon to pull USDC when balance is low.
 *
 * Returns the transaction signature.
 */
export async function approveDelegate(
  connection: Connection,
  wallet: Keypair,
  delegate: string,
  amount: bigint,
  usdcMint: string
): Promise<string> {
  const mintPubkey = new PublicKey(usdcMint);
  const delegatePubkey = new PublicKey(delegate);

  const sourceAta = await getAssociatedTokenAddress(mintPubkey, wallet.publicKey);

  const tx = new Transaction().add(
    createApproveCheckedInstruction(
      sourceAta,
      mintPubkey,
      delegatePubkey,
      wallet.publicKey,
      amount,
      USDC_DECIMALS
    )
  );

  const signature = await sendAndConfirmTransaction(connection, tx, [wallet], {
    commitment: "confirmed",
  });

  return signature;
}

/**
 * Revoke delegation (set approved amount to 0).
 * Used when disabling auto-refill.
 */
export async function revokeDelegate(
  connection: Connection,
  wallet: Keypair,
  delegate: string,
  usdcMint: string
): Promise<string> {
  return approveDelegate(connection, wallet, delegate, 0n, usdcMint);
}

/**
 * Convert a human-readable USDC amount to smallest units.
 * E.g., 10 -> 10_000_000 (10 USDC)
 */
export function usdcToUnits(amount: number): bigint {
  return BigInt(Math.round(amount * 1_000_000));
}

/**
 * Convert USDC smallest units to human-readable amount.
 * E.g., 10_000_000 -> 10 (10 USDC)
 */
export function unitsToUsdc(amount: bigint | number): number {
  return Number(amount) / 1_000_000;
}
