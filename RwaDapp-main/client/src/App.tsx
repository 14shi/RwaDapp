import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import Header from "@/components/Header";
import NetworkAlert from "@/components/NetworkAlert";
import HomePage from "@/pages/HomePage";
import AllAssetsPage from "@/pages/AllAssetsPage";
import CreateAssetPage from "@/pages/CreateAssetPage";
import AssetDetailPage from "@/pages/AssetDetailPage";
import MyTokensPage from "@/pages/MyTokensPage";
import SystemAdminPage from "@/pages/SystemAdminPage";
import ChainlinkSetup from "@/pages/chainlink-setup";
import OracleDebugPage from "@/pages/OracleDebugPage";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/assets" component={AllAssetsPage} />
      <Route path="/create" component={CreateAssetPage} />
      <Route path="/assets/:id" component={AssetDetailPage} />
      <Route path="/my-tokens" component={MyTokensPage} />
      <Route path="/admin" component={SystemAdminPage} />
      <Route path="/chainlink-setup" component={ChainlinkSetup} />
      <Route path="/oracle-debug" component={OracleDebugPage} />
      <Route path="/oracle-debug/:id" component={OracleDebugPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <ErrorBoundary>
            <div className="min-h-screen bg-background">
              <Header />
              <NetworkAlert />
              <Router />
            </div>
            <Toaster />
          </ErrorBoundary>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
