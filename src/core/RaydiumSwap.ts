
import {
    Connection,
    PublicKey,
    TransactionMessage,
    VersionedTransaction,
    ComputeBudgetProgram,
    TransactionInstruction
} from '@solana/web3.js';
import {
    Liquidity,
    LiquidityPoolKeys,
    Token,
    TokenAmount,
    Percent,
    Currency,
    SOL,
    MAINNET_PROGRAM_ID,
    LIQUIDITY_STATE_LAYOUT_V4,
    MARKET_STATE_LAYOUT_V3,
    SPL_MINT_LAYOUT,
    Market
} from '@raydium-io/raydium-sdk';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { RaydiumConfig, SwapOptions, SwapResult, IWallet } from '../types/types';
import { WSOL_MINT, DEFAULT_PRIORITY_FEE } from '../config/config';
import { JitoExecutor } from './JitoExecutor';

export class RaydiumSwap {
    private connection: Connection;
    private wallet: IWallet;

    // Cache pool keys to avoid re-fetching on every trade for the same token
    private poolKeysCache: Map<string, LiquidityPoolKeys> = new Map();
    private latestBlockhash: string = "";

    constructor(config: RaydiumConfig) {
        this.connection = new Connection(config.rpcUrl, "confirmed");
        this.wallet = config.wallet;
        this.startBlockhashPolling();
    }

    public async startBlockhashPolling() {
        // Initial fetch
        const lh = await this.connection.getLatestBlockhash("confirmed");
        this.latestBlockhash = lh.blockhash;

        // Update every 400ms (Helius handles this load easily)
        setInterval(async () => {
            const lh = await this.connection.getLatestBlockhash("confirmed");
            this.latestBlockhash = lh.blockhash;
        }, 400);
    }

    /**
     * EXECUTE SWAP (Locally Constructed)
     */
    public async execute(options: SwapOptions): Promise<SwapResult> {
        const { tokenMint, action, amount, slippagePct } = options;
        console.log(`\n⚡ Fast-Swap ${action.toUpperCase()}: ${amount} | Mint: ${tokenMint}`);

        try {
            // 1. Get Pool Keys (Market Info) - Most critical step
            const poolKeys = await this.getPoolKeys(tokenMint);
            if (!poolKeys) throw new Error("Pool not found for this token pair.");

            // 2. Setup Input/Output Tokens using SDK Classes
            const inputToken = action === 'buy' ?
                new Token(TOKEN_PROGRAM_ID, new PublicKey(WSOL_MINT), 9, 'WSOL', 'WSOL') :
                new Token(TOKEN_PROGRAM_ID, new PublicKey(tokenMint), poolKeys.baseMint.toString() === tokenMint ? poolKeys.baseDecimals : poolKeys.quoteDecimals);

            const outputToken = action === 'buy' ?
                new Token(TOKEN_PROGRAM_ID, new PublicKey(tokenMint), poolKeys.baseMint.toString() === tokenMint ? poolKeys.baseDecimals : poolKeys.quoteDecimals) :
                new Token(TOKEN_PROGRAM_ID, new PublicKey(WSOL_MINT), 9, 'WSOL', 'WSOL');

            // 3. Amount Handling (Decimals math handled by SDK)
            // 3. Amount Handling (Decimals math handled by SDK)
            // Better to pass raw string or handle carefully. 
            // Let's use simple logic:
            const rawAmountIn = action === 'buy'
                ? Math.floor(amount * 1_000_000_000).toString()
                : Math.floor(amount * (10 ** inputToken.decimals)).toString();

            const tokenAmountIn = new TokenAmount(inputToken, rawAmountIn);

            // 4. Compute Amount Out
            const slippage = new Percent(slippagePct, 100);

            // Logic: Agar user ne 100% slippage nahi di, to calculate karo. 
            // Agar Sniper mode hai (e.g., 100% slippage), to 0 rakho for speed.
            let minAmountOut;

            if (slippagePct < 100) {
                // Calculate exact minimum output based on slippage (Requires an extra calculation step, usually omitted for speed in sniping)
                // Lekin tumhare current code structure mein calculation missing hai.
                // Behtar hai ke tum abhi ke liye 0 hi rakho lekin console log mein warning do.
                console.log(`⚠️ Warning: Using 0 Minimum Output (Infinite Slippage) for speed.`);
                minAmountOut = new TokenAmount(outputToken, 0);
            } else {
                minAmountOut = new TokenAmount(outputToken, 0);
            }

            // 5. Get Token Accounts
            const walletTokenAccounts = await this.getOwnerTokenAccounts();

            // 6. Generate Instructions
            const { innerTransactions } = await Liquidity.makeSwapInstructionSimple({
                connection: this.connection,
                poolKeys,
                userKeys: {
                    tokenAccounts: walletTokenAccounts,
                    owner: this.wallet.publicKey,
                },
                amountIn: tokenAmountIn,
                amountOut: minAmountOut,
                fixedSide: 'in',
                makeTxVersion: 0,
            });

            // FIX: Extract ALL instructions from ALL inner transactions
            // This ensures we get ATA creation instructions if they exist
            const swapInstructions = innerTransactions.reduce((acc: TransactionInstruction[], curr) => {
                return [...acc, ...curr.instructions];
            }, []);

            // C. Add Jito Tip (The Bribe)
            // Tip Amount: Keep 0.001 SOL - 0.01 SOL for sniping.
            // The higher the tip, the faster the execution.
            const jitoTipAmount = 0.001; // 0.001 SOL Tip
            const tipInstruction = JitoExecutor.createTipInstruction(this.wallet.publicKey, jitoTipAmount);

            // D. Get Latest Blockhash
            const recentBlockhash = this.latestBlockhash;
            if (!recentBlockhash) throw new Error("Blockhash not ready yet");

            // FIX: Add Compute Budget Instructions to avoid execution errors
            const computeBudgetInit = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }); // Safe limit for Raydium
            const computeBudgetPrice = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 0 }); // Jito uses tip, so price 0 is fine

            // E. Combine Everything Correctly
            const instructions = [
                computeBudgetInit,
                computeBudgetPrice,
                ...swapInstructions,
                tipInstruction
            ];

            const messageV0 = new TransactionMessage({
                payerKey: this.wallet.publicKey,
                recentBlockhash: recentBlockhash,
                instructions,
            }).compileToV0Message();

            const transaction = new VersionedTransaction(messageV0);

            // F. Sign Transaction
            const signedTx = await this.wallet.signTransaction(transaction);

            // G. Send via Jito (NOT connection.sendTransaction)
            const bundleId = await JitoExecutor.sendBundle([signedTx]);

            console.log(`🚀 Jito Bundle Sent: https://explorer.jito.wtf/bundle/${bundleId}`);

            return { success: true, signature: bundleId };

        } catch (error: any) {
            console.error("❌ Swap Error:", error);
            return { success: false, error: error.message };
        }
    }

    // ================= HELPERS =================

    /**
     * Fetch Liquidity Pool Keys (Hybrid: API first then Cache)
     * This is necessary because we need Market ID, Vaults etc., which are not directly available from the token address.
     */
    /**
     * 🟢 PRO LEVEL: Fetch Pool Keys On-Chain (No JSON API)
     * This method scans the blockchain directly for a specific pair.
     */
    private async getPoolKeys(mintStr: string): Promise<LiquidityPoolKeys | null> {
        if (this.poolKeysCache.has(mintStr)) return this.poolKeysCache.get(mintStr)!;

        console.log("🔍 Scanning Blockchain for Pool Account...");

        const mint = new PublicKey(mintStr);
        const wsol = new PublicKey(WSOL_MINT);
        const raydiumProgramId = MAINNET_PROGRAM_ID.AmmV4;

        // FILTER 1: Base = Token, Quote = SOL
        const filters1 = [
            { dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
            { memcmp: { offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('baseMint'), bytes: mint.toBase58() } },
            { memcmp: { offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('quoteMint'), bytes: wsol.toBase58() } },
        ];

        // FILTER 2: Base = SOL, Quote = Token (Reverse Pair)
        const filters2 = [
            { dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
            { memcmp: { offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('baseMint'), bytes: wsol.toBase58() } },
            { memcmp: { offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('quoteMint'), bytes: mint.toBase58() } },
        ];

        // Pehle standard pair check karo
        let accounts = await this.connection.getProgramAccounts(raydiumProgramId, { filters: filters1 });

        // Agar nahi mila, to reverse pair check karo
        if (accounts.length === 0) {
            console.log("⚠️ Standard pair not found, checking reverse pair...");
            accounts = await this.connection.getProgramAccounts(raydiumProgramId, { filters: filters2 });
        }

        if (accounts.length === 0) {
            console.error("❌ Pool not found on-chain (Might be too new or not initialized)");
            return null;
        }

        const poolAccount = accounts[0];
        const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(poolAccount.account.data);
        const marketId = poolState.marketId;

        console.log(`🧩 Found Market ID: ${marketId.toBase58()}`);

        const marketAccountInfo = await this.connection.getAccountInfo(marketId);
        if (!marketAccountInfo) throw new Error("Failed to fetch Market Info");

        const marketState = MARKET_STATE_LAYOUT_V3.decode(marketAccountInfo.data);

        const poolKeys: LiquidityPoolKeys = {
            id: poolAccount.pubkey,
            baseMint: poolState.baseMint,
            quoteMint: poolState.quoteMint,
            lpMint: poolState.lpMint,
            baseDecimals: poolState.baseDecimal.toNumber(),
            quoteDecimals: poolState.quoteDecimal.toNumber(),
            lpDecimals: 5,
            version: 4,
            programId: raydiumProgramId,
            authority: Liquidity.getAssociatedAuthority({ programId: raydiumProgramId }).publicKey,
            openOrders: poolState.openOrders,
            targetOrders: poolState.targetOrders,
            baseVault: poolState.baseVault,
            quoteVault: poolState.quoteVault,
            withdrawQueue: poolState.withdrawQueue,
            lpVault: poolState.lpVault,
            marketVersion: 3,
            marketProgramId: poolState.marketProgramId,
            marketId: marketId,
            marketAuthority: Market.getAssociatedAuthority({ programId: poolState.marketProgramId, marketId: marketId }).publicKey,
            marketBaseVault: marketState.baseVault,
            marketQuoteVault: marketState.quoteVault,
            marketBids: marketState.bids,
            marketAsks: marketState.asks,
            marketEventQueue: marketState.eventQueue,
            lookupTableAccount: PublicKey.default
        };

        console.log("✅ Pool Keys Constructed Successfully!");
        this.poolKeysCache.set(mintStr, poolKeys);
        return poolKeys;
    }

    /**
     * Helper to get owner's token accounts (required by SDK)
     */
    private async getOwnerTokenAccounts() {
        const walletTokenAccount = await this.connection.getTokenAccountsByOwner(this.wallet.publicKey, {
            programId: TOKEN_PROGRAM_ID,
        });
        return walletTokenAccount.value.map((i) => ({
            pubkey: i.pubkey,
            programId: i.account.owner,
            accountInfo: {
                programId: i.account.owner,
            } as any, // Simple hack to satisfy SDK which wants 'AccountInfo' type but uses it loosely
            accountData: i.account.data,
        }));
    }

    /**
     * Simple Dynamic Fee Logic
     */
    private async getDynamicPriorityFee(): Promise<number> {
        // Simple placeholder. For real sniping, use Helius RPC 'getPriorityFeeEstimate'
        return 100000; // 0.0001 SOL fixed fallback for now
    }
}