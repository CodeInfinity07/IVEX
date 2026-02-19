import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Lock, ArrowUpCircle } from "lucide-react";

const VPS_API_URL = import.meta.env.VITE_BOT_API_URL || "";

interface FeatureGateProps {
  featureKey: string;
  children: React.ReactNode;
}

export default function FeatureGate({ featureKey, children }: FeatureGateProps) {
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);
  const [featureLabel, setFeatureLabel] = useState("");

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${VPS_API_URL}/api/jack/features/status`);
        const data = await res.json();
        if (data.success && data.data[featureKey]) {
          setIsEnabled(data.data[featureKey].enabled);
          setFeatureLabel(data.data[featureKey].label || featureKey);
        } else {
          setIsEnabled(true);
        }
      } catch {
        setIsEnabled(true);
      }
    };
    check();
  }, [featureKey]);

  if (isEnabled === null) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isEnabled) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Lock className="h-8 w-8 text-amber-500" />
              </div>
            </div>
            <h2 className="text-xl font-bold">Feature Not Available</h2>
            <p className="text-muted-foreground">
              The <span className="font-semibold text-foreground">{featureLabel}</span> feature is not enabled for your bot.
            </p>
            <div className="flex items-center gap-2 justify-center text-sm text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-lg p-3">
              <ArrowUpCircle className="h-4 w-4 shrink-0" />
              <span>You need to upgrade your bot or enable this feature to access this page.</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
