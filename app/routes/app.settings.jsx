import { useState } from "react";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page, Card, Text, Banner, Button, TextField,
  BlockStack, InlineStack, Box, Layout, List, Icon, Badge,
} from "@shopify/polaris";
import {
  StoreIcon, WalletIcon, ExternalSmallIcon,
} from "@shopify/polaris-icons";
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
    <Page
      title="Settings"
      subtitle="Configure your store's payout wallet and integrations"
      backAction={{ url: "/app" }}
    >
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

        <Layout>
          <Layout.AnnotatedSection
            id="store"
            title="Store"
            description="The Shopify store these payouts belong to. Batches settle in USDC on the Base network."
          >
            <Card>
              <BlockStack gap="300">
                <InlineStack gap="300" blockAlign="center">
                  <Box background="bg-surface-secondary" padding="200" borderRadius="200">
                    <Icon source={StoreIcon} tone="base" />
                  </Box>
                  <BlockStack gap="050">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">{shop}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">Connected store</Text>
                  </BlockStack>
                </InlineStack>
                <InlineStack gap="200">
                  <Badge tone="info">Base network</Badge>
                  <Badge tone="success">USDC</Badge>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.AnnotatedSection>

          <Layout.AnnotatedSection
            id="wallet"
            title="Connected wallet"
            description="This wallet signs and funds your batch payouts. USDC moves directly from it to your recipients — Spraay is non-custodial and never holds your funds."
          >
            <Card>
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <Icon source={WalletIcon} tone="subdued" />
                  <Text as="h3" variant="headingSm">Wallet connection</Text>
                </InlineStack>
                <WalletButton />
                <Text as="p" variant="bodySm" tone="subdued">
                  Supported: Coinbase Smart Wallet, MetaMask, and other browser wallets.
                </Text>
              </BlockStack>
            </Card>
          </Layout.AnnotatedSection>

          <Layout.AnnotatedSection
            id="configuration"
            title="Payout configuration"
            description="Set a default wallet address for signing batches, and optionally connect a Spraay API key for advanced automation."
          >
            <Card>
              <BlockStack gap="400">
                <InlineStack gap="200" blockAlign="end">
                  <div style={{ flexGrow: 1 }}>
                    <TextField
                      label="Default wallet address"
                      value={walletAddress}
                      onChange={setWalletAddress}
                      placeholder="0x..."
                      monospaced
                      autoComplete="off"
                      helpText="The wallet address that will sign batch payout transactions."
                    />
                  </div>
                  {isConnected && (
                    <Button size="slim" onClick={handleUseConnected}>
                      Use connected
                    </Button>
                  )}
                </InlineStack>

                <TextField
                  label="Spraay API key (optional)"
                  value={apiKey}
                  onChange={setApiKey}
                  placeholder="sk_..."
                  monospaced
                  autoComplete="off"
                  helpText="Optional. Used for advanced features like scheduled payouts and Shopify Flow integration."
                />

                <InlineStack align="end">
                  <Button variant="primary" onClick={handleSave} loading={isSaving}>
                    Save settings
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.AnnotatedSection>

          <Layout.AnnotatedSection
            id="about"
            title="About Spraay Payouts"
            description="Pay suppliers, affiliates, creators, and employees in a single on-chain transaction."
          >
            <Card>
              <BlockStack gap="300">
                <List>
                  <List.Item>Non-custodial — USDC goes directly from your wallet to recipients</List.Item>
                  <List.Item>0.3% fee per batch, paid on-chain to Spraay Protocol</List.Item>
                  <List.Item>Up to 200 recipients per batch</List.Item>
                  <List.Item>Every transaction is verifiable on BaseScan</List.Item>
                </List>
                <Box>
                  <Button
                    variant="plain"
                    icon={ExternalSmallIcon}
                    url="https://docs.spraay.app"
                    target="_blank"
                  >
                    Documentation
                  </Button>
                </Box>
              </BlockStack>
            </Card>
          </Layout.AnnotatedSection>
        </Layout>
      </BlockStack>
    </Page>
  );
}
