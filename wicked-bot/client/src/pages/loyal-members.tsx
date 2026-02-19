import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Save, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface LoyalMembersData {
  success: boolean;
  data: string[];
}

export default function LoyalMembers() {
  const { toast } = useToast();
  const [loyalMembers, setLoyalMembers] = useState("");

  const { data: loyalMembersData, isLoading, isError } = useQuery<LoyalMembersData>({
    queryKey: ["/api/jack/config/loyal_members"],
  });

  useEffect(() => {
    if (loyalMembersData?.data) {
      setLoyalMembers(loyalMembersData.data.join(", "));
    }
  }, [loyalMembersData]);

  const saveLoyalMembersMutation = useMutation({
    mutationFn: async (membersList: string[]) => {
      return await apiRequest("POST", "/api/jack/config/loyal_members", { data: membersList });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jack/config/loyal_members"] });
      toast({
        title: "Success",
        description: "Loyal members saved successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save loyal members",
        variant: "destructive",
      });
    },
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const list = loyalMembers
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item !== "");
    saveLoyalMembersMutation.mutate(list);
  };

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Loyal Members</h1>
          <p className="text-muted-foreground mt-2">Failed to load loyal members data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="heading-loyal_members">Loyal Members</h1>
        <p className="text-muted-foreground mt-2">
          Manage your loyal and trusted club members
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5" />
            Loyal Members List
          </CardTitle>
          <CardDescription>
            Add usernames of loyal members who have special privileges (comma-separated)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <Textarea
              placeholder="username1, username2, username3"
              value={loyalMembers}
              onChange={(e) => setLoyalMembers(e.target.value)}
              className="min-h-[200px] font-mono text-sm"
              disabled={isLoading || saveLoyalMembersMutation.isPending}
              data-testid="textarea-loyal_members"
            />
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={isLoading || saveLoyalMembersMutation.isPending}
                data-testid="button-save-loyal_members"
              >
                <Save className="h-4 w-4 mr-2" />
                {saveLoyalMembersMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
