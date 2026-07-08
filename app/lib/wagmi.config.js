import { http, createConfig } from "wagmi";
import { base } from "wagmi/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";

export const config = createConfig({
  chains: [base],
  // Disable EIP-6963 multi-provider auto-discovery. MetaMask announces itself
  // over EIP-6963, which duplicated the explicit injected({ target: "metaMask" })
  // connector below and produced two MetaMask buttons. With discovery off, only
  // the connectors configured here appear — one Coinbase, one MetaMask.
  multiInjectedProviderDiscovery: false,
  connectors: [
    coinbaseWallet({
      appName: "Spraay Payouts",
      preference: "all",
    }),
    injected({ target: "metaMask" }),
  ],
  transports: {
    // Explicit Base public RPC instead of the viem/wallet default (which can
    // route through Infura and its restrictive 25M per-tx gas cap). This
    // transport is used by wagmi's read hooks (allowance/balance) and
    // useWaitForTransactionReceipt. Note: the actual sprayToken send still goes
    // through the connected wallet's own RPC — that's why we also set an
    // explicit gas limit on the write. Swap in an Alchemy Base URL here if you
    // want dedicated throughput.
    [base.id]: http("https://mainnet.base.org"),
  },
  ssr: true,
});
