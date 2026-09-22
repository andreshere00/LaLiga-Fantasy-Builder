import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { NeedsReauthError } from "../api/errors";
import { AuthProvider, useAuth } from "../auth/AuthProvider";
import { GatePanel } from "../features/gates/GatePanel";
import { LeagueProvider } from "../features/lineup/LeagueProvider";
import { LineupPage } from "../features/lineup/LineupPage";
import { MarketPage } from "../features/market/MarketPage";
import { Header } from "../features/shell/Header";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) =>
        !(error instanceof NeedsReauthError) && failureCount < 1,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
  },
});

function LineupRoute() {
  const { status } = useAuth();
  if (status !== "ready") return <GatePanel status={status} />;
  return <LineupPage />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <LeagueProvider>
            <Header />
            <main className="app-main">
              <Routes>
                <Route path="/" element={<LineupRoute />} />
                <Route path="/market" element={<MarketPage />} />
              </Routes>
            </main>
          </LeagueProvider>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
