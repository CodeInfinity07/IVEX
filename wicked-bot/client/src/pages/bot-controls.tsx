import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Play, Square, RotateCw, Trash2, Activity, Lock, AlertCircle, Code, Key, FileText, Bot, Copy, Check, RefreshCcw, Wifi, WifiOff, Clock, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";

interface BotStatus {
  isRunning: boolean;
  lastStarted: string | null;
  lastStopped: string | null;
  cacheCleared: string | null;
  uptime: number;
}

interface BotStatusResponse {
  success: boolean;
  data: BotStatus;
}

interface AuthStatusResponse {
  success: boolean;
  authRequired: boolean;
  connected: boolean;
  authMessage?: any;
}

interface ClubInfoResponse {
  success: boolean;
  data: {
    clubName: string;
    clubCode: string;
    botUid: string;
  };
}

type DialogType = 'restart' | 'clearCredentials' | 'updateToken' | 'updateOpenAI' | 'updateBotUid' | null;

export default function BotControls() {
  const { toast } = useToast();
  const [authData, setAuthData] = useState("");
  const [tokenContent, setTokenContent] = useState("");
  const [openAIKey, setOpenAIKey] = useState("");
  const [botUidInput, setBotUidInput] = useState("");
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [dialogType, setDialogType] = useState<DialogType>(null);
  const [password, setPassword] = useState("");
  const [isCopied, setIsCopied] = useState(false);

  const { data, isLoading, isError } = useQuery<BotStatusResponse>({
    queryKey: ["/api/jack/status"],
    refetchInterval: 5000,
  });

  const { data: authStatus } = useQuery<AuthStatusResponse>({
    queryKey: ["/api/jack/auth-status"],
    refetchInterval: 2000,
  });

  const { data: clubInfo } = useQuery<ClubInfoResponse>({
    queryKey: ["/api/jack/club-info"],
  });

  const restartMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/jack/restart");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jack/status"] });
      toast({ title: "Bot Restarted", description: "The bot has been restarted successfully." });
      closePasswordDialog();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to restart bot", variant: "destructive" });
      closePasswordDialog();
    },
  });

  const clearCredentialsMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/jack/clear-credentials");
    },
    onSuccess: () => {
      toast({ title: "Credentials Cleared", description: "EP and KEY have been removed from .env file. Please restart the bot." });
      closePasswordDialog();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to clear credentials", variant: "destructive" });
      closePasswordDialog();
    },
  });

  const updateTokenMutation = useMutation({
    mutationFn: async (tokenContent: string) => {
      return await apiRequest("POST", "/api/jack/update-token", { tokenContent });
    },
    onSuccess: () => {
      setTokenContent("");
      toast({ title: "Token Updated", description: "Token updated and WebSocket reconnecting with new credentials." });
      closePasswordDialog();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update token", variant: "destructive" });
      closePasswordDialog();
    },
  });

  const updateOpenAIKeyMutation = useMutation({
    mutationFn: async (apiKey: string) => {
      return await apiRequest("POST", "/api/jack/update-openai-key", { apiKey });
    },
    onSuccess: () => {
      setOpenAIKey("");
      toast({ title: "OpenAI Key Updated", description: "API key has been updated. Consider restarting the bot for changes to take effect." });
      closePasswordDialog();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update OpenAI key", variant: "destructive" });
      closePasswordDialog();
    },
  });

  const updateBotUidMutation = useMutation({
    mutationFn: async (botUid: string) => {
      return await apiRequest("POST", "/api/jack/update-bot-uid", { botUid });
    },
    onSuccess: () => {
      setBotUidInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/jack/club-info"] });
      toast({ title: "Bot UID Updated", description: "Bot UID has been updated successfully." });
      closePasswordDialog();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update Bot UID", variant: "destructive" });
      closePasswordDialog();
    },
  });

  const regenerateTokenMutation = useMutation({
    mutationFn: async () => {
      const botApiUrl = import.meta.env.VITE_BOT_API_URL || '';
      return await fetch(`${botApiUrl}/api/jack/regenerate-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).then(res => res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jack/auth-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jack/status"] });
      toast({ title: "Token Regeneration Started", description: "WebSocket reconnecting to fetch new auth message..." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to regenerate token", variant: "destructive" });
    },
  });

  const authMutation = useMutation({
    mutationFn: async (authData: string) => {
      return await apiRequest("POST", "/api/jack/authenticate", { authData });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jack/auth-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jack/status"] });
      setAuthData("");
      toast({ title: "Authentication Successful", description: "Bot credentials have been submitted." });
    },
    onError: (error: any) => {
      toast({ title: "Authentication Failed", description: error.message || "Failed to authenticate", variant: "destructive" });
    },
  });

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      toast({ title: "Copied!", description: "Authentication message copied to clipboard" });
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      toast({ title: "Copy Failed", description: "Failed to copy to clipboard", variant: "destructive" });
    }
  };

  const handleAuthenticate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!authData.trim()) {
      toast({ title: "Missing Credentials", description: "Please paste the base64 authentication data", variant: "destructive" });
      return;
    }
    try {
      const decoded = atob(authData.trim());
      JSON.parse(decoded);
    } catch (err) {
      toast({ title: "Invalid Format", description: "Please paste valid base64 encoded authentication data", variant: "destructive" });
      return;
    }
    authMutation.mutate(authData.trim());
  };

  const closePasswordDialog = () => {
    setShowPasswordDialog(false);
    setPassword("");
    setDialogType(null);
  };

  const openPasswordDialog = (type: DialogType) => {
    setDialogType(type);
    setShowPasswordDialog(true);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const DEVELOPER_PASSWORD = "aa00aa00";
    if (password !== DEVELOPER_PASSWORD) {
      toast({ title: "Invalid Password", description: "The developer password is incorrect.", variant: "destructive" });
      return;
    }
    switch (dialogType) {
      case 'restart':
        restartMutation.mutate();
        break;
      case 'clearCredentials':
        clearCredentialsMutation.mutate();
        break;
      case 'updateToken':
        if (!tokenContent.trim()) {
          toast({ title: "Missing Token", description: "Please paste the token content", variant: "destructive" });
          return;
        }
        updateTokenMutation.mutate(tokenContent.trim());
        break;
      case 'updateOpenAI':
        if (!openAIKey.trim()) {
          toast({ title: "Missing API Key", description: "Please enter the OpenAI API key", variant: "destructive" });
          return;
        }
        if (!openAIKey.trim().startsWith('sk-')) {
          toast({ title: "Invalid Format", description: "OpenAI API keys should start with 'sk-'", variant: "destructive" });
          return;
        }
        updateOpenAIKeyMutation.mutate(openAIKey.trim());
        break;
      case 'updateBotUid':
        if (!botUidInput.trim()) {
          toast({ title: "Missing Bot UID", description: "Please enter the Bot UID", variant: "destructive" });
          return;
        }
        updateBotUidMutation.mutate(botUidInput.trim());
        break;
    }
  };

  const getDialogTitle = () => {
    switch (dialogType) {
      case 'restart': return 'Restart Bot';
      case 'clearCredentials': return 'Clear Credentials';
      case 'updateToken': return 'Update Token';
      case 'updateOpenAI': return 'Update OpenAI API Key';
      case 'updateBotUid': return 'Update Bot UID';
      default: return 'Authentication Required';
    }
  };

  const getDialogDescription = () => {
    switch (dialogType) {
      case 'restart': return 'Enter the developer password to restart the bot.';
      case 'clearCredentials': return 'Enter the developer password to clear EP and KEY from .env file.';
      case 'updateToken': return 'Enter the developer password to update the token.';
      case 'updateOpenAI': return 'Enter the developer password to update the OpenAI API key.';
      case 'updateBotUid': return 'Enter the developer password to update the Bot UID.';
      default: return 'Enter the developer password.';
    }
  };

  const isPending = restartMutation.isPending || clearCredentialsMutation.isPending ||
    updateTokenMutation.isPending || updateOpenAIKeyMutation.isPending ||
    updateBotUidMutation.isPending || regenerateTokenMutation.isPending;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-bot-controls">Bot Controls</h1>
          <p className="text-muted-foreground mt-1">Manage bot operations</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center py-8">
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                <p className="text-center text-muted-foreground">Loading bot status...</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-bot-controls">Bot Controls</h1>
          <p className="text-muted-foreground mt-1">Manage bot operations</p>
        </div>
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-3 py-8">
              <AlertCircle className="h-12 w-12 text-destructive" />
              <p className="text-center text-destructive font-semibold">Failed to load bot status</p>
              <p className="text-center text-sm text-muted-foreground">Please check your connection and try again</p>
              <Button onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/jack/status"] })} variant="outline" className="mt-2">
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const botStatus = data?.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="heading-bot-controls">Bot Controls</h1>
        <p className="text-muted-foreground mt-1">Manage bot operations and credentials</p>
      </div>

      {authStatus?.authRequired && (
        <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800 dark:text-yellow-200">
            <strong>Authentication Required:</strong> The bot needs your credentials to connect. Please paste your authentication data below.
          </AlertDescription>
        </Alert>
      )}

      {authStatus?.authRequired && authStatus?.authMessage && (
        <Card className="border-blue-500">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-blue-900 dark:text-blue-100">Authentication Request</CardTitle>
              </div>
              <Button size="sm" variant="outline" onClick={() => copyToClipboard(authStatus.authMessage)}
                className="border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950">
                {isCopied ? (<><Check className="h-4 w-4 mr-2" />Copied!</>) : (<><Copy className="h-4 w-4 mr-2" />Copy</>)}
              </Button>
            </div>
            <CardDescription>Server authentication request message (click copy button to copy)</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="bg-slate-950 text-slate-50 p-4 rounded-lg overflow-x-auto text-xs select-all">
              {authStatus.authMessage}
            </pre>
          </CardContent>
        </Card>
      )}

      {authStatus?.authRequired && (
        <Card className="border-yellow-500">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-yellow-600" />
              <CardTitle>Bot Authentication</CardTitle>
            </div>
            <CardDescription>Paste your base64 encoded authentication data to connect the bot</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAuthenticate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="auth-data">Base64 Authentication Data</Label>
                <Textarea id="auth-data" placeholder="Paste your base64 encoded authentication data here..."
                  value={authData} onChange={(e) => setAuthData(e.target.value)}
                  disabled={authMutation.isPending} className="font-mono text-sm min-h-[150px] resize-y" />
                <p className="text-xs text-muted-foreground">This should be the base64 encoded string containing your KEY and EP</p>
              </div>
              <Button type="submit" className="w-full" disabled={authMutation.isPending}>
                {authMutation.isPending ? (
                  <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>Authenticating...</>
                ) : (
                  <><Lock className="mr-2 h-4 w-4" />Authenticate</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{getDialogTitle()}</DialogTitle>
            <DialogDescription>{getDialogDescription()}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePasswordSubmit}>
            <div className="space-y-4 py-4">
              {dialogType === 'updateToken' && (
                <div className="space-y-2">
                  <Label htmlFor="token-content">Token Content (Base64)</Label>
                  <Textarea id="token-content" placeholder="Paste your base64 encoded token here..."
                    value={tokenContent} onChange={(e) => setTokenContent(e.target.value)}
                    disabled={isPending} className="font-mono text-sm min-h-[150px] resize-y" />
                  <p className="text-xs text-muted-foreground">This should contain your EP and KEY in base64 format</p>
                </div>
              )}
              {dialogType === 'updateOpenAI' && (
                <div className="space-y-2">
                  <Label htmlFor="openai-key">OpenAI API Key</Label>
                  <Input id="openai-key" type="password" placeholder="sk-..."
                    value={openAIKey} onChange={(e) => setOpenAIKey(e.target.value)}
                    disabled={isPending} className="font-mono text-sm" autoComplete="off" />
                  <p className="text-xs text-muted-foreground">Your OpenAI API key (starts with 'sk-')</p>
                </div>
              )}
              {dialogType === 'updateBotUid' && (
                <div className="space-y-2">
                  <Label htmlFor="bot-uid">Bot UID</Label>
                  <Input id="bot-uid" type="text" placeholder="Enter Bot UID..."
                    value={botUidInput} onChange={(e) => setBotUidInput(e.target.value)}
                    disabled={isPending} className="font-mono text-sm" autoComplete="off" />
                  <p className="text-xs text-muted-foreground">The unique identifier for the bot</p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="developer-password">Developer Password</Label>
                <Input id="developer-password" type="password" placeholder="Enter developer password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  disabled={isPending} autoFocus={dialogType !== 'updateToken' && dialogType !== 'updateOpenAI'} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closePasswordDialog} disabled={isPending}>Cancel</Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>Processing...</>
                ) : "Confirm"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-green-500" />
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/10">
                <Wifi className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold" data-testid="badge-bot-status">Running</span>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-blue-500" />
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10">
                <Clock className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Last Started</p>
                <p className="text-xl font-bold" data-testid="text-last-started">
                  {botStatus?.lastStarted ? formatDistanceToNow(new Date(botStatus.lastStarted), { addSuffix: true }) : 'N/A'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-purple-500" />
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10">
                <Bot className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Bot UID</p>
                <p className="text-xl font-bold font-mono" data-testid="text-bot-uid">
                  {clubInfo?.data?.botUid ? clubInfo.data.botUid.substring(0, 12) + '...' : 'Not Set'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              <CardTitle>Quick Actions</CardTitle>
            </div>
            <CardDescription>Common bot operations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={() => openPasswordDialog('restart')} disabled={isPending}
              className="w-full justify-start h-12 bg-green-600 hover:bg-green-700 text-white" data-testid="button-restart-bot">
              <RotateCw className="mr-3 h-5 w-5" />
              <div className="text-left">
                <div className="font-semibold">Restart Bot</div>
                <div className="text-xs opacity-80">Stop and restart the bot process</div>
              </div>
            </Button>
            <Button onClick={() => regenerateTokenMutation.mutate()} disabled={isPending}
              variant="outline" className="w-full justify-start h-12 border-cyan-500 text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-950">
              <RefreshCcw className="mr-3 h-5 w-5" />
              <div className="text-left">
                <div className="font-semibold">Regenerate Token</div>
                <div className="text-xs opacity-70">Reconnect WebSocket for fresh auth</div>
              </div>
            </Button>
            <Button onClick={() => openPasswordDialog('updateBotUid')} disabled={isPending}
              variant="outline" className="w-full justify-start h-12 border-purple-500 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950">
              <Bot className="mr-3 h-5 w-5" />
              <div className="text-left">
                <div className="font-semibold">Update Bot UID</div>
                <div className="text-xs opacity-70">Change the bot's unique identifier</div>
              </div>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5 text-orange-500" />
              <CardTitle>Credentials</CardTitle>
            </div>
            <CardDescription>Manage authentication keys and tokens</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={() => openPasswordDialog('updateToken')} disabled={isPending}
              variant="outline" className="w-full justify-start h-12 border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950">
              <FileText className="mr-3 h-5 w-5" />
              <div className="text-left">
                <div className="font-semibold">Update Token File</div>
                <div className="text-xs opacity-70">Replace token.txt with new credentials</div>
              </div>
            </Button>
            <Button onClick={() => openPasswordDialog('updateOpenAI')} disabled={isPending}
              variant="outline" className="w-full justify-start h-12 border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950">
              <Key className="mr-3 h-5 w-5" />
              <div className="text-left">
                <div className="font-semibold">Update OpenAI Key</div>
                <div className="text-xs opacity-70">Change the ChatGPT API key</div>
              </div>
            </Button>
            <Button onClick={() => openPasswordDialog('clearCredentials')} disabled={isPending}
              variant="outline" className="w-full justify-start h-12 border-red-500 text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
              <Trash2 className="mr-3 h-5 w-5" />
              <div className="text-left">
                <div className="font-semibold">Clear EP & KEY</div>
                <div className="text-xs opacity-70">Remove bot auth from .env file</div>
              </div>
            </Button>
          </CardContent>
        </Card>
      </div>

      {botStatus && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              <CardTitle>Activity Timeline</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {botStatus.lastStarted && (
                <div className="flex items-center gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-500/10">
                    <Play className="h-4 w-4 text-green-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Bot Started</p>
                    <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(botStatus.lastStarted), { addSuffix: true })}</p>
                  </div>
                  <Badge variant="outline" className="text-green-600 border-green-200">Started</Badge>
                </div>
              )}
              {botStatus.lastStopped && (
                <>
                  <Separator />
                  <div className="flex items-center gap-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/10">
                      <Square className="h-4 w-4 text-red-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Bot Stopped</p>
                      <p className="text-xs text-muted-foreground" data-testid="text-last-stopped">{formatDistanceToNow(new Date(botStatus.lastStopped), { addSuffix: true })}</p>
                    </div>
                    <Badge variant="outline" className="text-red-600 border-red-200">Stopped</Badge>
                  </div>
                </>
              )}
              {botStatus.cacheCleared && (
                <>
                  <Separator />
                  <div className="flex items-center gap-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/10">
                      <Trash2 className="h-4 w-4 text-orange-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Cache Cleared</p>
                      <p className="text-xs text-muted-foreground" data-testid="text-cache-cleared">{formatDistanceToNow(new Date(botStatus.cacheCleared), { addSuffix: true })}</p>
                    </div>
                    <Badge variant="outline" className="text-orange-600 border-orange-200">Cleared</Badge>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
