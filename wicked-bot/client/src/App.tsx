import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider, useAuth } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { TopBar } from "@/components/top-bar";
import Login from "@/pages/login";
import Overview from "@/pages/overview";
import Commands from "@/pages/commands";
import PlayerLookup from "@/pages/players";
import BotControls from "@/pages/bot-controls";
import Configuration from "@/pages/configuration";
import Settings from "@/pages/settings";
import Members from "@/pages/members";
import Protection from "@/pages/protection";
import Exemptions from "@/pages/exemptions";
import LoyalMembers from "@/pages/loyal-members";
import ActivityLogs from "@/pages/activity-logs";
import Moderators from "@/pages/moderators";
import Music from "@/pages/music";
import SpamKicks from "@/pages/spam-kicks";
import Admins from "@/pages/admins";
import Chat from "@/pages/chat";
import KickBanLogs from "@/pages/kick-ban-logs";
import BlacklistHitlist from "@/pages/blacklist";
import StreamPage from "@/pages/stream";
import DedicatePage from "@/pages/dedicate";
import SecretMessages from "@/pages/secret-messages";
import FeaturesAdmin from "@/pages/features-admin";
import FeatureStatus from "@/pages/feature-status";
import PageProtection from "@/pages/page-protection";
import Clubs from "@/pages/clubs";
import PageProtectionWrapper from "@/components/page-protection-wrapper";
import FeatureGate from "@/components/feature-gate";

function WrappedPage({ pageId, Component }: { pageId: string; Component: React.ComponentType }) {
  return (
    <PageProtectionWrapper pageId={pageId}>
      <Component />
    </PageProtectionWrapper>
  );
}

function ProtectedRoutes() {
  return (
    <Switch>
      <Route path="/" component={Overview} />
      <Route path="/controls">{() => <WrappedPage pageId="controls" Component={BotControls} />}</Route>
      <Route path="/configuration">{() => <WrappedPage pageId="configuration" Component={Configuration} />}</Route>
      <Route path="/settings">{() => <WrappedPage pageId="settings" Component={Settings} />}</Route>
      <Route path="/members">{() => <WrappedPage pageId="members" Component={Members} />}</Route>
      <Route path="/protection">{() => <WrappedPage pageId="protection" Component={Protection} />}</Route>
      <Route path="/exemptions">{() => <WrappedPage pageId="exemptions" Component={Exemptions} />}</Route>
      <Route path="/loyal-members">{() => <WrappedPage pageId="loyal-members" Component={LoyalMembers} />}</Route>
      <Route path="/players">{() => <WrappedPage pageId="players" Component={PlayerLookup} />}</Route>
      <Route path="/commands" component={Commands} />
      <Route path="/moderators">{() => <WrappedPage pageId="moderators" Component={Moderators} />}</Route>
      <Route path="/logs">{() => <WrappedPage pageId="logs" Component={ActivityLogs} />}</Route>
      <Route path="/music">{() => <WrappedPage pageId="music" Component={() => <FeatureGate featureKey="music"><Music /></FeatureGate>} />}</Route>
      <Route path="/spam-kicks">{() => <WrappedPage pageId="spam-kicks" Component={SpamKicks} />}</Route>
      <Route path="/admins">{() => <WrappedPage pageId="admins" Component={Admins} />}</Route>
      <Route path="/chat">{() => <WrappedPage pageId="chat" Component={Chat} />}</Route>
      <Route path="/kick-ban-logs">{() => <WrappedPage pageId="kick-ban-logs" Component={KickBanLogs} />}</Route>
      <Route path="/blacklist">{() => <WrappedPage pageId="blacklist" Component={() => <FeatureGate featureKey="blacklist"><BlacklistHitlist /></FeatureGate>} />}</Route>
      <Route path="/secret-messages">{() => <WrappedPage pageId="secret-messages" Component={() => <FeatureGate featureKey="fun"><SecretMessages /></FeatureGate>} />}</Route>
      <Route path="/dedicate">{() => <FeatureGate featureKey="dedications"><DedicatePage /></FeatureGate>}</Route>
      <Route path="/stream" component={StreamPage} />
      <Route path="/feature-status" component={FeatureStatus} />
      <Route path="/clubs" component={Clubs} />
      <Route path="/page-protection" component={PageProtection} />
      <Route component={Overview} />
    </Switch>
  );
}

function AppContent() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  if (location === "/stream") {
    return (
      <div className="min-h-screen bg-background p-6">
        <StreamPage />
      </div>
    );
  }

  if (location === "/features") {
    return <FeaturesAdmin />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  const style = {
    "--sidebar-width": "280px",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-auto p-6">
            <ProtectedRoutes />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <AuthProvider>
            <AppContent />
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
