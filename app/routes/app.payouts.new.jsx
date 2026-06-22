import { useState, useCallback } from "react";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page, Card, Text, Banner, Button, ButtonGroup, BlockStack,
  InlineStack, Box, DataTable, DropZone, Badge,
} from "@shopify/polaris";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { parseUnits } from "viem";
import { WalletButton } from "../components/WalletButton";
import {
  parseCSV,
  sampleCSV,
  BATCH_CONTRACT,
  USDC_BASE,
  BATCH_ABI,
  ERC20_ABI,
} from "../lib/spraay";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return { sampleCSV: sampleCSV() };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "record") {
    const txHash = formData.get("txHash");
    const totalAmount = formData.get("totalAmount");
    const recipientCount = parseInt(formData.get("recipientCount"), 10);
    const recipientsJson = formData.get("recipients");
    const recipients = JSON.parse(recipientsJson);

    let merchant = await prisma.merchant.findUnique({
      where: { shop: session.shop },
    });

    if (!merchant) {
      merchant = await prisma.merchant.create({
        data: { shop: session.shop },
      });
    }

    const batch = await prisma.payoutBatch.create({
      data: {
        merchantId: merchant.id,
        status: txHash ? "submitted" : "failed",
        totalAmount,
        recipientCount,
        txHash: txHash || null,
        fee: (parseFloat(totalAmount) * 0.003).toFixed(6),
        recipients: {
          create: recipients.map((r) => ({
            walletAddress: r.walletAddress,
            amount: r.amount,
            name: r.name || null,
            email: r.email || null,
            memo: r.memo || null,
            status: txHash ? "paid" : "failed",
          })),
        },
      },
    });

    return { recorded: true, batchId: batch.id };
  }

  return { error: "Unknown intent" };
};

export default function NewPayout() {
  const { sampleCSV: sampleContent } = useLoaderData();
  const fetcher = useFetcher();
  const { address, isConnected } = useAccount();

  const [step, setStep] = useState("upload");
  const [csvText, setCsvText] = useState("");
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);

  const { writeContract: writeApprove, data: approveHash, isPending: isApproving } = useWriteContract();
  const { writeContract: writeSpray, data: sprayHash, isPending: isSpraying } = useWriteContract();

  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveHash });

  const { isLoading: isSprayConfirming, isSuccess: isSprayConfirmed } =
    useWaitForTransactionReceipt({ hash: sprayHash });

  const { data: currentAllowance } = useReadContract({
    address: USDC_BASE,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, BATCH_CONTRACT] : undefined,
    query: { enabled: !!address },
  });

  const { data: usdcBalance } = useReadContract({
    address: USDC_BASE,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const handleFileUpload = useCallback((_files, acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target.result);
    reader.readAsText(file);
  }, []);

  const handleParse = useCallback(() => {
    if (!csvText.trim()) {
      setError("Please paste or upload CSV data.");
      return;
    }
    const result = parseCSV(csvText);
    if (result.errors.length > 0 && result.recipients.length === 0) {
      setError(result.errors.join("\n"));
      return;
    }
    setParsed(result);
    setError(result.errors.length > 0 ? result.errors.join("\n") : null);
    setStep("review");
  }, [csvText]);

  const handleApprove = useCallback(() => {
    if (!parsed) return;
    const totalWithFee = parseFloat(parsed.totalAmount) * 1.003;
    const amount = parseUnits(totalWithFee.toFixed(6), 6);
    writeApprove({
      address: USDC_BASE,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [BATCH_CONTRACT, amount],
    });
    setStep("approve");
  }, [parsed, writeApprove]);

  const handleExecute = useCallback(() => {
    if (!parsed) return;
    const recipients = parsed.recipients.map((r) => ({
      to: r.walletAddress,
      amount: parseUnits(r.amount, 6),
    }));
    writeSpray({
      address: BATCH_CONTRACT,
      abi: BATCH_ABI,
      functionName: "sprayToken",
      args: [USDC_BASE, recipients],
    });
    setStep("execute");
  }, [parsed, writeSpray]);

  const handleRecord = useCallback(() => {
    if (!parsed || !sprayHash) return;
    const formData = new FormData();
    formData.set("intent", "record");
    formData.set("txHash", sprayHash);
    formData.set("totalAmount", parsed.totalAmount);
    formData.set("recipientCount", parsed.recipients.length.toString());
    formData.set("recipients", JSON.stringify(parsed.recipients));
    fetcher.submit(formData, { method: "POST" });
    setStep("done");
  }, [parsed, sprayHash, fetcher]);

  if (step === "approve" && isApproveConfirmed) {
    handleExecute();
  }
  if (step === "execute" && isSprayConfirmed && fetcher.state === "idle" && step !== "done") {
    handleRecord();
  }

  const balanceFormatted = usdcBalance
    ? (Number(usdcBalance) / 1e6).toFixed(2)
    : "—";

  const needsApproval = parsed && currentAllowance !== undefined
    ? currentAllowance < parseUnits((parseFloat(parsed.totalAmount) * 1.003).toFixed(6), 6)
    : true;

  return (
    <Page
      title="New Payout"
      backAction={{ url: "/app" }}
      primaryAction={
        step === "review" && isConnected
          ? {
              content: needsApproval ? "Approve & Send" : "Send Payout",
              onAction: needsApproval ? handleApprove : handleExecute,
            }
          : undefined
      }
    >
      <BlockStack gap="500">
        {/* Wallet */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Wallet</Text>
            <WalletButton />
            {isConnected && (
              <Text as="p" variant="bodySm" tone="subdued">
                USDC Balance: ${balanceFormatted}
              </Text>
            )}
          </BlockStack>
        </Card>

        {error && (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: "12px" }}>{error}</pre>
          </Banner>
        )}

        {/* Step 1: Upload */}
        {step === "upload" && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Upload Recipients</Text>
              <Text as="p" variant="bodyMd">
                Upload a CSV with columns: <strong>wallet_address</strong> (required),{" "}
                <strong>amount</strong> (required), name, email, memo
              </Text>

              <DropZone onDrop={handleFileUpload} accept=".csv" type="file">
                <DropZone.FileUpload actionHint="Accepts .csv files" />
              </DropZone>

              <Text as="p" variant="bodySm" tone="subdued">Or paste CSV directly:</Text>
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={sampleContent}
                rows={8}
                style={{
                  width: "100%",
                  fontFamily: "monospace",
                  fontSize: "13px",
                  padding: "8px",
                  border: "1px solid var(--p-color-border)",
                  borderRadius: "8px",
                  resize: "vertical",
                }}
              />

              <ButtonGroup>
                <Button variant="primary" onClick={handleParse}>Parse CSV</Button>
                <Button onClick={() => setCsvText(sampleContent)}>Load Sample</Button>
              </ButtonGroup>
            </BlockStack>
          </Card>
        )}

        {/* Step 2: Review */}
        {step === "review" && parsed && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Review Payout</Text>

              <InlineStack gap="600">
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">Recipients</Text>
                  <Text as="p" variant="headingLg">{parsed.recipients.length}</Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">Total Amount</Text>
                  <Text as="p" variant="headingLg">${parsed.totalAmount} USDC</Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">Fee (0.3%)</Text>
                  <Text as="p" variant="headingLg">${parsed.feeAmount} USDC</Text>
                </BlockStack>
              </InlineStack>

              <DataTable
                columnContentTypes={["text", "numeric", "text", "text"]}
                headings={["Address", "Amount", "Name", "Memo"]}
                rows={parsed.recipients.map((r) => [
                  `${r.walletAddress.slice(0, 8)}...${r.walletAddress.slice(-6)}`,
                  `$${r.amount}`,
                  r.name || "—",
                  r.memo || "—",
                ])}
              />

              {!isConnected && (
                <Banner tone="warning">
                  <p>Connect your wallet above to proceed with the payout.</p>
                </Banner>
              )}

              <Button onClick={() => { setStep("upload"); setParsed(null); }}>
                Back to Upload
              </Button>
            </BlockStack>
          </Card>
        )}

        {/* Step 3+: Progress */}
        {(step === "approve" || step === "execute" || step === "done") && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Transaction Progress</Text>

              <BlockStack gap="200">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="span">{isApproveConfirmed ? "✅" : isApproveConfirming || isApproving ? "⏳" : "○"}</Text>
                  <Text as="span" variant="bodyMd">Approve USDC spend</Text>
                </InlineStack>
                <InlineStack gap="200" blockAlign="center">
                  <Text as="span">{isSprayConfirmed ? "✅" : isSprayConfirming || isSpraying ? "⏳" : "○"}</Text>
                  <Text as="span" variant="bodyMd">Execute batch payout</Text>
                </InlineStack>
                <InlineStack gap="200" blockAlign="center">
                  <Text as="span">{step === "done" ? "✅" : fetcher.state !== "idle" ? "⏳" : "○"}</Text>
                  <Text as="span" variant="bodyMd">Record payout</Text>
                </InlineStack>
              </BlockStack>

              {step === "done" && (
                <>
                  <Banner tone="success">
                    <p>Payout complete! {parsed?.recipients.length} recipients paid ${parsed?.totalAmount} USDC.</p>
                  </Banner>
                  <ButtonGroup>
                    <Button url={`https://basescan.org/tx/${sprayHash}`} target="_blank">
                      View on BaseScan
                    </Button>
                    <Button variant="primary" url="/app">Back to Dashboard</Button>
                  </ButtonGroup>
                </>
              )}
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
