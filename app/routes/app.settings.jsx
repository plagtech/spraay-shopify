import { useState } from "react";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page, Card, Text, Banner, Button, TextField,
  BlockStack, InlineStack, Layout, List,
} from "@shopify/polaris";
import { useAccount } from "wagmi";
import { WalletButton } from "../components/WalletButton";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  let merchant = await prisma.merchant.findUnique({
    where: { shop: session.shop },
  });

  if (!merchant) {
    merchant = await prisma.merchant.create({
      data: { shop: session.shop },
    });
  }

  return {
    shop: session.shop,
    walletAddress: merchant.walletAddress || "",
    apiKey: merchant.apiKey || "",
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const walletAddress = formData.get("walletAddress")?.toString().trim() || null;
  const apiKey = formData.get("apiKey")?.toString().trim() || null;

  if (walletAddress && !walletAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
    return { error: "Invalid wallet address format." };
  }

  await prisma.merchant.upsert({
    where: { shop: session.shop },
    update: { walletAddress, apiKey },
    create: { shop: session.shop, walletAddress, apiKey },
  });

  return { success: true };
};

export default function Settings() {
  const { shop, walletAddress: savedWallet, apiKey: savedApiKey } = useLoaderData();
  const fetcher = useFetcher();
  const { address, isConnected } = useAccount();

  const [walletAddress, setWalletAddress] = useState(savedWallet);
  const [apiKey, setApiKey] = useState(savedApiKey);

  const isSaving = fetcher.state !== "idle";
  const saved = fetcher.data?.success;
  const saveError = fetcher.data?.error;

  const handleSave = () => {
    const formData = new FormData();
    formData.set("walletAddress", walletAddress);
    formData.set("apiKey", apiKey);
    fetcher.submit(formData, { method: "POST" });
  };

  const handleUseConnected = () => {
    if (address) setWalletAddress(address);
  };

  return (
    <Page title="Settings" backAction={{ url: "/app" }}>
      <BlockStack gap="500">
        {saved && (
          <Banner tone="success" onDismiss={() => {}}>
            <p>Settings saved successfully.</p>
          </Banner>
        )}

        {saveError && (
          <Banner tone="critical" onDismiss={() => {}}>
            <p>{saveError}</p>
          </Banner>
        )}

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Store</Text>
            <Text as="p" variant="bodyMd">{shop}</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Payouts are sent on Base network using USDC.
            </Text>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Connected Wallet</Text>
            <WalletButton />
            <Text as="p" variant="bodySm" tone="subdued">
              This wallet signs payout transactions. You can also save a default wallet address below.
            </Text>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Payout Configuration</Text>

            <InlineStack gap="200" blockAlign="end">
              <div style={{ flexGrow: 1 }}>
                <TextField
                  label="Default Wallet Address"
                  value={walletAddress}
                  onChange={setWalletAddress}
                  placeholder="0x..."
                  monospaced
                  helpText="The wallet address that will sign batch payout transactions."
                />
              </div>
              {isConnected && (
                <Button size="slim" onClick={handleUseConnected}>
                  Use Connected
                </Button>
              )}
            </InlineStack>

            <TextField
              label="Spraay API Key (optional)"
              value={apiKey}
              onChange={setApiKey}
              placeholder="sk_..."
              monospaced
              helpText="Optional. Used for advanced features like scheduled payouts and Shopify Flow integration."
            />

            <Button variant="primary" onClick={handleSave} loading={isSaving}>
              Save Settings
            </Button>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">About Spraay Payouts</Text>
            <Text as="p" variant="bodyMd">
              Spraay enables batch USDC payouts on Base — pay suppliers, affiliates,
              creators, and employees in a single transaction.
            </Text>
            <List>
              <List.Item>Non-custodial — USDC goes directly from your wallet to recipients</List.Item>
              <List.Item>0.3% fee per batch (paid on-chain to Spraay Protocol)</List.Item>
              <List.Item>Up to 200 recipients per batch</List.Item>
              <List.Item>All transactions verifiable on BaseScan</List.Item>
            </List>
            <Button variant="plain" url="https://docs.spraay.app" target="_blank">
              Documentation ↗
            </Button>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
