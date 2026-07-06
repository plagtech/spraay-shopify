import { useLoaderData, useSearchParams } from "@remix-run/react";
import {
  Page, Card, Text, Banner, Badge, Button, ButtonGroup,
  BlockStack, InlineStack, EmptyState, DataTable, Collapsible,
} from "@shopify/polaris";
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

export default function History() {
  const { batches, statusFilter } = useLoaderData();
  const [, setSearchParams] = useSearchParams();

  const handleFilter = (status) => {
    setSearchParams(status === "all" ? {} : { status });
  };

  const statusToneMap = {
    pending: "attention",
    submitted: "info",
    confirmed: "success",
    paid: "success",
    failed: "critical",
  };

  const statusDisplayMap = {
    pending: "Pending",
    submitted: "Submitted",
    confirmed: "Confirmed",
    failed: "Failed",
  };

  return (
    <Page title="Payout History" backAction={{ url: "/app" }}>
      <BlockStack gap="500">
        <ButtonGroup variant="segmented">
          {["all", "pending", "confirmed", "failed"].map((s) => (
            <Button
              key={s}
              pressed={statusFilter === s}
              onClick={() => handleFilter(s)}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
        </ButtonGroup>

        {batches.length === 0 ? (
          <Card>
            <EmptyState
              heading="No payouts found"
              action={{ content: "Create Payout", url: "/app/payouts/new" }}
            >
              <p>
                {statusFilter !== "all"
                  ? `No ${statusFilter} payouts. Try a different filter.`
                  : "You haven't sent any payouts yet."}
              </p>
            </EmptyState>
          </Card>
        ) : (
          batches.map((batch) => (
            <BatchCard
              key={batch.id}
              batch={batch}
              statusToneMap={statusToneMap}
            />
          ))
        )}
      </BlockStack>
    </Page>
  );
}

function BatchCard({ batch, statusToneMap }) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="300" blockAlign="center">
            <Badge tone={statusToneMap[batch.status] || undefined}>
              {batch.status}
            </Badge>
            <BlockStack gap="100">
              <Text as="span" variant="headingSm">
                {batch.recipientCount} recipients — ${batch.totalAmount} {batch.token}
              </Text>
              <Text as="span" variant="bodySm" tone="subdued">
                {new Date(batch.createdAt).toLocaleString()} · Chain: {batch.chain}
                {batch.fee && ` · Fee: $${batch.fee}`}
              </Text>
            </BlockStack>
          </InlineStack>
          {batch.txHash && (
            <Button
              variant="plain"
              url={`https://basescan.org/tx/${batch.txHash}`}
              target="_blank"
            >
              BaseScan ↗
            </Button>
          )}
        </InlineStack>

        {batch.recipients.length > 0 && (
          <>
            <Button
              variant="plain"
              onClick={() => setOpen(!open)}
            >
              {open ? "Hide" : "Show"} {batch.recipients.length} recipients
            </Button>
            <Collapsible open={open}>
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
          </>
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
