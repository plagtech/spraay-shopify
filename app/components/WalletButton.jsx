import { useAccount, useConnect, useDisconnect } from "wagmi";
import { Button, Badge, InlineStack, ButtonGroup } from "@shopify/polaris";

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected) {
    return (
      <InlineStack gap="200" blockAlign="center">
        <Badge tone="success">
          {address.slice(0, 6)}...{address.slice(-4)}
        </Badge>
        <Button variant="plain" onClick={() => disconnect()}>
          Disconnect
        </Button>
      </InlineStack>
    );
  }

  return (
    <ButtonGroup>
      {connectors.map((connector) => (
        <Button
          key={connector.uid}
          onClick={() => connect({ connector })}
        >
          {connector.name === "Coinbase Wallet"
            ? "Coinbase Smart Wallet"
            : connector.name}
        </Button>
      ))}
    </ButtonGroup>
  );
}
