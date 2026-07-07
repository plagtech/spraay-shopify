import { useLoaderData } from "@remix-run/react";
import {
  Page, Card, Text, Banner, Badge, EmptyState,
  BlockStack, InlineStack, Box, Button, Icon, InlineGrid, Divider,
} from "@shopify/polaris";
import {
  PlusIcon, OrderIcon, CashDollarIcon, TeamIcon,
  ArrowRightIcon, ExternalSmallIcon, WalletIcon,
} from "@shopify/polaris-icons";
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

const STATUS_TONE = {
  pending: "attention",
  submitted: "info",
  confirmed: "success",
  failed: "critical",
};

const STATUS_LABEL = {
  pending: "Pending",
  submitted: "Submitted",
  confirmed: "Confirmed",
  failed: "Failed",
};

function StatCard({ label, value, caption, icon, tone }) {
  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h3" variant="headingSm" tone="subdued">{label}</Text>
          <Box background="bg-surface-secondary" padding="150" borderRadius="200">
            <Icon source={icon} tone={tone} />
          </Box>
        </InlineStack>
        <Text as="p" variant="heading2xl">{value}</Text>
        {caption && (
          <Text as="p" variant="bodySm" tone="subdued">{caption}</Text>
        )}
      </BlockStack>
    </Card>
  );
}

export default function Dashboard() {
  const { shop, stats, recentBatches, hasWallet } = useLoaderData();

  return (
    <Page
      title="Dashboard"
      subtitle={`Batch USDC payouts on Base · ${shop}`}
      primaryAction={{
        content: "New payout",
        url: "/app/payouts/new",
        icon: PlusIcon,
      }}
      secondaryActions={[
        { content: "View history", url: "/app/history" },
      ]}
    >
      <BlockStack gap="500">
        {!hasWallet && (
          <Banner
            tone="warning"
            title="Connect a wallet to start sending payouts"
            action={{ content: "Go to Settings", url: "/app/settings" }}
          >
            <p>You'll need a connected wallet to fund and sign batch payouts on Base.</p>
          </Banner>
        )}

        <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
          <StatCard
            label="Total batches"
            value={stats.totalBatches}
            caption="Payouts sent all-time"
            icon={OrderIcon}
            tone="base"
          />
          <StatCard
            label="Total paid"
            value={`$${stats.totalPaid}`}
            caption="USDC on Base"
            icon={CashDollarIcon}
            tone="success"
          />
          <StatCard
            label="Recipients paid"
            value={stats.totalRecipients}
            caption="Across all batches"
            icon={TeamIcon}
            tone="info"
          />
        </InlineGrid>

        <Card padding="0">
          <Box padding="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">Recent payouts</Text>
              {recentBatches.length > 0 && (
                <Button variant="plain" url="/app/history" icon={ArrowRightIcon}>
                  View all
                </Button>
              )}
            </InlineStack>
          </Box>
          <Divider />

          {recentBatches.length === 0 ? (
            <Box padding="400">
              <EmptyState
                heading="No payouts yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                action={{ content: "Create your first payout", url: "/app/payouts/new" }}
              >
                <p>Upload a CSV of wallet addresses and amounts to send USDC to many recipients in a single transaction.</p>
              </EmptyState>
            </Box>
          ) : (
            <BlockStack gap="0">
              {recentBatches.map((batch, i) => (
                <Box key={batch.id}>
                  {i > 0 && <Divider />}
                  <Box padding="400">
                    <InlineStack align="space-between" blockAlign="center" wrap={false} gap="300">
                      <InlineStack gap="300" blockAlign="center">
                        <Box background="bg-surface-secondary" padding="200" borderRadius="full">
                          <Icon source={WalletIcon} tone="subdued" />
                        </Box>
                        <BlockStack gap="050">
                          <Text as="span" variant="bodyMd" fontWeight="semibold">
                            ${batch.totalAmount} {batch.token}
                            <Text as="span" variant="bodyMd" tone="subdued">
                              {" "}· {batch.recipientCount} recipients
                            </Text>
                          </Text>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {new Date(batch.createdAt).toLocaleDateString(undefined, {
                              year: "numeric", month: "short", day: "numeric",
                            })}
                          </Text>
                        </BlockStack>
                      </InlineStack>
                      <InlineStack gap="300" blockAlign="center">
                        <Badge tone={STATUS_TONE[batch.status] || undefined}>
                          {STATUS_LABEL[batch.status] || batch.status}
                        </Badge>
                        {batch.txHash && (
                          <Button
                            variant="plain"
                            icon={ExternalSmallIcon}
                            url={`https://basescan.org/tx/${batch.txHash}`}
                            target="_blank"
                          >
                            Tx
                          </Button>
                        )}
                      </InlineStack>
                    </InlineStack>
                  </Box>
                </Box>
              ))}
            </BlockStack>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
