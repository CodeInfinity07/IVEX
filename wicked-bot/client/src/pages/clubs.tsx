import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, XCircle, Building2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ClubData {
  club_name: string;
  club_code: string;
}

export default function Clubs() {
  const [clubs, setClubs] = useState<ClubData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchClubs = async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch("https://api.botpanels.live/api/clubs");
      const data = await response.json();
      if (data.success) {
        setClubs(data.data);
      } else {
        setError("Failed to fetch clubs");
      }
    } catch (err) {
      setError("Unable to connect to the server");
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchClubs();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <XCircle className="h-12 w-12 text-destructive mx-auto mb-3" />
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" className="mt-4" onClick={fetchClubs}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Clubs</h1>
          <p className="text-muted-foreground mt-1">
            {clubs.length} club{clubs.length !== 1 ? "s" : ""} using Ivex
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchClubs}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {clubs.map((club, index) => (
          <Card key={index} className="transition-all hover:shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate" title={club.club_name}>
                    {club.club_name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Code: {club.club_code}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 text-xs">
                  #{index + 1}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
