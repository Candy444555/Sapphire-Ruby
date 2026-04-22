import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ChatPage from "@/pages/chat";
import TerminalPage from "@/pages/terminal";
import PhoneLookupPage from "@/pages/phone-lookup";
import GithubPage from "@/pages/github";
import SoftwarePage from "@/pages/software";
import UploadPage from "@/pages/upload";
import ProfilePage from "@/pages/profile";
import SecretsPage from "@/pages/secrets";
import NotFound from "@/pages/not-found";
import { RootModeProvider } from "@/lib/root-mode";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={ChatPage} />
      <Route path="/terminal" component={TerminalPage} />
      <Route path="/phone-lookup" component={PhoneLookupPage} />
      <Route path="/github" component={GithubPage} />
      <Route path="/software" component={SoftwarePage} />
      <Route path="/upload" component={UploadPage} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/secrets" component={SecretsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RootModeProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </RootModeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
