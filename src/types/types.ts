import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

// Security: Wallet Interface (Same as PumpFun module for consistency)
export interface IWallet {
    publicKey: PublicKey;
    signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T>;
    signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]>;
}

export interface RaydiumConfig {
    rpcUrl: string;
    wallet: IWallet; // Dependency Injection
}

export interface SwapOptions {
    tokenMint: string;      // Token address to Buy/Sell
    amount: number;         // Amount (SOL for Buy, Tokens for Sell)
    action: "buy" | "sell";
    slippagePct: number;    // e.g., 1 for 1%
    priorityFee?: number;   // Fixed Fee (Optional)
    useDynamicFee?: boolean; // Enable Auto-Fee
}

export interface SwapResult {
    success: boolean;
    signature?: string;
    error?: string;
}

// Internal API Response Types
export interface RaydiumQuoteResponse {
    id: string;
    success: boolean;
    data: any;
    msg?: string;
}