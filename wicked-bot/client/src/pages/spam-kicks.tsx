import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Trash2, Clock, User, MessageSquare, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface SpamKick {
  id: string;
  username: string;
  uid: string;
  message: string;
  matchedWord: string;
  timestamp: string;
}

const VPS_URL = import.meta.env.VITE_BOT_API_URL || "";
const ITEMS_PER_PAGE = 20;

export default function SpamKicksPage() {
  const [page, setPage] = useState(1);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['spam-kicks'],
    queryFn: async () => {
      const token = localStorage.getItem('bot_auth_token');
      const res = await fetch(`${VPS_URL}/api/jack/spam-kicks`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.message || 'Failed to load spam kicks');
      }
      return json;
    },
    refetchInterval: 10000,
    retry: 2
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('bot_auth_token');
      const res = await fetch(`${VPS_URL}/api/jack/spam-kicks`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Logs cleared", description: "All spam kick logs have been cleared" });
        queryClient.invalidateQueries({ queryKey: ['spam-kicks'] });
      } else {
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
      setShowClearDialog(false);
    }
  });

  const kicks: SpamKick[] = data?.data || [];
  const totalPages = Math.ceil(kicks.length / ITEMS_PER_PAGE);
  const paginatedKicks = kicks.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Spam Kicks</h1>
          <p className="text-muted-foreground mt-1">View users kicked for spam</p>
        </div>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Failed to load spam kick logs. Make sure the VPS bot is running.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Spam Kicks</h1>
          <p className="text-muted-foreground mt-1">
            Users kicked for spam words ({kicks.length} total)
          </p>
        </div>
        {kicks.length > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowClearDialog(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear All
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle>Kick Logs</CardTitle>
          </div>
          <CardDescription>
            Recent spam violations and automatic kicks
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : kicks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No spam kicks recorded</p>
              <p className="text-sm">Users kicked for spam words will appear here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {paginatedKicks.map((kick) => (
                <div
                  key={kick.id}
                  className="flex flex-col gap-2 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{kick.username}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDate(kick.timestamp)}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <p className="text-sm text-muted-foreground break-all">{kick.message}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive" className="text-xs">
                      Matched: {kick.matchedWord}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All Logs</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to clear all spam kick logs? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clearMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
