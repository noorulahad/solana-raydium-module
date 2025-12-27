import { RaydiumSwap } from './core/RaydiumSwap';
import { Keypair, VersionedTransaction, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';
import { IWallet } from './types/types';

// Load Environment Variables
dotenv.config();

/**
 * 🔐 SECURITY: Wallet Wrapper
 * This class converts your Keypair into the Raydium SDK format.
 */
class NodeWallet implements IWallet {
    constructor(private payer: Keypair) { }
    get publicKey() { return this.payer.publicKey; }

    async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
        if (tx instanceof VersionedTransaction) {
            tx.sign([this.payer]);
        } else {
            (tx as Transaction).sign(this.payer);
        }
        return tx;
    }

    async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
        return txs.map(t => {
            if (t instanceof VersionedTransaction) t.sign([this.payer]);
            else (t as Transaction).sign(this.payer);
            return t;
        });
    }
}

// 🚀 MAIN EXECUTION FUNCTION
(async () => {
    console.log("🔥 Initializing Sniper Bot...");

    // 1. Validation Checks
    const privateKey = process.env.PRIVATE_KEY;
    const rpcUrl = process.env.HELIUS_RPC_URL; // Make sure .env has HELIUS_RPC_URL

    if (!privateKey) throw new Error("❌ MISSING PRIVATE KEY in .env");
    if (!rpcUrl) throw new Error("❌ MISSING RPC URL in .env");

    // 2. Setup Secure Wallet
    // BS58 decode is standard for Solana Private Keys
    const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
    const wallet = new NodeWallet(keypair);

    console.log(`💼 Wallet Loaded: ${wallet.publicKey.toBase58()}`);

    // 3. Initialize The Trader (Helius + Local Logic)
    const trader = new RaydiumSwap({
        rpcUrl: rpcUrl,
        wallet: wallet
    });

    // ==========================================
    // 🎯 TARGET CONFIGURATION (CHANGE THIS!)
    // ==========================================

    // Example Token (USDC or any Memecoin CA)
    const TARGET_TOKEN = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // USDC for testing
    const BUY_AMOUNT_SOL = 0.001; // Small amount for testing
    const SLIPPAGE_PERCENT = 10;  // High slippage for volatility

    try {
        console.log(`\n🔫 SNIPING TARGET: ${TARGET_TOKEN}`);

        // 4. EXECUTE THE TRADE
        // This function will now use the Jito Bundle we set up in RaydiumSwap.ts
        const result = await trader.execute({
            action: "buy",
            tokenMint: TARGET_TOKEN,
            amount: BUY_AMOUNT_SOL,
            slippagePct: SLIPPAGE_PERCENT,
            useDynamicFee: true // Logic will handle the Jito Tip
        });

        // 5. Result Output
        if (result.success) {
            console.log(`\n✅ SUCCESS! Bundle ID/Tx: ${result.signature}`);
            console.log(`🔗 Check Bundle: https://explorer.jito.wtf/bundle/${result.signature}`);
        } else {
            console.error(`\n❌ FAILED: ${result.error}`);
        }

    } catch (e) {
        console.error("CRITICAL ERROR:", e);
    }
})();