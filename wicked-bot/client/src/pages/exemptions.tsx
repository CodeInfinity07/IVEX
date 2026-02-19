import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Save, UserCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface ExemptionsData {
  success: boolean;
  data: string[];
}

export default function Exemptions() {
  const { toast } = useToast();
  const [exemptions, setExemptions] = useState("");

  const { data: exemptionsData, isLoading, isError } = useQuery<ExemptionsData>({
    queryKey: ["/api/jack/config/exemptions"],
  });

  useEffect(() => {
    if (exemptionsData?.data) {
      setExemptions(exemptionsData.data.join(", "));
    }
  }, [exemptionsData]);

  const saveExemptionsMutation = useMutation({
    mutationFn: async (exemptionsList: string[]) => {
      return await apiRequest("POST", "/api/jack/config/exemptions", { data: exemptionsList });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jack/config/exemptions"] });
      toast({
        title: "Success",
        description: "Exemptions saved successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save exemptions",
        variant: "destructive",
      });
    },
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const list = exemptions
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item !== "");
    saveExemptionsMutation.mutate(list);
  };

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Exemptions</h1>
          <p className="text-muted-foreground mt-2">Failed to load exemptions data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="heading-exemptions">Exemptions</h1>
        <p className="text-muted-foreground mt-2">
          Manage users who are exempt from certain rules
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Exempted Users
          </CardTitle>
          <CardDescription>
            Add usernames that should be exempt from moderation rules (comma-separated)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <Textarea
              placeholder="username1, username2, username3"
              value={exemptions}
              onChange={(e) => setExemptions(e.target.value)}
              className="min-h-[200px] font-mono text-sm"
              disabled={isLoading || saveExemptionsMutation.isPending}
              data-testid="textarea-exemptions"
            />
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={isLoading || saveExemptionsMutation.isPending}
                data-testid="button-save-exemptions"
              >
                <Save className="h-4 w-4 mr-2" />
                {saveExemptionsMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
