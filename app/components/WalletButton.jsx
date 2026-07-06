import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useState, useEffect } from "react";
import { Button, Badge, InlineStack, ButtonGroup, Spinner } from "@shopify/polaris";

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [mounted, setMounted] = useState(false);

  // Prevent SSR hydration mismatch — wagmi connectors aren't available server-side
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <Spinner size="small" />;
  }

  if (isConnected && address) {
    return (
      <InlineStack gap="200" blockAlign="center">
        <Badge tone="success">
          {address.slice(0, 6)}...{address.slice(-4)}
        </Badge>
        <Button variant="plain" onClick={() => disconnect()} size="slim">
          Disconnect
        </Button>
      </InlineStack>
    );
  }

  if (isPending) {
    return (
      <InlineStack gap="200" blockAlign="center">
        <Spinner size="small" />
        <span>Connecting...</span>
      </InlineStack>
    );
  }

  return (
    <ButtonGroup>
      {connectors.map((connector) => (
        <Button
          key={connector.uid}
          onClick={() => connect({ connector })}
          variant={connector.name === "Coinbase Wallet" ? "primary" : undefined}
        >
          {connector.name === "Coinbase Wallet"
            ? "🔵 Coinbase Smart Wallet"
            : connector.name === "Injected"
              ? "🦊 MetaMask / Browser Wallet"
              : connector.name}
        </Button>
      ))}
    </ButtonGroup>
  );
}
