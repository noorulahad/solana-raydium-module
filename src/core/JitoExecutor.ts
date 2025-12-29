// src/core/JitoExecutor.ts

import axios from 'axios';
import {
    Keypair,
    PublicKey,
    SystemProgram,
    TransactionMessage,
    VersionedTransaction,
    Connection
} from '@solana/web3.js';
import bs58 from 'bs58';
import { JITO_BLOCK_ENGINE_URL, JITO_TIP_ACCOUNTS } from '../config/config';

export class JitoExecutor {

    /**
     * Create Jito Tip Instruction
     * @param payer Wallet Public Key
     * @param tipAmount SOL Amount (e.g., 0.001)
     */
    public static createTipInstruction(payer: PublicKey, tipAmount: number) {
        // Randomly select one Jito Tip Account
        const randomTipAccount = JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)];

        return SystemProgram.transfer({
            fromPubkey: payer,
            toPubkey: new PublicKey(randomTipAccount),
            lamports: Math.floor(tipAmount * 1_000_000_000), // Convert SOL to Lamports
        });
    }

    /**
     * Send Bundle to Jito Block Engine
     * @param transactions Array of serialized/encoded transactions
     */
    public static async sendBundle(transactions: VersionedTransaction[]) {
        console.log(`🎁 Sending Bundle with ${transactions.length} txs to Jito...`);

        // Serialize transactions to base58
        const encodedTxs = transactions.map(tx => bs58.encode(tx.serialize()));

        try {
            const response = await axios.post(`${JITO_BLOCK_ENGINE_URL}/api/v1/bundles`, {
                jsonrpc: "2.0",
                id: 1,
                method: "sendBundle",
                params: [encodedTxs]
            }, {
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.data.error) {
                throw new Error(JSON.stringify(response.data.error));
            }

            const bundleId = response.data.result;
            console.log(`✅ Jito Bundle Sent! ID: ${bundleId}`);
            return bundleId;
        } catch (error: any) {
            console.error("❌ Jito Bundle Failed:", error.response?.data || error.message);
            throw error;
        }
    }

    public static async getBundleStatus(bundleId: string) {
        // Poll Jito API for status
        // Note: Using the same endpoint but different method
        try {
            const response = await axios.post(`${JITO_BLOCK_ENGINE_URL}/api/v1/bundles`, {
                jsonrpc: "2.0",
                id: 1,
                method: "getBundleStatuses",
                params: [[bundleId]]
            }, {
                headers: { 'Content-Type': 'application/json' }
            });
            return response.data.result;
        } catch (error: any) {
            console.error("❌ Error fetching bundle status:", error.response?.data || error.message);
            return null;
        }
    }
}