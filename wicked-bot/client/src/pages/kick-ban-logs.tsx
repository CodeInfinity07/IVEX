import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, ChevronDown, Ban, UserX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const VPS_API_URL = import.meta.env.VITE_BOT_API_URL || "";

interface KickBanLog {
  id: string;
  action: "kick" | "ban";
  adminName: string;
  adminUID: string;
  userName: string;
  userUID: string;
  clubId: string;
  timestamp: string;
}

interface LogsResponse {
  success: boolean;
  data: KickBanLog[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  message?: string;
}

export default function KickBanLogs() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<KickBanLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  const loadLogs = async (pageNum: number = 1, append: boolean = false) => {
    if (pageNum === 1) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const response = await fetch(`${VPS_API_URL}/api/jack/kick-ban-logs?page=${pageNum}&limit=50`);
      const data: LogsResponse = await response.json();

      if (data.success) {
        if (append) {
          setLogs(prev => [...prev, ...data.data]);
        } else {
          setLogs(data.data);
        }
        setPage(pageNum);
        setHasMore(data.hasMore);
        setTotal(data.total);
      } else {
        toast({ title: "Error", description: data.message || "Failed to load logs", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to connect to bot server", variant: "destructive" });
    }

    setIsLoading(false);
    setIsLoadingMore(false);
  };

  const loadMore = () => {
    loadLogs(page + 1, true);
  };

  const refresh = () => {
    setPage(1);
    loadLogs(1, false);
  };

  useEffect(() => {
    loadLogs(1);
  }, []);

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString("en-PK", {
      timeZone: "Asia/Karachi",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Kick/Ban Logs</h1>
          <p className="text-muted-foreground mt-1">
            {total > 0 ? `${total} total events recorded` : "View kick and ban history"}
          </p>
        </div>
        <Button variant="outline" onClick={refresh} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Ban className="h-5 w-5" />
            <CardTitle>Event History</CardTitle>
          </div>
          <CardDescription>All kick and ban actions performed in the club</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No kick/ban events recorded</p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Action</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Admin</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          {log.action === "ban" ? (
                            <Badge variant="destructive" className="gap-1">
                              <Ban className="h-3 w-3" />
                              Ban
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1 bg-yellow-500/20 text-yellow-600 dark:text-yellow-400">
                              <UserX className="h-3 w-3" />
                              Kick
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div>
                            <span className="font-medium">{log.userName}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={log.adminName === "Bot" ? "text-blue-500 font-medium" : ""}>
                            {log.adminName}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDate(log.timestamp)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
                Showing {logs.length} of {total} events
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
