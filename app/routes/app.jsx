import { Outlet, useLoaderData } from "@remix-run/react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { authenticate } from "../shopify.server";
import { WalletProvider } from "../components/WalletProvider";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <WalletProvider>
        <ui-nav-menu>
          <a href="/app" rel="home">Dashboard</a>
          <a href="/app/payouts/new">New Payout</a>
          <a href="/app/history">History</a>
          <a href="/app/settings">Settings</a>
        </ui-nav-menu>
        <Outlet />
      </WalletProvider>
    </AppProvider>
  );
}
