import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Mail, Trash2, Clock, User, Send, Search, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const VPS_URL = import.meta.env.VITE_BOT_API_URL || "";

interface SecretMessage {
  id: string;
  targetGC: string;
  message: string;
  senderGC: string;
  senderName: string;
  senderUID: string;
  status: "pending" | "delivered";
  createdAt: string;
  deliveredAt: string | null;
}

function formatPKT(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString("en-PK", { timeZone: "Asia/Karachi", hour12: true });
}

export default function SecretMessages() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "delivered">("all");

  const { data: messages = [], isLoading } = useQuery<SecretMessage[]>({
    queryKey: ["/api/jack/secret-messages"],
    queryFn: async () => {
      const res = await fetch(`${VPS_URL}/api/jack/secret-messages`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
      });
      const data = await res.json();
      return data.success ? data.data : [];
    },
    refetchInterval: 10000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${VPS_URL}/api/jack/secret-messages/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jack/secret-messages"] });
      toast({ title: "Deleted", description: "Secret message removed" });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${VPS_URL}/api/jack/secret-messages`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jack/secret-messages"] });
      toast({ title: "Cleared", description: "All secret messages removed" });
    },
  });

  const filtered = messages.filter((m) => {
    const matchesSearch =
      !searchTerm ||
      m.targetGC.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.senderName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.senderGC.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.message.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filter === "all" || m.status === filter;
    return matchesSearch && matchesFilter;
  });

  const pendingCount = messages.filter((m) => m.status === "pending").length;
  const deliveredCount = messages.filter((m) => m.status === "delivered").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Mail className="h-8 w-8" />
            Secret Messages
          </h1>
          <p className="text-muted-foreground mt-1">View all secret messages with sender details (hidden from recipients)</p>
        </div>
        {messages.length > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (confirm("Clear all secret messages?")) clearAllMutation.mutate();
            }}
            disabled={clearAllMutation.isPending}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Clear All
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{messages.length}</div>
            <p className="text-sm text-muted-foreground">Total Messages</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-500">{pendingCount}</div>
            <p className="text-sm text-muted-foreground">Pending Delivery</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-500">{deliveredCount}</div>
            <p className="text-sm text-muted-foreground">Delivered</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by sender, target, or message..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "pending", "delivered"] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Mail className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No secret messages found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((msg) => (
            <Card key={msg.id} className={msg.status === "delivered" ? "border-green-500/20" : "border-yellow-500/20"}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {msg.status === "pending" ? (
                        <Badge variant="outline" className="text-yellow-500 border-yellow-500/30">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Pending
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-green-500 border-green-500/30">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Delivered
                        </Badge>
                      )}
                      <Badge variant="secondary" className="gap-1">
                        <Send className="h-3 w-3" />
                        To: {msg.targetGC}
                      </Badge>
                    </div>

                    <p className="text-base leading-relaxed bg-muted/50 p-3 rounded-md">"{msg.message}"</p>

                    <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        Sender: <span className="font-medium text-foreground">{msg.senderName}</span> ({msg.senderGC})
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatPKT(msg.createdAt)}
                      </span>
                      {msg.deliveredAt && (
                        <span className="flex items-center gap-1 text-green-500">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Delivered: {formatPKT(msg.deliveredAt)}
                        </span>
                      )}
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => deleteMutation.mutate(msg.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
