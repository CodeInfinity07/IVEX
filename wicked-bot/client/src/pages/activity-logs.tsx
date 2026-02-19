import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth, getAuthHeaders } from "@/lib/auth";
import { useLocation } from "wouter";
import { 
  Clock, 
  Activity, 
  LogIn, 
  LogOut, 
  UserPlus, 
  UserMinus, 
  Settings, 
  Shield, 
  ChevronLeft, 
  ChevronRight,
  Lock
} from "lucide-react";

interface ActivityLog {
  id: string;
  userId: string;
  userRole: "owner" | "moderator";
  action: string;
  details: Record<string, unknown>;
  timestamp: string;
}

interface ActivityLogsResponse {
  success: boolean;
  data: {
    logs: ActivityLog[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

const actionIcons: Record<string, typeof Activity> = {
  LOGIN: LogIn,
  LOGOUT: LogOut,
  CREATE_MODERATOR: UserPlus,
  DELETE_MODERATOR: UserMinus,
  UPDATE_CLUB_SETTINGS: Settings,
  UPDATE_PUNISHMENT_SETTINGS: Shield,
  UPDATE_SETTINGS: Settings,
  UPDATE_PROTECTION: Shield,
};

const actionColors: Record<string, string> = {
  LOGIN: "bg-green-500/10 text-green-500",
  LOGOUT: "bg-gray-500/10 text-gray-500",
  CREATE_MODERATOR: "bg-blue-500/10 text-blue-500",
  DELETE_MODERATOR: "bg-red-500/10 text-red-500",
  UPDATE_CLUB_SETTINGS: "bg-yellow-500/10 text-yellow-500",
  UPDATE_PUNISHMENT_SETTINGS: "bg-purple-500/10 text-purple-500",
  UPDATE_SETTINGS: "bg-yellow-500/10 text-yellow-500",
  UPDATE_PROTECTION: "bg-purple-500/10 text-purple-500",
};

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatActionDetails(action: string, details: Record<string, unknown>): string {
  switch (action) {
    case "LOGIN":
      return "Logged into the dashboard";
    case "LOGOUT":
      return "Logged out of the dashboard";
    case "CREATE_MODERATOR":
      return `Created moderator: ${details.moderatorUsername}`;
    case "DELETE_MODERATOR":
      return `Deleted moderator: ${details.moderatorUsername}`;
    case "UPDATE_CLUB_SETTINGS":
      const clubSettings: string[] = [];
      if (details.allowAvatars !== undefined) clubSettings.push(`Avatars: ${details.allowAvatars ? 'Allowed' : 'Not Allowed'}`);
      if (details.allowGuestIds !== undefined) clubSettings.push(`Guest IDs: ${details.allowGuestIds ? 'Allowed' : 'Not Allowed'}`);
      if (details.banLevel !== undefined) clubSettings.push(`Ban Level: ${details.banLevel}`);
      return `Updated club settings - ${clubSettings.join(', ')}`;
    case "UPDATE_PUNISHMENT_SETTINGS":
      const punishments: string[] = [];
      if (details.bannedPatterns) punishments.push(`Banned Patterns: ${details.bannedPatterns}`);
      if (details.lowLevel) punishments.push(`Low Level: ${details.lowLevel}`);
      if (details.noGuestId) punishments.push(`No Guest ID: ${details.noGuestId}`);
      if (details.noAvatar) punishments.push(`No Avatar: ${details.noAvatar}`);
      if (details.spamWords) punishments.push(`Spam Words: ${details.spamWords}`);
      return `Updated punishment settings - ${punishments.join(', ')}`;
    case "UPDATE_SETTINGS":
      return `Updated settings: ${details.setting || "general"}`;
    case "UPDATE_PROTECTION":
      return `Modified protection rules`;
    default:
      return details.message as string || action;
  }
}

export default function ActivityLogs() {
  const { isOwner } = useAuth();
  const [, setLocation] = useLocation();
  const [page, setPage] = useState(1);
  const limit = 10;

  const { data, isLoading, isError } = useQuery<ActivityLogsResponse>({
    queryKey: [`/api/jack/activity-logs?page=${page}&limit=${limit}`],
    queryFn: async () => {
      const res = await fetch(`/api/jack/activity-logs?page=${page}&limit=${limit}`, {
        headers: getAuthHeaders(),
      });
      return res.json();
    },
    enabled: isOwner,
  });

  if (!isOwner) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-logs">Activity Logs</h1>
          <p className="text-muted-foreground mt-1">Moderator activity and change history</p>
        </div>

        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Lock className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Owner Access Required</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Activity logs are only accessible to the owner. This section shows all changes 
              made by moderators to the dashboard settings.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const logs = data?.data?.logs || [];
  const pagination = data?.data?.pagination;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="heading-logs">Activity Logs</h1>
        <p className="text-muted-foreground mt-1">Track all moderator activities and changes</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle>Recent Activity</CardTitle>
          </div>
          <CardDescription>
            All login/logout events and setting changes by moderators
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : isError ? (
            <div className="text-center py-8 text-muted-foreground">
              Failed to load activity logs
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No activity logs yet
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => {
                const IconComponent = actionIcons[log.action] || Activity;
                const colorClass = actionColors[log.action] || "bg-gray-500/10 text-gray-500";

                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className={`p-2 rounded-full ${colorClass}`}>
                      <IconComponent className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{log.userId}</span>
                        <Badge variant={log.userRole === "owner" ? "default" : "secondary"}>
                          {log.userRole}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {formatActionDetails(log.action, log.details)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                      <Clock className="h-3 w-3" />
                      {formatTimestamp(log.timestamp)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * limit + 1} - {Math.min(page * limit, pagination.total)} of {pagination.total}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <span className="text-sm px-2">
                  Page {page} of {pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
