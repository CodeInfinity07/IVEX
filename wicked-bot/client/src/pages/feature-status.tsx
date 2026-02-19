import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, Music2, Heart, Shield, Target, Ban, BarChart3, Mic, Sparkles } from "lucide-react";

const VPS_API_URL = import.meta.env.VITE_BOT_API_URL || "";

interface FeatureStatus {
  label: string;
  description: string;
  enabled: boolean;
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

export default function FeatureStatusPage() {
  const [features, setFeatures] = useState<Record<string, FeatureStatus>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await fetch(`${VPS_API_URL}/api/jack/features/status`);
      const data = await response.json();
      if (data.success) {
        setFeatures(data.data);
        setError("");
      }
    } catch (err) {
      setError("Unable to fetch feature status");
    }
    setIsLoading(false);
  };

  const enabledCount = Object.values(features).filter(f => f.enabled).length;
  const totalCount = Object.keys(features).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <XCircle className="h-12 w-12 text-destructive mx-auto mb-3" />
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Feature Status</h1>
        <p className="text-muted-foreground mt-1">
          {enabledCount} of {totalCount} feature groups are currently active
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(features).map(([key, feature]) => (
          <Card key={key} className={`transition-all ${feature.enabled ? '' : 'opacity-60'}`}>
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${feature.enabled ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                  {FEATURE_ICONS[key] || <Sparkles className="h-5 w-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{feature.label}</h3>
                    {feature.enabled ? (
                      <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="bg-red-500/10 text-red-500 border-red-500/20">
                        <XCircle className="h-3 w-3 mr-1" />
                        Disabled
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{feature.description}</p>
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
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
