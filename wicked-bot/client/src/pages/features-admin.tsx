import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Lock, Save, Loader2, Music2, Heart, Shield, Target, Ban, BarChart3, Mic, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const VPS_API_URL = import.meta.env.VITE_BOT_API_URL || "";

interface FeatureToggle {
  enabled: boolean;
  label: string;
  description: string;
  commands: string[];
}

const FEATURE_ICONS: Record<string, React.ReactNode> = {
  music: <Music2 className="h-5 w-5" />,
  dedications: <Heart className="h-5 w-5" />,
  moderation: <Shield className="h-5 w-5" />,
  hitlist: <Target className="h-5 w-5" />,
  blacklist: <Ban className="h-5 w-5" />,
  info_stats: <BarChart3 className="h-5 w-5" />,
  ai_voice: <Mic className="h-5 w-5" />,
  fun: <Sparkles className="h-5 w-5" />,
};

export default function FeaturesAdmin() {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [features, setFeatures] = useState<Record<string, FeatureToggle>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const verifyPassword = async () => {
    setIsVerifying(true);
    try {
      const response = await fetch(`${VPS_API_URL}/api/jack/features/verify-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();

      if (data.success) {
        setIsAuthenticated(true);
        loadFeatures();
        toast({ title: "Access Granted", description: "Welcome to Feature Control" });
      } else {
        toast({ title: "Access Denied", description: "Invalid password", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to verify password", variant: "destructive" });
    }
    setIsVerifying(false);
  };

  const loadFeatures = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${VPS_API_URL}/api/jack/features/get`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (data.success) {
        setFeatures(data.data);
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to load features", variant: "destructive" });
    }
    setIsLoading(false);
  };

  const toggleFeature = (key: string) => {
    setFeatures(prev => ({
      ...prev,
      [key]: { ...prev[key], enabled: !prev[key].enabled }
    }));
  };

  const saveFeatures = async () => {
    setIsSaving(true);
    try {
      const toggles: Record<string, boolean> = {};
      for (const [key, feature] of Object.entries(features)) {
        toggles[key] = feature.enabled;
      }

      const response = await fetch(`${VPS_API_URL}/api/jack/features/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, toggles }),
      });
      const data = await response.json();

      if (data.success) {
        setFeatures(data.data);
        toast({ title: "Saved", description: "Feature toggles updated successfully" });
      } else {
        toast({ title: "Error", description: data.message || "Failed to save", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to save features", variant: "destructive" });
    }
    setIsSaving(false);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Lock className="h-7 w-7 text-primary" />
            </div>
            <CardTitle className="text-2xl">Feature Control</CardTitle>
            <CardDescription>Enter the developer password to manage features</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && verifyPassword()}
              />
              <Button onClick={verifyPassword} disabled={isVerifying || !password}>
                {isVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Unlock"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Feature Control</h1>
            <p className="text-muted-foreground mt-1">Enable or disable bot feature groups</p>
          </div>
          <Button onClick={saveFeatures} disabled={isSaving} size="lg">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save Changes
          </Button>
        </div>

        <div className="grid gap-4">
          {Object.entries(features).map(([key, feature]) => (
            <Card key={key} className={`transition-all ${feature.enabled ? 'border-primary/30 bg-primary/5' : 'opacity-75'}`}>
              <CardContent className="flex items-center justify-between p-5">
                <div className="flex items-center gap-4">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${feature.enabled ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    {FEATURE_ICONS[key] || <Sparkles className="h-5 w-5" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg">{feature.label}</h3>
                      <Badge variant={feature.enabled ? "default" : "secondary"}>
                        {feature.enabled ? "ON" : "OFF"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                    {feature.commands.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {feature.commands.map(cmd => (
                          <Badge key={cmd} variant="outline" className="text-xs font-mono">
                            {cmd}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <Switch
                  checked={feature.enabled}
                  onCheckedChange={() => toggleFeature(key)}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
