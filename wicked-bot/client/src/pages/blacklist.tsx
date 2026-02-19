import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, Ban, UserX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const VPS_API_URL = import.meta.env.VITE_BOT_API_URL || "";

export default function BlacklistHitlist() {
  const { toast } = useToast();
  const [blacklist, setBlacklist] = useState("");
  const [hitlist, setHitlist] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadLists = async () => {
    setIsLoading(true);
    try {
      const [blacklistRes, hitlistRes] = await Promise.all([
        fetch(`${VPS_API_URL}/api/jack/blacklist/list`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: "Affan0000" }),
        }),
        fetch(`${VPS_API_URL}/api/jack/hitlist/list`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: "Affan0000" }),
        }),
      ]);

      const blacklistData = await blacklistRes.json();
      const hitlistData = await hitlistRes.json();

      if (blacklistData.success) {
        setBlacklist(blacklistData.data.join(", "));
      }
      if (hitlistData.success) {
        setHitlist(hitlistData.data.join(", "));
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to load lists", variant: "destructive" });
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadLists();
  }, []);

  const saveBlacklist = async () => {
    setIsSaving(true);
    try {
      const list = blacklist.split(",").map((a) => a.trim()).filter((a) => a !== "");
      const response = await fetch(`${VPS_API_URL}/api/jack/blacklist/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "Affan0000", data: list }),
      });
      const data = await response.json();
      if (data.success) {
        toast({ title: "Success", description: "Blacklist saved successfully" });
      } else {
        toast({ title: "Error", description: data.message || "Failed to save blacklist", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to save blacklist", variant: "destructive" });
    }
    setIsSaving(false);
  };

  const saveHitlist = async () => {
    setIsSaving(true);
    try {
      const list = hitlist.split(",").map((a) => a.trim()).filter((a) => a !== "");
      const response = await fetch(`${VPS_API_URL}/api/jack/hitlist/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "Affan0000", data: list }),
      });
      const data = await response.json();
      if (data.success) {
        toast({ title: "Success", description: "Hitlist saved successfully" });
      } else {
        toast({ title: "Error", description: data.message || "Failed to save hitlist", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to save hitlist", variant: "destructive" });
    }
    setIsSaving(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Blacklist & Hitlist</h1>
        <p className="text-muted-foreground mt-1">Manage banned and kicked player IDs</p>
      </div>

      <Tabs defaultValue="blacklist" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="blacklist" className="flex items-center gap-2">
            <Ban className="h-4 w-4" />
            Blacklist (Ban)
          </TabsTrigger>
          <TabsTrigger value="hitlist" className="flex items-center gap-2">
            <UserX className="h-4 w-4" />
            Hitlist (Kick)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="blacklist">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Ban className="h-5 w-5 text-red-500" />
                <CardTitle>Blacklist</CardTitle>
              </div>
              <CardDescription>
                Player IDs in this list will be automatically BANNED when they join the club.
                Enter comma-separated player IDs (GC).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : (
                <>
                  <Textarea
                    placeholder="Enter player IDs separated by commas (e.g., 12345678, 87654321)"
                    value={blacklist}
                    onChange={(e) => setBlacklist(e.target.value)}
                    className="min-h-[200px] font-mono"
                  />
                  <div className="flex gap-2">
                    <Button onClick={loadLists} variant="outline" disabled={isLoading}>
                      {isLoading ? "Loading..." : "Refresh"}
                    </Button>
                    <Button onClick={saveBlacklist} disabled={isSaving}>
                      <Save className="h-4 w-4 mr-2" />
                      {isSaving ? "Saving..." : "Save Blacklist"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hitlist">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <UserX className="h-5 w-5 text-orange-500" />
                <CardTitle>Hitlist</CardTitle>
              </div>
              <CardDescription>
                Player IDs in this list will be automatically KICKED when they join the club.
                Enter comma-separated player IDs (GC).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : (
                <>
                  <Textarea
                    placeholder="Enter player IDs separated by commas (e.g., 12345678, 87654321)"
                    value={hitlist}
                    onChange={(e) => setHitlist(e.target.value)}
                    className="min-h-[200px] font-mono"
                  />
                  <div className="flex gap-2">
                    <Button onClick={loadLists} variant="outline" disabled={isLoading}>
                      {isLoading ? "Loading..." : "Refresh"}
                    </Button>
                    <Button onClick={saveHitlist} disabled={isSaving}>
                      <Save className="h-4 w-4 mr-2" />
                      {isSaving ? "Saving..." : "Save Hitlist"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
