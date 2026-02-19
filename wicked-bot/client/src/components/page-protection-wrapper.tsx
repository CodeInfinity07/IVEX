import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const VPS_API_URL = import.meta.env.VITE_BOT_API_URL || "";

interface PageProtectionWrapperProps {
  pageId: string;
  children: React.ReactNode;
}

const verifiedPages = new Set<string>();

export default function PageProtectionWrapper({ pageId, children }: PageProtectionWrapperProps) {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [isVerified, setIsVerified] = useState(() => verifiedPages.has(pageId));
  const [isVerifying, setIsVerifying] = useState(false);

  const { data, isLoading } = useQuery<{ success: boolean; isProtected: boolean }>({
    queryKey: ["page-protection-check", pageId],
    queryFn: async () => {
      const res = await fetch(`${VPS_API_URL}/api/page-protection/check-page`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pagePath: `/${pageId}` }),
      });
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!data?.isProtected || isVerified) {
    return <>{children}</>;
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setIsVerifying(true);
    try {
      const res = await fetch(`${VPS_API_URL}/api/page-protection/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await res.json();
      if (result.success) {
        verifiedPages.add(pageId);
        setIsVerified(true);
        toast({ title: "Access Granted", description: "Page unlocked successfully." });
      } else {
        toast({ title: "Access Denied", description: result.message || "Invalid password", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: "Invalid password", variant: "destructive" });
    }
    setIsVerifying(false);
  };

  return (
    <div className="flex items-center justify-center py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Lock className="h-7 w-7 text-primary" />
            </div>
          </div>
          <CardTitle>Password Required</CardTitle>
          <CardDescription>This page is protected. Enter the password to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleVerify} className="space-y-4">
            <Input type="password" placeholder="Enter password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              disabled={isVerifying} autoFocus />
            <Button type="submit" className="w-full" disabled={isVerifying || !password}>
              {isVerifying ? "Verifying..." : "Unlock Page"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
