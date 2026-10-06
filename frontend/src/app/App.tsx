import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { NeedsReauthError } from "../api/errors";
import { AuthProvider, useAuth } from "../auth/AuthProvider";
import { GatePanel } from "../features/gates/GatePanel";
import { LeagueProvider } from "../features/lineup/LeagueProvider";
import { LineupPage } from "../features/lineup/LineupPage";
import { MarketPage } from "../features/market/MarketPage";
import { PlayerDetailPage } from "../features/players/PlayerDetailPage";
import { PlayersPage } from "../features/players/PlayersPage";
import { Footer } from "../features/shell/Footer";
import { Header } from "../features/shell/Header";
import { AppErrorBoundary } from "./AppErrorBoundary";
import { ContactPage } from "./ContactPage";
import { NotFoundPage } from "./NotFoundPage";

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
          <AppErrorBoundary>
            <LeagueProvider>
              <div className="app-shell">
                <Header />
                <main className="app-main">
                  <Routes>
                    <Route path="/" element={<LineupRoute />} />
                    <Route path="/market" element={<MarketPage />} />
                    <Route path="/players" element={<PlayersPage />} />
                    <Route path="/players/:playerId" element={<PlayerDetailPage />} />
                    <Route path="/contact" element={<ContactPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </main>
                <Footer />
              </div>
            </LeagueProvider>
          </AppErrorBoundary>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
