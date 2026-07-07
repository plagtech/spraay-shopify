import { useLoaderData, useSearchParams } from "@remix-run/react";
import {
  Page, Card, Text, Banner, Badge, Button,
  BlockStack, InlineStack, Box, EmptyState, DataTable, Collapsible,
  Tabs, Divider, Icon, InlineGrid,
} from "@shopify/polaris";
import {
  ExternalSmallIcon, PlusIcon, CashDollarIcon, TeamIcon, ReceiptIcon,
} from "@shopify/polaris-icons";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status") || "all";

  const merchant = await prisma.merchant.findUnique({
    where: { shop: session.shop },
  });

  if (!merchant) {
    return { batches: [], statusFilter };
  }

  const where = { merchantId: merchant.id };
  if (statusFilter !== "all") {
    where.status = statusFilter;
  }

  const batches = await prisma.payoutBatch.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      recipients: {
        select: {
          walletAddress: true,
          amount: true,
          name: true,
          status: true,
        },
      },
    },
  });

  return {
    batches: batches.map((b) => ({
      ...b,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
    })),
    statusFilter,
  };
};

const STATUS_TONE = {
  pending: "attention",
  submitted: "info",
  confirmed: "success",
  paid: "success",
  failed: "critical",
};

const STATUS_LABEL = {
  pending: "Pending",
  submitted: "Submitted",
  confirmed: "Confirmed",
  paid: "Paid",
  failed: "Failed",
};

const TABS = [
  { id: "all", content: "All" },
  { id: "pending", content: "Pending" },
  { id: "confirmed", content: "Confirmed" },
  { id: "failed", content: "Failed" },
];

export default function History() {
  const { batches, statusFilter } = useLoaderData();
  const [, setSearchParams] = useSearchParams();

  const handleFilter = (status) => {
    setSearchParams(status === "all" ? {} : { status });
  };

  const selectedTab = Math.max(0, TABS.findIndex((t) => t.id === statusFilter));

  return (
    <Page
      title="Payout history"
      subtitle="Every batch you've sent, with on-chain proof"
      backAction={{ url: "/app" }}
      primaryAction={{ content: "New payout", url: "/app/payouts/new", icon: PlusIcon }}
    >
      <BlockStack gap="500">
        <Card padding="0">
          <Tabs
            tabs={TABS}
            selected={selectedTab}
            onSelect={(idx) => handleFilter(TABS[idx].id)}
            fitted
          />
        </Card>

        {batches.length === 0 ? (
          <Card>
            <EmptyState
              heading="No payouts found"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              action={{ content: "Create a payout", url: "/app/payouts/new" }}
            >
              <p>
                {statusFilter !== "all"
                  ? `No ${statusFilter} payouts. Try a different filter.`
                  : "You haven't sent any payouts yet. Your batches will appear here once you do."}
              </p>
            </EmptyState>
          </Card>
        ) : (
          <BlockStack gap="400">
            {batches.map((batch) => (
              <BatchCard key={batch.id} batch={batch} />
            ))}
          </BlockStack>
        )}
      </BlockStack>
    </Page>
  );
}

function MiniStat({ icon, label, value }) {
  return (
    <InlineStack gap="200" blockAlign="center">
      <Box background="bg-surface-secondary" padding="150" borderRadius="200">
        <Icon source={icon} tone="subdued" />
      </Box>
      <BlockStack gap="050">
        <Text as="span" variant="bodyXs" tone="subdued">{label}</Text>
        <Text as="span" variant="bodyMd" fontWeight="semibold">{value}</Text>
      </BlockStack>
    </InlineStack>
  );
}

function BatchCard({ batch }) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center" wrap={false} gap="300">
          <InlineStack gap="300" blockAlign="center">
            <Badge tone={STATUS_TONE[batch.status] || undefined}>
              {STATUS_LABEL[batch.status] || batch.status}
            </Badge>
            <BlockStack gap="050">
              <Text as="span" variant="headingSm">
                ${batch.totalAmount} {batch.token}
              </Text>
              <Text as="span" variant="bodySm" tone="subdued">
                {new Date(batch.createdAt).toLocaleString(undefined, {
                  year: "numeric", month: "short", day: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })} · {batch.chain}
              </Text>
            </BlockStack>
          </InlineStack>
          {batch.txHash && (
            <Button
              variant="plain"
              icon={ExternalSmallIcon}
              url={`https://basescan.org/tx/${batch.txHash}`}
              target="_blank"
            >
              BaseScan
            </Button>
          )}
        </InlineStack>

        <Box
          background="bg-surface-secondary"
          padding="300"
          borderRadius="300"
        >
          <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
            <MiniStat icon={TeamIcon} label="Recipients" value={batch.recipientCount} />
            <MiniStat icon={CashDollarIcon} label="Total" value={`$${batch.totalAmount}`} />
            <MiniStat icon={ReceiptIcon} label="Fee" value={batch.fee ? `$${batch.fee}` : "—"} />
          </InlineGrid>
        </Box>

        {batch.recipients.length > 0 && (
          <BlockStack gap="200">
            <Button
              variant="plain"
              disclosure={open ? "up" : "down"}
              onClick={() => setOpen(!open)}
            >
              {open ? "Hide recipients" : `Show ${batch.recipients.length} recipients`}
            </Button>
            <Collapsible open={open} id={`batch-${batch.id}-recipients`}>
              <DataTable
                columnContentTypes={["text", "numeric", "text", "text"]}
                headings={["Address", "Amount", "Name", "Status"]}
                rows={batch.recipients.map((r) => [
                  `${r.walletAddress.slice(0, 8)}...${r.walletAddress.slice(-6)}`,
                  `$${r.amount}`,
                  r.name || "—",
                  r.status,
                ])}
              />
            </Collapsible>
          </BlockStack>
        )}

        {batch.errorMessage && (
          <Banner tone="critical">
            <p>{batch.errorMessage}</p>
          </Banner>
        )}
      </BlockStack>
    </Card>
  );
}
