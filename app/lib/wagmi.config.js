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
    [base.id]: http(),
  },
  ssr: true,
});
