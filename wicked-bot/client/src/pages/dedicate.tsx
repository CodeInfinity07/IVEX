import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Heart, Music2, Send, Loader2, ListMusic, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const VPS_API_URL = import.meta.env.VITE_BOT_API_URL || "";

interface Dedication {
  id: string;
  name: string;
  songName: string;
  status: "queued" | "playing" | "done";
  timestamp: number;
}

interface DedicationState {
  queue: Dedication[];
  current: Dedication | null;
}

export default function DedicatePage() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [songName, setSongName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dedicationState, setDedicationState] = useState<DedicationState>({ queue: [], current: null });
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchQueue = async () => {
    try {
      const res = await fetch(`${VPS_API_URL}/api/jack/dedicate/queue`);
      const data = await res.json();
      if (data.success) {
        setDedicationState(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch queue:", err);
    }
  };

  useEffect(() => {
    fetchQueue();
    pollRef.current = setInterval(fetchQueue, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !songName.trim()) {
      toast({ title: "Missing Info", description: "Please enter both your name and a song name", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${VPS_API_URL}/api/jack/dedicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), songName: songName.trim() }),
      });
      const data = await res.json();

      if (data.success) {
        toast({ title: "Dedication Submitted!", description: `"${songName}" dedicated to ${name} has been added to the queue` });
        setName("");
        setSongName("");
        fetchQueue();
      } else {
        toast({ title: "Error", description: data.message || "Failed to submit dedication", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: "Could not connect to server", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Heart className="h-8 w-8 text-red-500" />
            <h1 className="text-3xl font-bold">Song Dedication</h1>
            <Heart className="h-8 w-8 text-red-500" />
          </div>
          <p className="text-muted-foreground">Dedicate a song to someone special</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Music2 className="h-5 w-5 text-primary" />
              Dedicate a Song
            </CardTitle>
            <CardDescription>Enter your name and the song you want to dedicate</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Your Name</label>
                <Input
                  placeholder="Enter your name..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isSubmitting}
                  maxLength={50}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Song Name</label>
                <Input
                  placeholder="Enter song name..."
                  value={songName}
                  onChange={(e) => setSongName(e.target.value)}
                  disabled={isSubmitting}
                  maxLength={100}
                />
              </div>
              <Button type="submit" disabled={isSubmitting || !name.trim() || !songName.trim()} className="w-full gap-2">
                {isSubmitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Submitting...</>
                ) : (
                  <><Send className="h-4 w-4" />Dedicate Song</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {dedicationState.current && (
          <Card className="border-2 border-primary/30 bg-primary/5">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Music2 className="h-5 w-5 text-primary animate-pulse" />
                  Now Playing
                </CardTitle>
                <Badge variant="default" className="gap-1">
                  <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
                  Live
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <p className="font-semibold text-lg">{dedicationState.current.songName}</p>
                <p className="text-muted-foreground flex items-center gap-1">
                  <Heart className="h-4 w-4 text-red-500" />
                  Dedicated to <span className="font-medium text-foreground">{dedicationState.current.name}</span>
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListMusic className="h-5 w-5" />
              Queue
              {dedicationState.queue.length > 0 && (
                <Badge variant="secondary">{dedicationState.queue.length}</Badge>
              )}
            </CardTitle>
            <CardDescription>Upcoming dedications</CardDescription>
          </CardHeader>
          <CardContent>
            {dedicationState.queue.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">No dedications in queue. Be the first to dedicate a song!</p>
            ) : (
              <div className="space-y-3">
                {dedicationState.queue.map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.songName}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Heart className="h-3 w-3 text-red-400" />
                        For {item.name}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      #{idx + 1}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
