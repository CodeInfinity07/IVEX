import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Lock, ShieldCheck, KeyRound, Save, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

const VPS_API_URL = import.meta.env.VITE_BOT_API_URL || "";

interface PageInfo {
  id: string;
  label: string;
  path: string;
}

interface ProtectionStatus {
  success: boolean;
  hasPassword: boolean;
  protectedPages: Record<string, boolean>;
  pages: PageInfo[];
}

export default function PageProtection() {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [verifyPassword, setVerifyPassword] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [sessionPassword, setSessionPassword] = useState("");
  const [localToggles, setLocalToggles] = useState<Record<string, boolean>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newConfirmPassword, setNewConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showNewConfirmPassword, setShowNewConfirmPassword] = useState(false);

  const { data: status, isLoading } = useQuery<ProtectionStatus>({
    queryKey: ["page-protection-status"],
    queryFn: async () => {
      const res = await fetch(`${VPS_API_URL}/api/page-protection/status`);
      return res.json();
    },
  });

  useEffect(() => {
    if (status?.protectedPages) {
      setLocalToggles(status.protectedPages);
      setHasChanges(false);
    }
  }, [status?.protectedPages]);

  const setPasswordMutation = useMutation({
    mutationFn: async ({ password, confirmPassword }: { password: string; confirmPassword: string }) => {
      const res = await fetch(`${VPS_API_URL}/api/page-protection/set-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmPassword }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["page-protection-status"] });
      setPassword("");
      setConfirmPassword("");
      setSessionPassword(password);
      setIsVerified(true);
      toast({ title: "Password Set", description: "Page protection password has been set. You can now toggle protection for individual pages." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to set password", variant: "destructive" });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (password: string) => {
      const res = await fetch(`${VPS_API_URL}/api/page-protection/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      return data;
    },
    onSuccess: () => {
      setSessionPassword(verifyPassword);
      setIsVerified(true);
      setVerifyPassword("");
      toast({ title: "Verified", description: "Access granted to page protection settings." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Invalid password", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ password, protectedPages }: { password: string; protectedPages: Record<string, boolean> }) => {
      const res = await fetch(`${VPS_API_URL}/api/page-protection/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, protectedPages }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["page-protection-status"] });
      setHasChanges(false);
      toast({ title: "Saved", description: "Page protection settings updated." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update settings", variant: "destructive" });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async ({ currentPassword, newPassword, confirmPassword }: { currentPassword: string; newPassword: string; confirmPassword: string }) => {
      const res = await fetch(`${VPS_API_URL}/api/page-protection/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      return data;
    },
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setNewConfirmPassword("");
      setSessionPassword(newPassword);
      toast({ title: "Password Changed", description: "Page protection password has been updated." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to change password", variant: "destructive" });
    },
  });

  const handleToggle = (pageId: string, enabled: boolean) => {
    const updated = { ...localToggles, [pageId]: enabled };
    setLocalToggles(updated);
    setHasChanges(true);
  };

  const handleSave = () => {
    updateMutation.mutate({ password: sessionPassword, protectedPages: localToggles });
  };

  const handleSetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !confirmPassword) {
      toast({ title: "Error", description: "Both fields are required", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (password.length < 4) {
      toast({ title: "Error", description: "Password must be at least 4 characters", variant: "destructive" });
      return;
    }
    setPasswordMutation.mutate({ password, confirmPassword });
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyPassword) return;
    verifyMutation.mutate(verifyPassword);
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !newConfirmPassword) {
      toast({ title: "Error", description: "All fields are required", variant: "destructive" });
      return;
    }
    if (newPassword !== newConfirmPassword) {
      toast({ title: "Error", description: "New passwords do not match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 4) {
      toast({ title: "Error", description: "Password must be at least 4 characters", variant: "destructive" });
      return;
    }
    changePasswordMutation.mutate({ currentPassword, newPassword, confirmPassword: newConfirmPassword });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Page Protection</h1>
          <p className="text-muted-foreground mt-1">Loading...</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const protectedCount = Object.values(localToggles).filter(Boolean).length;

  if (!status?.hasPassword) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Page Protection</h1>
          <p className="text-muted-foreground mt-1">Set up password protection for dashboard pages</p>
        </div>

        <Card className="max-w-lg mx-auto">
          <CardHeader>
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              <CardTitle>Set Protection Password</CardTitle>
            </div>
            <CardDescription>
              Create a password that will be required to access protected pages. You can choose which pages to protect after setting the password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-pass">Password</Label>
                <div className="relative flex items-center">
                  <Input id="new-pass" type={showPassword ? "text" : "password"}
                    className="pr-10"
                    placeholder="Enter password (min 4 characters)"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    disabled={setPasswordMutation.isPending} />
                  <button type="button"
                    className="absolute right-2 inline-flex items-center justify-center h-6 w-6 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-pass">Confirm Password</Label>
                <div className="relative flex items-center">
                  <Input id="confirm-pass" type={showConfirmPassword ? "text" : "password"}
                    className="pr-10"
                    placeholder="Confirm your password"
                    value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={setPasswordMutation.isPending} />
                  <button type="button"
                    className="absolute right-2 inline-flex items-center justify-center h-6 w-6 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={setPasswordMutation.isPending || !password || !confirmPassword}>
                {setPasswordMutation.isPending ? "Setting Password..." : "Set Password & Continue"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isVerified) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Page Protection</h1>
          <p className="text-muted-foreground mt-1">Manage password protection for dashboard pages</p>
        </div>

        <Card className="max-w-md mx-auto">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              <CardTitle>Enter Password</CardTitle>
            </div>
            <CardDescription>This page is password protected. Enter the protection password to continue.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleVerify} className="space-y-4">
              <Input type="password" placeholder="Enter protection password"
                value={verifyPassword} onChange={(e) => setVerifyPassword(e.target.value)}
                disabled={verifyMutation.isPending} />
              <Button type="submit" className="w-full" disabled={verifyMutation.isPending || !verifyPassword}>
                {verifyMutation.isPending ? "Verifying..." : "Unlock"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Page Protection</h1>
          <p className="text-muted-foreground mt-1">
            {protectedCount > 0
              ? `${protectedCount} page${protectedCount !== 1 ? 's' : ''} currently protected`
              : 'No pages are protected yet'}
          </p>
        </div>
        {hasChanges && (
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle>Protected Pages</CardTitle>
          </div>
          <CardDescription>
            Toggle the switch next to each page to require the protection password before it can be accessed.
            Pages with protection enabled will show a password prompt before loading.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {status?.pages.map((page, index) => (
              <div key={page.id}>
                {index > 0 && <Separator className="my-1" />}
                <div className="flex items-center justify-between py-3 px-2 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-medium text-sm">{page.label}</p>
                      <p className="text-xs text-muted-foreground">{page.path}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {localToggles[page.id] && (
                      <Badge variant="outline" className="text-green-600 border-green-200 text-xs">Protected</Badge>
                    )}
                    <Switch
                      checked={localToggles[page.id] || false}
                      onCheckedChange={(checked) => handleToggle(page.id, checked)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {hasChanges && (
            <div className="mt-4 pt-4 border-t">
              <Button onClick={handleSave} disabled={updateMutation.isPending} className="w-full">
                <Save className="mr-2 h-4 w-4" />
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-orange-500" />
            <CardTitle>Change Password</CardTitle>
          </div>
          <CardDescription>Update the page protection password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label>Current Password</Label>
              <div className="relative flex items-center">
                <Input type={showCurrentPassword ? "text" : "password"}
                  className="pr-10"
                  placeholder="Enter current password"
                  value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={changePasswordMutation.isPending} />
                <button type="button"
                  className="absolute right-2 inline-flex items-center justify-center h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}>
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>New Password</Label>
              <div className="relative flex items-center">
                <Input type={showNewPassword ? "text" : "password"}
                  className="pr-10"
                  placeholder="Enter new password"
                  value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  disabled={changePasswordMutation.isPending} />
                <button type="button"
                  className="absolute right-2 inline-flex items-center justify-center h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowNewPassword(!showNewPassword)}>
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Confirm New Password</Label>
              <div className="relative flex items-center">
                <Input type={showNewConfirmPassword ? "text" : "password"}
                  className="pr-10"
                  placeholder="Confirm new password"
                  value={newConfirmPassword} onChange={(e) => setNewConfirmPassword(e.target.value)}
                  disabled={changePasswordMutation.isPending} />
                <button type="button"
                  className="absolute right-2 inline-flex items-center justify-center h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowNewConfirmPassword(!showNewConfirmPassword)}>
                  {showNewConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" variant="outline" className="w-full"
              disabled={changePasswordMutation.isPending || !currentPassword || !newPassword || !newConfirmPassword}>
              {changePasswordMutation.isPending ? "Changing..." : "Change Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
