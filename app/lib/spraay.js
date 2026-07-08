/**
 * Spraay Gateway Client
 * Handles CSV parsing and batch payout preparation for the Shopify app.
 * The actual on-chain execution happens client-side via wagmi.
 */

// Batch contract on Base
export const BATCH_CONTRACT = "0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC";
export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const FEE_RECIPIENT = "0x033d3ce3bfd69b1d180869308822075219e771b5";
export const SPRAAY_PAY_ADDRESS = "0xAd62f03C7514bb8c51f1eA70C2b75C37404695c8";

// Batch contract ABI (only the functions we need)
export const BATCH_ABI = [
  {
    name: "sprayToken",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      {
        name: "recipients",
        type: "tuple[]",
        components: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
        ],
      },
    ],
    outputs: [],
  },
  {
    name: "sprayEth",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "recipients",
        type: "tuple[]",
        components: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
        ],
      },
    ],
    outputs: [],
  },
];

// ERC20 ABI for approve
export const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
];

/**
 * Estimate a safe explicit gas limit for a sprayToken batch.
 *
 * We set gas explicitly instead of letting the wallet/RPC auto-estimate.
 * Auto-estimation via MetaMask's default RPC (Infura) was returning an absurd
 * ~140M and getting rejected by Infura's 25M per-tx cap
 * ("exceeds maximum per-tx gas limit"). A fixed limit sidesteps estimation.
 *
 * sprayToken does one ERC20 transferFrom per recipient (plus the fee transfer
 * and contract overhead). ~60k gas/recipient covers the worst case of paying a
 * fresh address (cold 20k SSTORE + transfer costs) with headroom. A 2-recipient
 * batch lands at ~220k; a full 200-recipient batch at ~12.1M — comfortably under
 * Infura's 25M cap.
 *
 * @param {number} recipientCount
 * @returns {bigint} gas limit
 */
export function estimateSprayGas(recipientCount) {
  const BASE = 100000n; // tx base + contract entry + fee transfer + allowance check
  const PER_RECIPIENT = 60000n; // ERC20 transferFrom to a (possibly fresh) address
  const CAP = 24000000n; // stay just under Infura's 25M per-tx limit
  const count = BigInt(Math.max(0, recipientCount || 0));
  const gas = BASE + count * PER_RECIPIENT;
  return gas > CAP ? CAP : gas;
}

/**
 * Parse CSV text into structured recipient list.
 * Expects columns: wallet_address (required), amount (required), name, email, memo
 * Flexible header matching — looks for keywords in column names.
 */
export function parseCSV(csvText) {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) {
    return { recipients: [], errors: ["CSV must have a header row and at least one data row."] };
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const errors = [];

  // Flexible column matching
  const addressIdx = headers.findIndex((h) =>
    ["wallet", "address", "wallet_address", "walletaddress", "recipient"].includes(h)
  );
  const amountIdx = headers.findIndex((h) =>
    ["amount", "value", "payout", "payment"].includes(h)
  );
  const nameIdx = headers.findIndex((h) => ["name", "recipient_name", "full_name"].includes(h));
  const emailIdx = headers.findIndex((h) => ["email", "email_address", "mail"].includes(h));
  const memoIdx = headers.findIndex((h) => ["memo", "note", "description", "reference"].includes(h));

  if (addressIdx === -1) {
    return { recipients: [], errors: ["Missing required column: wallet address (wallet, address, wallet_address, or recipient)"] };
  }
  if (amountIdx === -1) {
    return { recipients: [], errors: ["Missing required column: amount (amount, value, payout, or payment)"] };
  }

  const recipients = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(",").map((c) => c.trim());
    const address = cols[addressIdx] || "";
    const amount = cols[amountIdx] || "";

    // Validate address
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      errors.push(`Row ${i + 1}: Invalid wallet address "${address}"`);
      continue;
    }

    // Validate amount
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      errors.push(`Row ${i + 1}: Invalid amount "${amount}"`);
      continue;
    }

    recipients.push({
      walletAddress: address,
      amount: amount,
      name: nameIdx !== -1 ? cols[nameIdx] || "" : "",
      email: emailIdx !== -1 ? cols[emailIdx] || "" : "",
      memo: memoIdx !== -1 ? cols[memoIdx] || "" : "",
    });
  }

  if (recipients.length > 200) {
    errors.push(`Batch exceeds maximum of 200 recipients (got ${recipients.length}). Split into multiple batches.`);
    return { recipients: [], errors };
  }

  const totalAmount = recipients
    .reduce((sum, r) => sum + parseFloat(r.amount), 0)
    .toFixed(6);

  const feeAmount = (parseFloat(totalAmount) * 0.003).toFixed(6); // 0.3% fee

  return { recipients, errors, totalAmount, feeAmount };
}

/**
 * Generate a sample CSV template
 */
export function sampleCSV() {
  return `wallet_address,amount,name,email,memo
0x1234567890abcdef1234567890abcdef12345678,100.00,Alice,alice@example.com,January payment
0xabcdefabcdefabcdefabcdefabcdefabcdefabcd,75.50,Bob,bob@example.com,Affiliate payout`;
}
