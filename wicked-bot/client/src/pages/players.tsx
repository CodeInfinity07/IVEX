"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, User, Hash, Clock, History, Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface PlayerData {
  player_id: string;
  name: string;
  uid: string;
  old_names: string[];
  created_at: string;
  updated_at: string;
}

export default function PlayerLookup() {
  const [playerId, setPlayerId] = useState("");
  const [playerData, setPlayerData] = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchPlayer = async () => {
    const trimmedId = playerId.trim();
    
    if (!trimmedId) {
      setError("Please enter a player ID");
      return;
    }

    setLoading(true);
    setError(null);
    setPlayerData(null);

    try {
      const response = await fetch(`https://api.botpanels.live/api/player/${trimmedId}`);
      const data = await response.json();

      if (data.success && data.data) {
        setPlayerData(data.data);
      } else {
        setError(data.message || "Player not found");
      }
    } catch (err) {
      setError("Failed to fetch player data. Please try again.");
      console.error("Error fetching player:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      searchPlayer();
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Player Lookup</h1>
        <p className="text-muted-foreground mt-1">Search for player information by ID</p>
      </div>

      {/* Search Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-blue-500" />
            <CardTitle>Search Player</CardTitle>
          </div>
          <CardDescription>
            Enter a player ID to view their information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Enter player ID (e.g., IBSC1264)"
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1"
            />
            <Button onClick={searchPlayer} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Search
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Player Data */}
      {playerData && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-green-500" />
              <CardTitle>Player Information</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Player ID */}
              <div className="flex items-start gap-3">
                <Hash className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">Player ID</p>
                  <p className="text-lg font-mono">{playerData.player_id}</p>
                </div>
              </div>

              {/* Player Name */}
              <div className="flex items-start gap-3">
                <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">Current Name</p>
                  <p className="text-lg">{playerData.name}</p>
                </div>
              </div>

              {/* Old Names */}
              <div className="flex items-start gap-3">
                <History className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground mb-2">Previous Names</p>
                  {playerData.old_names && playerData.old_names.length > 0 ? (
                    <div className="space-y-1">
                      {playerData.old_names.map((name, index) => (
                        <div key={index} className="bg-muted px-3 py-2 rounded text-sm">
                          {name}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No previous names recorded</p>
                  )}
                </div>
              </div>

              {/* Timestamps */}
              <div className="pt-4 border-t space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Created:</span>
                  <span className="font-medium">{formatDate(playerData.created_at)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Last Updated:</span>
                  <span className="font-medium">{formatDate(playerData.updated_at)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}