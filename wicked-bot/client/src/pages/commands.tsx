import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Terminal, Shield, Users, Zap, Music, MessageSquare } from "lucide-react";

export default function Commands() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Bot Commands</h1>
        <p className="text-muted-foreground mt-1">Complete list of available bot commands</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-green-500" />
            <CardTitle>Public Commands</CardTitle>
          </div>
          <CardDescription>
            Available to all users in the club
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/mic</code>
              <p className="text-muted-foreground">Request a mic invite (members/loyal members only)</p>
            </div>
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/whois [id]</code>
              <p className="text-muted-foreground">Show current and previous names for a player ID</p>
            </div>
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/seen [id]</code>
              <p className="text-muted-foreground">Check when a player was last seen in the club</p>
            </div>
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/secret [id] [msg]</code>
              <p className="text-muted-foreground">Send an anonymous secret message to a player (delivered when they join)</p>
            </div>
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/read</code>
              <p className="text-muted-foreground">Read your pending secret messages</p>
            </div>
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">[BotName] [msg]</code>
              <p className="text-muted-foreground">Chat with the bot's AI using its name as trigger</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-red-500" />
            <CardTitle>Admin Commands</CardTitle>
          </div>
          <CardDescription>
            Restricted to configured admin users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/admins</code>
              <p className="text-muted-foreground">Display list of all admins with names and IDs</p>
            </div>
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/ma [id]</code>
              <p className="text-muted-foreground">Make a player an admin</p>
            </div>
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/rma [id]</code>
              <p className="text-muted-foreground">Remove admin from a player</p>
            </div>
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/spam [word]</code>
              <p className="text-muted-foreground">Add a word to the spam filter list</p>
            </div>
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/cn [name]</code>
              <p className="text-muted-foreground">Change the bot's display name</p>
            </div>
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/say [msg]</code>
              <p className="text-muted-foreground">Make the bot send a message in chat</p>
            </div>
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/rejoin</code>
              <p className="text-muted-foreground">Make the bot leave and rejoin the club</p>
            </div>
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/refresh</code>
              <p className="text-muted-foreground">Refresh bot config (reload admins, settings, etc.)</p>
            </div>
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/reset</code>
              <p className="text-muted-foreground">Send a reset request to the dashboard</p>
            </div>
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/cq</code>
              <p className="text-muted-foreground">Clear the bot's pending message queue</p>
            </div>
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/member [id]</code>
              <p className="text-muted-foreground">Show weekly and monthly time stats for a player</p>
            </div>
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/mtop</code>
              <p className="text-muted-foreground">Display top 10 members by time spent this month</p>
            </div>
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/wtop</code>
              <p className="text-muted-foreground">Display top 10 members by time spent this week</p>
            </div>
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/imem</code>
              <p className="text-muted-foreground">Send member invites to the club</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-orange-500" />
            <CardTitle>Mic & Moderation</CardTitle>
          </div>
          <CardDescription>
            Admin commands for mic control and user management
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/joinMic</code>
              <p className="text-muted-foreground">Make the bot join a mic</p>
            </div>
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/lm [num|all]</code>
              <p className="text-muted-foreground">Lock a specific mic number or all mics</p>
            </div>
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/ulm [num|all]</code>
              <p className="text-muted-foreground">Unlock a specific mic number or all mics</p>
            </div>
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/ub [id]</code>
              <p className="text-muted-foreground">Unban a specific player by ID</p>
            </div>
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/ub all</code>
              <p className="text-muted-foreground">Unban all banned users</p>
            </div>
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/ub check</code>
              <p className="text-muted-foreground">Fetch and display the current ban list</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Music className="h-5 w-5 text-purple-500" />
            <CardTitle>Music & Streaming</CardTitle>
          </div>
          <CardDescription>
            Admin commands for music playback and streaming
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/song [name]</code>
              <p className="text-muted-foreground">Search YouTube and play a song by name</p>
            </div>
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/play [index|url]</code>
              <p className="text-muted-foreground">Play a song by playlist index or YouTube URL</p>
            </div>
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/pause</code>
              <p className="text-muted-foreground">Pause the current stream</p>
            </div>
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/next</code>
              <p className="text-muted-foreground">Skip to the next song in the playlist or dedication queue</p>
            </div>
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/stop</code>
              <p className="text-muted-foreground">Stop the stream completely</p>
            </div>
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/rec</code>
              <p className="text-muted-foreground">Reconnect Agora stream with fresh credentials</p>
            </div>
            <div className="flex gap-3">
              <code className="font-mono bg-muted px-2 py-1 rounded min-w-[160px]">/talk [on|off|msg]</code>
              <p className="text-muted-foreground">Toggle Voice AI mode or send a message to voice AI</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            <CardTitle>Special Triggers</CardTitle>
          </div>
          <CardDescription>
            Automated bot responses and actions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <Terminal className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
              <div>
                <p className="font-medium mb-1">Auto-moderation</p>
                <p className="text-muted-foreground">Messages containing spam words trigger automatic kick and message deletion</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Terminal className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
              <div>
                <p className="font-medium mb-1">Blacklist / Hitlist</p>
                <p className="text-muted-foreground">Blacklisted users are auto-banned on join, hitlisted users are auto-kicked</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Terminal className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
              <div>
                <p className="font-medium mb-1">Welcome Messages</p>
                <p className="text-muted-foreground">Bot automatically welcomes new users joining the club</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Terminal className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
              <div>
                <p className="font-medium mb-1">Secret Message Delivery</p>
                <p className="text-muted-foreground">Pending secret messages are automatically delivered when the target player joins</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Terminal className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
              <div>
                <p className="font-medium mb-1">Song Dedications</p>
                <p className="text-muted-foreground">Public dedication system queues and plays songs dedicated to club members via the dashboard</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Terminal className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
              <div>
                <p className="font-medium mb-1">Feature Toggles</p>
                <p className="text-muted-foreground">Disabled feature commands show a "feature disabled" message automatically</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}