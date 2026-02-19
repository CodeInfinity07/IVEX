import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Save, UserCog } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const VPS_API_URL = import.meta.env.VITE_BOT_API_URL || "";

export default function Admins() {
  const { toast } = useToast();
  const [admins, setAdmins] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadAdmins = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${VPS_API_URL}/api/jack/admins/list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "Affan0000" }),
      });
      const data = await response.json();
      if (data.success) {
        setAdmins(data.data.join(", "));
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to load admins", variant: "destructive" });
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadAdmins();
  }, []);

  const saveAdmins = async () => {
    setIsSaving(true);
    try {
      const adminList = admins
        .split(",")
        .map((a) => a.trim())
        .filter((a) => a !== "");

      const response = await fetch(`${VPS_API_URL}/api/jack/admins/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "Affan0000", data: adminList }),
      });
      const data = await response.json();

      if (data.success) {
        toast({ title: "Success", description: "Admins saved successfully" });
      } else {
        toast({ title: "Error", description: data.message || "Failed to save admins", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to save admins", variant: "destructive" });
    }
    setIsSaving(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Administrators</h1>
        <p className="text-muted-foreground mt-1">Manage bot administrators</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            <CardTitle>Admin List</CardTitle>
          </div>
          <CardDescription>Admin usernames (comma-separated)</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="space-y-4">
              <Textarea
                placeholder="Admin1, Admin2, Admin3"
                value={admins}
                onChange={(e) => setAdmins(e.target.value)}
                className="min-h-[200px]"
              />
              <Button onClick={saveAdmins} disabled={isSaving}>
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? "Saving..." : "Save Admins"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
