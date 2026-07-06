import { useState, useCallback, useEffect, useRef } from "react";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page, Card, Text, Banner, Button, ButtonGroup, BlockStack,
  InlineStack, DataTable, DropZone, Badge, Link,
} from "@shopify/polaris";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { parseUnits, formatUnits } from "viem";
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
        status: "confirmed",
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
            status: "paid",
          })),
        },
      },
    });

    return { recorded: true, batchId: batch.id };
  }

  return { error: "Unknown intent" };
};

// Steps: upload → review → approving → approved → executing → confirmed → recording → done
// Also: error (recoverable)
const STEPS = {
  UPLOAD: "upload",
  REVIEW: "review",
  APPROVING: "approving",
  EXECUTING: "executing",
  RECORDING: "recording",
  DONE: "done",
  ERROR: "error",
};

export default function NewPayout() {
  const { sampleCSV: sampleContent } = useLoaderData();
  const fetcher = useFetcher();
  const { address, isConnected } = useAccount();

  const [step, setStep] = useState(STEPS.UPLOAD);
  const [csvText, setCsvText] = useState("");
  const [parsed, setParsed] = useState(null);
  const [parseErrors, setParseErrors] = useState([]);
  const [txError, setTxError] = useState(null);

  // Prevent double-fire of effects
  const executeCalled = useRef(false);
  const recordCalled = useRef(false);

  // --- wagmi hooks ---
  const {
    writeContract: writeApprove,
    data: approveHash,
    isPending: isApproving,
    error: approveError,
    reset: resetApprove,
  } = useWriteContract();

  const {
    writeContract: writeSpray,
    data: sprayHash,
    isPending: isSpraying,
    error: sprayError,
    reset: resetSpray,
  } = useWriteContract();

  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveHash });

  const { isLoading: isSprayConfirming, isSuccess: isSprayConfirmed } =
    useWaitForTransactionReceipt({ hash: sprayHash });

  const { data: currentAllowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_BASE,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, BATCH_CONTRACT] : undefined,
    query: { enabled: !!address },
  });

  const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
    address: USDC_BASE,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // --- Computed values ---
  const balanceFormatted = usdcBalance
    ? parseFloat(formatUnits(usdcBalance, 6)).toFixed(2)
    : "—";

  const totalWithFee = parsed
    ? (parseFloat(parsed.totalAmount) * 1.003).toFixed(6)
    : "0";

  const needsApproval = parsed && currentAllowance !== undefined
    ? currentAllowance < parseUnits(totalWithFee, 6)
    : true;

  const hasSufficientBalance = parsed && usdcBalance !== undefined
    ? usdcBalance >= parseUnits(totalWithFee, 6)
    : false;

  // --- State machine transitions via useEffect ---

  // After approve confirms → execute spray
  useEffect(() => {
    if (step === STEPS.APPROVING && isApproveConfirmed && !executeCalled.current) {
      executeCalled.current = true;
      refetchAllowance();
      setStep(STEPS.EXECUTING);
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
    }
  }, [step, isApproveConfirmed, parsed, writeSpray, refetchAllowance]);

  // After spray confirms → record to DB
  useEffect(() => {
    if (step === STEPS.EXECUTING && isSprayConfirmed && sprayHash && !recordCalled.current) {
      recordCalled.current = true;
      setStep(STEPS.RECORDING);
      const formData = new FormData();
      formData.set("intent", "record");
      formData.set("txHash", sprayHash);
      formData.set("totalAmount", parsed.totalAmount);
      formData.set("recipientCount", parsed.recipients.length.toString());
      formData.set("recipients", JSON.stringify(parsed.recipients));
      fetcher.submit(formData, { method: "POST" });
    }
  }, [step, isSprayConfirmed, sprayHash, parsed, fetcher]);

  // After DB record completes → done
  useEffect(() => {
    if (step === STEPS.RECORDING && fetcher.state === "idle" && fetcher.data?.recorded) {
      setStep(STEPS.DONE);
      refetchBalance();
    }
  }, [step, fetcher.state, fetcher.data, refetchBalance]);

  // Handle wallet errors
  useEffect(() => {
    if (approveError && step === STEPS.APPROVING) {
      setTxError(approveError.shortMessage || approveError.message || "Approval rejected");
      setStep(STEPS.ERROR);
    }
    if (sprayError && step === STEPS.EXECUTING) {
      setTxError(sprayError.shortMessage || sprayError.message || "Transaction rejected");
      setStep(STEPS.ERROR);
    }
  }, [approveError, sprayError, step]);

  // --- Handlers ---

  const handleFileUpload = useCallback((_files, acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target.result);
    reader.readAsText(file);
  }, []);

  const handleParse = useCallback(() => {
    if (!csvText.trim()) {
      setParseErrors(["Please paste or upload CSV data."]);
      return;
    }
    const result = parseCSV(csvText);
    if (result.errors.length > 0 && result.recipients.length === 0) {
      setParseErrors(result.errors);
      return;
    }
    setParsed(result);
    setParseErrors(result.errors); // warnings for partial success
    setStep(STEPS.REVIEW);
  }, [csvText]);

  const handleSend = useCallback(() => {
    if (!parsed || !isConnected) return;

    // Reset refs for new attempt
    executeCalled.current = false;
    recordCalled.current = false;
    resetApprove();
    resetSpray();
    setTxError(null);

    if (needsApproval) {
      // Step 1: Approve USDC spend
      setStep(STEPS.APPROVING);
      const amount = parseUnits(totalWithFee, 6);
      writeApprove({
        address: USDC_BASE,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [BATCH_CONTRACT, amount],
      });
    } else {
      // Already approved — skip to spray
      setStep(STEPS.EXECUTING);
      executeCalled.current = true;
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
    }
  }, [parsed, isConnected, needsApproval, totalWithFee, writeApprove, writeSpray, resetApprove, resetSpray]);

  const handleRetry = useCallback(() => {
    executeCalled.current = false;
    recordCalled.current = false;
    resetApprove();
    resetSpray();
    setTxError(null);
    setStep(STEPS.REVIEW);
  }, [resetApprove, resetSpray]);

  const handleStartOver = useCallback(() => {
    executeCalled.current = false;
    recordCalled.current = false;
    resetApprove();
    resetSpray();
    setTxError(null);
    setParsed(null);
    setCsvText("");
    setParseErrors([]);
    setStep(STEPS.UPLOAD);
  }, [resetApprove, resetSpray]);

  const handleDownloadTemplate = useCallback(() => {
    const blob = new Blob([sampleContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "spraay-payout-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [sampleContent]);

  // --- Progress indicator ---
  const progressSteps = [
    { key: "approve", label: "Approve USDC", done: isApproveConfirmed, active: step === STEPS.APPROVING, skipped: !needsApproval },
    { key: "execute", label: "Send batch payout", done: isSprayConfirmed, active: step === STEPS.EXECUTING },
    { key: "record", label: "Save to history", done: step === STEPS.DONE, active: step === STEPS.RECORDING },
  ];

  // --- Primary action for page header ---
  let primaryAction;
  if (step === STEPS.REVIEW && isConnected && hasSufficientBalance) {
    primaryAction = {
      content: needsApproval ? "Approve & Send" : "Send Payout",
      onAction: handleSend,
    };
  }

  return (
    <Page
      title="New Payout"
      backAction={{ url: "/app" }}
      primaryAction={primaryAction}
    >
      <BlockStack gap="500">

        {/* Wallet Card — always visible */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">Your Wallet</Text>
              {isConnected && (
                <Badge tone="success">Connected</Badge>
              )}
            </InlineStack>

            <WalletButton />

            {isConnected && (
              <InlineStack gap="400">
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">USDC Balance</Text>
                  <Text as="p" variant="headingSm">${balanceFormatted}</Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">Network</Text>
                  <Text as="p" variant="headingSm">Base</Text>
                </BlockStack>
              </InlineStack>
            )}

            {!isConnected && (
              <Text as="p" variant="bodySm" tone="subdued">
                Connect a wallet to send payouts. Supported: Coinbase Smart Wallet, MetaMask, and other browser wallets.
                Your USDC goes directly to recipients — Spraay never holds your funds.
              </Text>
            )}
          </BlockStack>
        </Card>

        {/* Parse errors */}
        {parseErrors.length > 0 && step === STEPS.UPLOAD && (
          <Banner tone="critical" onDismiss={() => setParseErrors([])}>
            <BlockStack gap="100">
              {parseErrors.map((e, i) => (
                <Text key={i} as="p" variant="bodySm">{e}</Text>
              ))}
            </BlockStack>
          </Banner>
        )}

        {/* STEP: Upload */}
        {step === STEPS.UPLOAD && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Upload Recipients</Text>
              <Text as="p" variant="bodyMd">
                Upload a CSV with your payout recipients. Required columns:{" "}
                <strong>wallet_address</strong> and <strong>amount</strong> (in USDC).
                Optional: name, email, memo.
              </Text>

              <Banner tone="info">
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm">
                    <strong>wallet_address</strong> — The recipient's Ethereum/Base wallet (starts with 0x)
                  </Text>
                  <Text as="p" variant="bodySm">
                    <strong>amount</strong> — How much USDC to send (e.g. 100.00)
                  </Text>
                  <Text as="p" variant="bodySm">
                    Don't have wallet addresses? Recipients can create a free Coinbase Wallet in under a minute.
                  </Text>
                </BlockStack>
              </Banner>

              <DropZone onDrop={handleFileUpload} accept=".csv" type="file" variableHeight>
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
                  padding: "12px",
                  border: "1px solid var(--p-color-border)",
                  borderRadius: "8px",
                  resize: "vertical",
                  backgroundColor: "var(--p-color-bg-surface-secondary)",
                }}
              />

              <InlineStack gap="200">
                <Button variant="primary" onClick={handleParse}>
                  Parse & Review
                </Button>
                <Button onClick={() => setCsvText(sampleContent)}>
                  Load Sample Data
                </Button>
                <Button variant="plain" onClick={handleDownloadTemplate}>
                  Download CSV Template
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        {/* STEP: Review */}
        {step === STEPS.REVIEW && parsed && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Review Payout</Text>

              {parseErrors.length > 0 && (
                <Banner tone="warning">
                  <Text as="p" variant="bodySm">
                    {parseErrors.length} row(s) skipped due to errors. Valid recipients shown below.
                  </Text>
                </Banner>
              )}

              <InlineStack gap="600" wrap>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">Recipients</Text>
                  <Text as="p" variant="headingLg">{parsed.recipients.length}</Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">Payout Total</Text>
                  <Text as="p" variant="headingLg">${parsed.totalAmount} USDC</Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Fee (0.3%)
                  </Text>
                  <Text as="p" variant="headingLg">${parsed.feeAmount} USDC</Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">Total Cost</Text>
                  <Text as="p" variant="headingLg" fontWeight="bold">
                    ${totalWithFee} USDC
                  </Text>
                </BlockStack>
              </InlineStack>

              <DataTable
                columnContentTypes={["text", "numeric", "text", "text"]}
                headings={["Address", "Amount (USDC)", "Name", "Memo"]}
                rows={parsed.recipients.map((r) => [
                  `${r.walletAddress.slice(0, 8)}...${r.walletAddress.slice(-6)}`,
                  `$${parseFloat(r.amount).toFixed(2)}`,
                  r.name || "—",
                  r.memo || "—",
                ])}
                footerContent={`${parsed.recipients.length} recipients · $${totalWithFee} USDC total (incl. fee)`}
              />

              {!isConnected && (
                <Banner tone="warning">
                  <p>Connect your wallet above to send this payout.</p>
                </Banner>
              )}

              {isConnected && !hasSufficientBalance && (
                <Banner tone="critical">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodyMd">
                      Insufficient balance. You need ${totalWithFee} USDC but have ${balanceFormatted}.
                    </Text>
                    <Text as="p" variant="bodySm">
                      Fund your wallet with USDC on Base.{" "}
                      <Link url="https://pay.coinbase.com" target="_blank">
                        Buy USDC via Coinbase →
                      </Link>
                    </Text>
                  </BlockStack>
                </Banner>
              )}

              <InlineStack gap="200">
                <Button onClick={() => { setStep(STEPS.UPLOAD); setParsed(null); setParseErrors([]); }}>
                  ← Back to Upload
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        {/* STEP: Transaction Progress */}
        {[STEPS.APPROVING, STEPS.EXECUTING, STEPS.RECORDING, STEPS.DONE].includes(step) && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                {step === STEPS.DONE ? "Payout Complete" : "Sending Payout..."}
              </Text>

              <BlockStack gap="300">
                {progressSteps.map((s) => {
                  if (s.skipped) return null;
                  let icon = "○";
                  let tone = "subdued";
                  if (s.done) { icon = "✅"; tone = undefined; }
                  else if (s.active) { icon = "⏳"; tone = undefined; }

                  return (
                    <InlineStack key={s.key} gap="200" blockAlign="center">
                      <Text as="span" variant="bodyMd">{icon}</Text>
                      <Text as="span" variant="bodyMd" tone={tone}>{s.label}</Text>
                    </InlineStack>
                  );
                })}
              </BlockStack>

              {(step === STEPS.APPROVING || step === STEPS.EXECUTING) && (
                <Banner tone="info">
                  <Text as="p" variant="bodySm">
                    {step === STEPS.APPROVING
                      ? "Please confirm the approval in your wallet. This allows the batch contract to transfer USDC on your behalf."
                      : "Please confirm the payout transaction in your wallet. This sends USDC directly to all recipients."}
                  </Text>
                </Banner>
              )}

              {step === STEPS.DONE && (
                <BlockStack gap="300">
                  <Banner tone="success">
                    <Text as="p" variant="bodyMd">
                      {parsed?.recipients.length} recipients paid a total of ${parsed?.totalAmount} USDC.
                      Each recipient's USDC was sent directly from your wallet.
                    </Text>
                  </Banner>
                  <InlineStack gap="200">
                    <Button url={`https://basescan.org/tx/${sprayHash}`} target="_blank">
                      View on BaseScan
                    </Button>
                    <Button variant="primary" url="/app">
                      Back to Dashboard
                    </Button>
                    <Button variant="plain" onClick={handleStartOver}>
                      Send Another Payout
                    </Button>
                  </InlineStack>
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        )}

        {/* STEP: Error (recoverable) */}
        {step === STEPS.ERROR && (
          <Card>
            <BlockStack gap="400">
              <Banner tone="critical">
                <BlockStack gap="100">
                  <Text as="p" variant="bodyMd">Transaction failed</Text>
                  <Text as="p" variant="bodySm">{txError}</Text>
                </BlockStack>
              </Banner>
              <Text as="p" variant="bodySm" tone="subdued">
                No funds were sent. You can retry or go back and edit your recipient list.
              </Text>
              <InlineStack gap="200">
                <Button variant="primary" onClick={handleRetry}>
                  Back to Review
                </Button>
                <Button onClick={handleStartOver}>
                  Start Over
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        {/* Help section — always at bottom */}
        {step === STEPS.UPLOAD && (
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">How it works</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                1. Upload a CSV with wallet addresses and amounts
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                2. Review the payout summary and confirm recipients
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                3. Approve USDC spending (one-time per amount)
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                4. Sign the batch transaction — all recipients are paid in one go
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                USDC goes directly from your wallet to each recipient on the Base network.
                Spraay charges 0.3% per batch. Transactions are verifiable on BaseScan.
              </Text>
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
