import { http, createConfig } from "wagmi";
import { base } from "wagmi/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";

export const config = createConfig({
  chains: [base],
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
