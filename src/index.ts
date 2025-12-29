// src/index.ts

import { RaydiumSwap } from './core/RaydiumSwap';
import { JitoExecutor } from './core/JitoExecutor'; // Import JitoExecutor
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';
import { IWallet } from './types/types';

dotenv.config();

class NodeWallet implements IWallet {
    constructor(private payer: Keypair) { }
    get publicKey() { return this.payer.publicKey; }
    async signTransaction(tx: any) { tx.sign([this.payer]); return tx; }
    async signAllTransactions(txs: any[]) { return txs.map(t => { t.sign([this.payer]); return t; }); }
}

(async () => {
    // 1. Argument Handling (No more hardcoding!)
    const args = process.argv.slice(2); // Get arguments from command line
    const TARGET_TOKEN = args[0];
    const AMOUNT = args[1] ? parseFloat(args[1]) : 0.001; // Default 0.001 if not provided

    if (!TARGET_TOKEN) {
        console.error("❌ ERROR: Please provide a token address.");
        console.error("👉 Usage: npm run dev <TOKEN_MINT> [AMOUNT]");
        process.exit(1);
    }

    console.log(`🔥 Initializing Sniper for Token: ${TARGET_TOKEN}`);
    console.log(`wv Buying Amount: ${AMOUNT} SOL`);

    // 2. Setup
    const privateKey = process.env.PRIVATE_KEY;
    const rpcUrl = process.env.HELIUS_RPC_URL;
    if (!privateKey || !rpcUrl) throw new Error("❌ Check .env file");

    const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
    const wallet = new NodeWallet(keypair);
    const trader = new RaydiumSwap({ rpcUrl, wallet });

    try {
        // 3. Execute Trade
        const result = await trader.execute({
            action: "buy",
            tokenMint: TARGET_TOKEN,
            amount: AMOUNT,
            slippagePct: 10,
            useDynamicFee: true
        });

        if (result.success && result.signature) {
            console.log(`\n🚀 Bundle Sent! ID: ${result.signature}`);
            console.log("⏳ Waiting for Jito Confirmation...");

            // 4. VERIFY STATUS (The Missing Piece)
            let status = null;
            // Poll for 5 seconds max
            for (let i = 0; i < 10; i++) {
                await new Promise(r => setTimeout(r, 1000)); // Wait 1s
                const bundleData = await JitoExecutor.getBundleStatus(result.signature);

                if (bundleData && bundleData.value && bundleData.value.length > 0) {
                    status = bundleData.value[0].confirmation_status;
                    console.log(`🔎 Status: ${status}`);

                    if (status === 'confirmed' || status === 'finalized') {
                        console.log("✅ BUNDLE LANDED SUCCESSFULLY!");
                        process.exit(0);
                    }
                }
            }
            console.log("⚠️ Bundle status unknown (Check Solscan).");
        } else {
            console.error(`\n❌ FAILED: ${result.error}`);
        }

    } catch (e) {
        console.error("CRITICAL ERROR:", e);
    }
})();