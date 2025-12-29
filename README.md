# 🌪️ Solana Raydium Jito Sniper

> **A high-speed, professional-grade Solana trading bot module integrated with Jito Block Engine for atomic, bribed transaction execution on Raydium.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Solana](https://img.shields.io/badge/Solana-Web3.js-black.svg)](https://solana.com/)
[![Raydium](https://img.shields.io/badge/Raydium-V4/AMM-purple.svg)](https://raydium.io/)
[![Jito](https://img.shields.io/badge/Jito-MEV-green.svg)](https://www.jito.wtf/)

This module is designed for performance and reliability, bypassing standard RPC transaction propagation by using **Jito Bundles**. This ensures higher inclusion rates, protection against sandwich attacks (MEV), and blazing-fast execution for sniping.

---

## ✨ Key Features

- **🚀 Jito Bundle Integration**: Sends transactions directly to the Jito Block Engine (Amsterdam/Mainnet), carrying a "tip" (bribe) to validators for expedited processing.
- **⚡ Background Blockhash Polling**: Latency killer! Fetches and caches the latest blockhash in the background (400ms interval), ensuring **instant** transaction creation when you trigger a swap.
- **🛡️ Atomic Transactions**: Swaps and Jito Tips are bundled into a single atomic transaction—if the tip fails, the swap fails (and vice-versa).
- **🔎 Bundle Confirmation Logic**: Automatically polls the Jito API to confirm if your bundle was accepted or dropped.
- **🔁 Reverse Pool Support**: Smartly handles both `Base=Token` and `Base=SOL` pairs, allowing you to trade any token regardless of how the pool was initialized.
- **🏎️ Sniper Mode (Local Math)**: Bypasses slow `fetchInfo` network calls by using local math and accepting 100% slippage for maximum speed.
- **🔢 Auto-Decimal Logic**: Automatically handles token decimal math, removing the need for hardcoded values.
- **🏗️ OOP Architecture**: Clean, modular TypeScript `RaydiumSwap` class that separates logic (Core), configuration (Config), and execution (Jito).

---

## 🛠️ Prerequisites

- **Node.js** (v18 or higher)
- **Solana Wallet** with a small amount of SOL (for tips + gas).
- **Helius RPC URL** (or any fast RPC like Quicknode/Triton) for rapid on-chain data fetching.

---

## 📦 Installation

1. **Clone and Install:**

   ```bash
   git clone <REPO_URL>
   cd solana-raydium-module
   npm install
   ```

2. **Configure Environment:**

   Create a `.env` file in the root directory:

   ```bash
   cp .env.example .env
   ```

   Add your credentials:

   ```env
   # Your Private Key (Base58 String)
   PRIVATE_KEY=your_private_key_here

   # Fast RPC URL (Recommended: Helius)
   HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=...
   ```

---

## 🚀 Usage

### Run the Bot (Dynamic Command Line Arguments)

No need to edit the code for every trade. Simply provide the Token Address and Buy Amount (SOL) as arguments.

```bash
npm run dev <TOKEN_MINT> [AMOUNT_SOL]
```

**Example:**

```bash
# Buy 0.1 SOL worth of USDC
npm run dev EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v 0.1
```

**What happens next?**
1.  **Scanner**: Finds the Raydium Pool on-chain (Standard or Reverse).
2.  **Sniper**: Checks background cache for blockhash, constructs transaction instantly using local math.
3.  **Executor**: Sends atomic bundle to Jito Block Engine.
4.  **Confirm**: Polls Jito API to confirm the bundle status (Landed or Dropped).

### Output Preview:

```
🔥 Initializing Sniper for Token: EPjFW...
wv Buying Amount: 0.1 SOL

🔍 Scanning Blockchain for Pool Account...
🧩 Found Market ID: ...
✅ Pool Keys Constructed Successfully!
⚡ Fast-Swap BUY: 0.1 | Mint: EPjFW...
🧮 Fast-Swap: Skipping pre-calculation for max speed...

🚀 Bundle Sent! ID: 3e8f...a9b
⏳ Waiting for Jito Confirmation...
🔎 Status: landed
✅ BUNDLE LANDED SUCCESSFULLY!
```

---

## 📂 Project Structure

```
src/
├── config/
│   └── config.ts       # Jito Block Engine URLs, Tip Accounts, Constants
├── core/
│   ├── JitoExecutor.ts # Handles Tip instruction creation & Bundle submission + Status Polling
│   └── RaydiumSwap.ts  # Main Logic: Pool finding (Reverse/Std), Swap construction, Jito handoff
├── types/
│   └── types.ts        # Interfaces for Wallet, Config, and Options
└── index.ts            # Entry point (Main Execution Script, CLI Args)
```

## ⚠️ Disclaimer

**Use at your own risk.** Trading on Solana (especially sniping) carries financial risk. This software is provided "as is" without warranty of any kind. Ensure you understand how Jito Tips work before increasing bribe amounts.
