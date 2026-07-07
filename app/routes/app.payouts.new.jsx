import { useState, useCallback, useEffect, useRef } from "react";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page, Card, Text, Banner, Button, BlockStack,
  InlineStack, DataTable, DropZone, Badge, Link,
  Box, Divider, InlineGrid, Icon, TextField, Spinner,
} from "@shopify/polaris";
import {
  WalletIcon, CashDollarIcon, TeamIcon, ReceiptIcon,
  ImportIcon, ExportIcon, ArrowLeftIcon, CheckCircleIcon,
  ExternalIcon, InfoIcon, RefreshIcon, ArrowRightIcon,
} from "@shopify/polaris-icons";
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
      title="New payout"
      subtitle="Send USDC to many recipients in one on-chain transaction"
      backAction={{ url: "/app" }}
      primaryAction={primaryAction}
    >
      <BlockStack gap="500">

        {/* Wallet Card — always visible */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="200" blockAlign="center">
                <Icon source={WalletIcon} tone="base" />
                <Text as="h2" variant="headingMd">Your wallet</Text>
              </InlineStack>
              {isConnected && <Badge tone="success">Connected</Badge>}
            </InlineStack>

            <WalletButton />

            {isConnected && (
              <Box background="bg-surface-secondary" padding="300" borderRadius="300">
                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                  <BlockStack gap="050">
                    <Text as="p" variant="bodyXs" tone="subdued">USDC balance</Text>
                    <Text as="p" variant="headingLg">${balanceFormatted}</Text>
                  </BlockStack>
                  <BlockStack gap="050">
                    <Text as="p" variant="bodyXs" tone="subdued">Network</Text>
                    <Text as="p" variant="headingLg">Base</Text>
                  </BlockStack>
                </InlineGrid>
              </Box>
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
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">Upload recipients</Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Upload a CSV with your payout recipients. Required columns:{" "}
                  <Text as="span" fontWeight="semibold">wallet_address</Text> and{" "}
                  <Text as="span" fontWeight="semibold">amount</Text> (in USDC). Optional: name, email, memo.
                </Text>
              </BlockStack>

              <Box background="bg-surface-info" padding="300" borderRadius="300">
                <InlineStack gap="300" blockAlign="start" wrap={false}>
                  <Box paddingBlockStart="050">
                    <Icon source={InfoIcon} tone="info" />
                  </Box>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm">
                      <Text as="span" fontWeight="semibold">wallet_address</Text> — the recipient's Ethereum/Base wallet (starts with 0x)
                    </Text>
                    <Text as="p" variant="bodySm">
                      <Text as="span" fontWeight="semibold">amount</Text> — how much USDC to send (e.g. 100.00)
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Don't have wallet addresses? Recipients can create a free Coinbase Wallet in under a minute.
                    </Text>
                  </BlockStack>
                </InlineStack>
              </Box>

              <DropZone onDrop={handleFileUpload} accept=".csv" type="file" variableHeight>
                <DropZone.FileUpload actionHint="Accepts .csv files" />
              </DropZone>

              <TextField
                label="Or paste CSV directly"
                value={csvText}
                onChange={setCsvText}
                placeholder={sampleContent}
                multiline={8}
                monospaced
                autoComplete="off"
              />

              <InlineStack gap="200" wrap>
                <Button variant="primary" icon={ImportIcon} onClick={handleParse}>
                  Parse & review
                </Button>
                <Button onClick={() => setCsvText(sampleContent)}>
                  Load sample data
                </Button>
                <Button variant="plain" icon={ExportIcon} onClick={handleDownloadTemplate}>
                  Download CSV template
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        {/* STEP: Review */}
        {step === STEPS.REVIEW && parsed && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Review payout</Text>

              {parseErrors.length > 0 && (
                <Banner tone="warning">
                  <Text as="p" variant="bodySm">
                    {parseErrors.length} row(s) skipped due to errors. Valid recipients shown below.
                  </Text>
                </Banner>
              )}

              <Box background="bg-surface-secondary" padding="400" borderRadius="300">
                <InlineGrid columns={{ xs: 2, sm: 4 }} gap="400">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodyXs" tone="subdued">Recipients</Text>
                    <Text as="p" variant="headingLg">{parsed.recipients.length}</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodyXs" tone="subdued">Payout total</Text>
                    <Text as="p" variant="headingLg">${parsed.totalAmount}</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodyXs" tone="subdued">Fee (0.3%)</Text>
                    <Text as="p" variant="headingLg">${parsed.feeAmount}</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodyXs" tone="subdued">Total cost</Text>
                    <Text as="p" variant="headingLg" fontWeight="bold">${totalWithFee}</Text>
                  </BlockStack>
                </InlineGrid>
              </Box>

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

              <Divider />

              <InlineStack align="space-between" blockAlign="center">
                <Button
                  icon={ArrowLeftIcon}
                  onClick={() => { setStep(STEPS.UPLOAD); setParsed(null); setParseErrors([]); }}
                >
                  Back to upload
                </Button>
                {isConnected && hasSufficientBalance && (
                  <Button variant="primary" icon={ArrowRightIcon} onClick={handleSend}>
                    {needsApproval ? "Approve & send" : "Send payout"}
                  </Button>
                )}
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        {/* STEP: Transaction Progress */}
        {[STEPS.APPROVING, STEPS.EXECUTING, STEPS.RECORDING, STEPS.DONE].includes(step) && (
          <Card>
            <BlockStack gap="500">
              <InlineStack gap="200" blockAlign="center">
                {step === STEPS.DONE
                  ? <Icon source={CheckCircleIcon} tone="success" />
                  : <Spinner size="small" />}
                <Text as="h2" variant="headingMd">
                  {step === STEPS.DONE ? "Payout complete" : "Sending payout…"}
                </Text>
              </InlineStack>

              <BlockStack gap="0">
                {progressSteps.map((s, i) => {
                  if (s.skipped) return null;
                  const state = s.done ? "done" : s.active ? "active" : "pending";
                  return (
                    <Box key={s.key}>
                      {i > 0 && <Box paddingBlock="100"><Divider /></Box>}
                      <InlineStack gap="300" blockAlign="center">
                        <StepIndicator state={state} />
                        <Text
                          as="span"
                          variant="bodyMd"
                          fontWeight={state === "pending" ? "regular" : "semibold"}
                          tone={state === "pending" ? "subdued" : undefined}
                        >
                          {s.label}
                        </Text>
                        {state === "done" && (
                          <Box><Badge tone="success">Done</Badge></Box>
                        )}
                        {state === "active" && (
                          <Box><Badge tone="attention">In progress</Badge></Box>
                        )}
                      </InlineStack>
                    </Box>
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
                <BlockStack gap="400">
                  <Banner tone="success">
                    <Text as="p" variant="bodyMd">
                      {parsed?.recipients.length} recipients paid a total of ${parsed?.totalAmount} USDC.
                      Each recipient's USDC was sent directly from your wallet.
                    </Text>
                  </Banner>
                  <InlineStack gap="200" wrap>
                    <Button variant="primary" url="/app">
                      Back to dashboard
                    </Button>
                    <Button icon={ExternalIcon} url={`https://basescan.org/tx/${sprayHash}`} target="_blank">
                      View on BaseScan
                    </Button>
                    <Button variant="plain" icon={RefreshIcon} onClick={handleStartOver}>
                      Send another payout
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
                  <Text as="p" variant="bodyMd" fontWeight="semibold">Transaction failed</Text>
                  <Text as="p" variant="bodySm">{txError}</Text>
                </BlockStack>
              </Banner>
              <Text as="p" variant="bodySm" tone="subdued">
                No funds were sent. You can retry or go back and edit your recipient list.
              </Text>
              <InlineStack gap="200">
                <Button variant="primary" icon={ArrowLeftIcon} onClick={handleRetry}>
                  Back to review
                </Button>
                <Button icon={RefreshIcon} onClick={handleStartOver}>
                  Start over
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        {/* Help section — always at bottom */}
        {step === STEPS.UPLOAD && (
          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingSm">How it works</Text>
              <BlockStack gap="300">
                {[
                  "Upload a CSV with wallet addresses and amounts.",
                  "Review the payout summary and confirm recipients.",
                  "Approve USDC spending (one-time per amount).",
                  "Sign the batch transaction — all recipients are paid in one go.",
                ].map((text, i) => (
                  <InlineStack key={i} gap="300" blockAlign="center" wrap={false}>
                    <Box
                      background="bg-fill-brand"
                      minWidth="24px"
                      padding="050"
                      borderRadius="full"
                    >
                      <div style={{ width: "24px", textAlign: "center" }}>
                        <Text as="span" variant="bodySm" fontWeight="bold" tone="text-inverse">
                          {i + 1}
                        </Text>
                      </div>
                    </Box>
                    <Text as="p" variant="bodyMd">{text}</Text>
                  </InlineStack>
                ))}
              </BlockStack>
              <Divider />
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

function StepIndicator({ state }) {
  if (state === "done") {
    return <Icon source={CheckCircleIcon} tone="success" />;
  }
  if (state === "active") {
    return <Spinner size="small" />;
  }
  return (
    <div
      style={{
        width: "20px",
        height: "20px",
        borderRadius: "50%",
        border: "2px solid var(--p-color-border)",
        boxSizing: "border-box",
      }}
    />
  );
}
