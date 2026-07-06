import { useLoaderData } from "@remix-run/react";
import {
  Page, Card, Text, Layout, Banner, Badge, EmptyState,
  BlockStack, InlineStack, Box, Button, ResourceList, ResourceItem,
} from "@shopify/polaris";
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

  const totalBatches = await prisma.payoutBatch.count({
    where: { merchantId: merchant.id },
  });

  const confirmedBatches = await prisma.payoutBatch.findMany({
    where: { merchantId: merchant.id, status: { in: ["confirmed", "submitted"] } },
    select: { totalAmount: true, recipientCount: true },
  });

  const totalPaid = confirmedBatches
    .reduce((sum, b) => sum + parseFloat(b.totalAmount), 0)
    .toFixed(2);

  const totalRecipients = confirmedBatches.reduce(
    (sum, b) => sum + b.recipientCount,
    0
  );

  const recentBatches = await prisma.payoutBatch.findMany({
    where: { merchantId: merchant.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      status: true,
      totalAmount: true,
      recipientCount: true,
      token: true,
      txHash: true,
      createdAt: true,
    },
  });

  return {
    shop: session.shop,
    stats: { totalBatches, totalPaid, totalRecipients },
    recentBatches: recentBatches.map((b) => ({
      ...b,
      createdAt: b.createdAt.toISOString(),
    })),
    hasWallet: !!merchant.walletAddress,
  };
};

export default function Dashboard() {
  const { shop, stats, recentBatches, hasWallet } = useLoaderData();

  const statusToneMap = {
    pending: "attention",
    submitted: "info",
    confirmed: "success",
    failed: "critical",
  };

  return (
    <Page title="Spraay Payouts">
      <BlockStack gap="500">
        {!hasWallet && (
          <Banner tone="warning" title="Wallet not configured">
            <p>Connect your wallet in Settings to start sending payouts.</p>
          </Banner>
        )}

        <Text as="p" variant="bodyMd" tone="subdued">
          Batch USDC payouts for {shop}
        </Text>

        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">Total Batches</Text>
                <Text as="p" variant="heading2xl">{stats.totalBatches}</Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">Total Paid</Text>
                <Text as="p" variant="heading2xl">${stats.totalPaid}</Text>
                <Text as="p" variant="bodySm" tone="subdued">USDC on Base</Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">Recipients Paid</Text>
                <Text as="p" variant="heading2xl">{stats.totalRecipients}</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Recent Payouts</Text>

            {recentBatches.length === 0 ? (
              <EmptyState
                heading="No payouts yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                action={{ content: "Create Payout", url: "/app/payouts/new" }}
              >
                <p>Upload a CSV or pull recipients from your Shopify data to send your first batch payout.</p>
              </EmptyState>
            ) : (
              <ResourceList
                items={recentBatches}
                renderItem={(batch) => (
                  <ResourceItem id={batch.id}>
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="300" blockAlign="center">
                        <Badge tone={statusToneMap[batch.status] || undefined}>
                          {batch.status}
                        </Badge>
                        <BlockStack gap="100">
                          <Text as="span" variant="bodyMd" fontWeight="semibold">
                            {batch.recipientCount} recipients — ${batch.totalAmount} {batch.token}
                          </Text>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {new Date(batch.createdAt).toLocaleDateString()}
                          </Text>
                        </BlockStack>
                      </InlineStack>
                      {batch.txHash && (
                        <Button
                          variant="plain"
                          url={`https://basescan.org/tx/${batch.txHash}`}
                          target="_blank"
                        >
                          View tx
                        </Button>
                      )}
                    </InlineStack>
                  </ResourceItem>
                )}
              />
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
