import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, RefreshCw, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const VPS_API_URL = import.meta.env.VITE_BOT_API_URL || "";

interface ChatResponse {
  success: boolean;
  data: string[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  message?: string;
}

export default function Chat() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const loadMessages = async (pageNum: number = 1, append: boolean = false) => {
    if (pageNum === 1) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const response = await fetch(`${VPS_API_URL}/api/jack/chat/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "Affan0000", page: pageNum, limit: 100 }),
      });
      const data: ChatResponse = await response.json();

      if (data.success) {
        if (append) {
          setMessages(prev => [...prev, ...data.data]);
        } else {
          setMessages(data.data);
        }
        setPage(pageNum);
        setHasMore(data.hasMore);
        setTotal(data.total);
      } else {
        toast({ title: "Error", description: data.message || "Failed to load messages", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to load messages", variant: "destructive" });
    }

    setIsLoading(false);
    setIsLoadingMore(false);
  };

  const loadMore = () => {
    loadMessages(page + 1, true);
  };

  const refresh = () => {
    setPage(1);
    loadMessages(1, false);
  };

  useEffect(() => {
    loadMessages(1);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Chat History</h1>
          <p className="text-muted-foreground mt-1">
            {total > 0 ? `${total} messages from last 7 days` : "View club chat messages"}
          </p>
        </div>
        <Button variant="outline" onClick={refresh} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            <CardTitle>Messages</CardTitle>
          </div>
          <CardDescription>Showing newest messages first</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No messages found</p>
          ) : (
            <div className="space-y-4">
              <div
                ref={chatContainerRef}
                className="max-h-[500px] overflow-y-auto space-y-1 font-mono text-sm bg-muted/50 rounded-lg p-4"
              >
                {messages.map((message, index) => (
                  <div key={index} className="py-1 border-b border-border/50 last:border-0">
                    {message}
                  </div>
                ))}
              </div>

              {hasMore && (
                <div className="flex justify-center">
                  <Button variant="outline" onClick={loadMore} disabled={isLoadingMore}>
                    <ChevronDown className="mr-2 h-4 w-4" />
                    {isLoadingMore ? "Loading..." : "Load More"}
                  </Button>
                </div>
              )}

              <p className="text-center text-xs text-muted-foreground">
                Showing {messages.length} of {total} messages
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
