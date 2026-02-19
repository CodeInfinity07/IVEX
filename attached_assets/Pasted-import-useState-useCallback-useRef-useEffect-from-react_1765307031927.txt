import { useState, useCallback, useRef, useEffect } from "react";
import { Mic, Headphones, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusDisplay } from "@/components/voice-bot/status-display";
import { ConfigForm } from "@/components/voice-bot/config-form";
import { UserList } from "@/components/voice-bot/user-list";
import { AudioControls } from "@/components/voice-bot/audio-controls";
import { AudioFilePlayer } from "@/components/voice-bot/audio-file-player";
import { ServerAudioPlayer } from "@/components/voice-bot/server-audio-player";
import { LogsConsole } from "@/components/voice-bot/logs-console";
import { AlertBanner } from "@/components/voice-bot/alert-banner";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAgora } from "@/hooks/use-agora";
import { useAudioBot } from "@/hooks/use-audio-bot";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ConnectionStatus, type VoiceConfig } from "@shared/schema";

export default function VoiceBot() {
  const { toast } = useToast();
  const [config, setConfig] = useState<VoiceConfig>({
    appId: "",
    channelId: "",
    userId: "",
    token: "",
  });
  const [localUserId, setLocalUserId] = useState<string | number | undefined>();
  const [localAudioLevel, setLocalAudioLevel] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const leaveRef = useRef<(() => Promise<void>) | null>(null);
  
  const audioBot = useAudioBot();
  
  const {
    status,
    isMuted,
    volume,
    remoteUsers,
    networkQuality,
    logs,
    sdkLoaded,
    sdkError,
    audioFileName,
    isAudioPlaying,
    isAudioPaused,
    audioCurrentTime,
    audioDuration,
    audioVolume,
    join,
    leave,
    toggleMute,
    setMicrophoneVolume,
    clearLogs,
    addLog,
    loadAudioFile,
    playAudio,
    pauseAudio,
    resumeAudio,
    stopAudio,
    seekAudio,
    setAudioFileVolume,
  } = useAgora({
    onVolumeIndicator: (volumes) => {
      const local = volumes.find((v) => v.uid === localUserId);
      if (local) {
        setLocalAudioLevel(local.level);
      }
    },
  });

  const isConnected = status === ConnectionStatus.CONNECTED;
  const isConnecting = status === ConnectionStatus.CONNECTING || status === ConnectionStatus.RECONNECTING;
  const canJoin = sdkLoaded && config.appId && config.channelId && config.userId && !isConnecting && !isConnected;

  // Session heartbeat
  useEffect(() => {
    if (sessionId && isConnected) {
      heartbeatRef.current = window.setInterval(async () => {
        try {
          await apiRequest("POST", `/api/sessions/${sessionId}/heartbeat`);
        } catch (error) {
          console.error("Heartbeat failed:", error);
        }
      }, 30000); // Every 30 seconds
    }
    
    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [sessionId, isConnected]);

  const handleJoin = useCallback(async () => {
    if (!config.appId || !config.channelId || !config.userId) {
      toast({
        title: "Missing Configuration",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    try {
      // Create session on backend
      const sessionRes = await apiRequest("POST", "/api/sessions", {
        channelId: config.channelId,
        userId: config.userId,
      });
      const sessionData = await sessionRes.json();
      setSessionId(sessionData.sessionId);
      addLog(`Session created: ${sessionData.sessionId}`, "info");

      // Join Agora channel
      const uid = await join(
        config.appId,
        config.channelId,
        config.token || null,
        config.userId
      );
      setLocalUserId(uid);
      toast({
        title: "Connected",
        description: `Joined channel ${config.channelId} as ${uid}`,
      });
    } catch (error) {
      toast({
        title: "Connection Failed",
        description: error instanceof Error ? error.message : "Failed to join channel",
        variant: "destructive",
      });
    }
  }, [config, join, toast, addLog]);

  const handleLeave = useCallback(async () => {
    // Stop heartbeat FIRST to prevent race condition
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }

    // End session on backend
    const currentSessionId = sessionId;
    if (currentSessionId) {
      setSessionId(null); // Clear immediately to prevent further heartbeats
      try {
        await apiRequest("DELETE", `/api/sessions/${currentSessionId}`);
        addLog("Session ended", "info");
      } catch (error) {
        console.error("Failed to end session:", error);
      }
    }

    await leave();
    setLocalUserId(undefined);
    setLocalAudioLevel(0);
    toast({
      title: "Disconnected",
      description: "Left the voice channel",
    });
  }, [leave, toast, sessionId, addLog]);

  // Keep refs in sync for cleanup
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    leaveRef.current = leave;
  }, [leave]);

  // Cleanup session and Agora client on unmount
  useEffect(() => {
    return () => {
      // Stop heartbeat
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
      // Leave Agora channel
      if (leaveRef.current) {
        leaveRef.current().catch(() => {});
      }
      // End session on backend
      if (sessionIdRef.current) {
        fetch(`/api/sessions/${sessionIdRef.current}`, { method: "DELETE" }).catch(() => {});
      }
    };
  }, []);

  const handleBotJoin = useCallback(async () => {
    if (!config.appId || !config.channelId) {
      toast({
        title: "Missing Configuration",
        description: "App ID and Channel are required to join the bot",
        variant: "destructive",
      });
      return;
    }

    const botUid = 9999;
    const success = await audioBot.joinChannel(
      config.appId,
      config.channelId,
      botUid,
      config.token || ""
    );

    if (success) {
      toast({
        title: "Bot Connected",
        description: `Audio bot joined channel ${config.channelId}`,
      });
      addLog(`Audio bot joined channel as UID ${botUid}`, "success");
    } else {
      toast({
        title: "Bot Connection Failed",
        description: audioBot.error || "Failed to connect audio bot",
        variant: "destructive",
      });
    }
  }, [config, audioBot, toast, addLog]);

  const handleBotLeave = useCallback(async () => {
    const success = await audioBot.leaveChannel();
    if (success) {
      toast({
        title: "Bot Disconnected",
        description: "Audio bot left the channel",
      });
      addLog("Audio bot left the channel", "info");
    }
  }, [audioBot, toast, addLog]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/10">
      <div className="max-w-2xl mx-auto px-4 py-8 md:px-8 relative">
        <div className="absolute top-4 right-4 md:top-8 md:right-8">
          <ThemeToggle />
        </div>

        <header className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="p-3 rounded-xl bg-primary/10">
              <Headphones className="w-8 h-8 text-primary" />
            </div>
            <h1 
              className="text-3xl md:text-4xl font-bold tracking-tight"
              data-testid="text-page-title"
            >
              Agora Voice Bot
            </h1>
          </div>
          <p className="text-muted-foreground text-sm md:text-base">
            Join voice chat channels from your browser
          </p>
        </header>

        <div className="space-y-6">
          {!sdkLoaded && !sdkError && (
            <AlertBanner
              type="loading"
              message="Loading Agora SDK..."
            />
          )}

          {sdkError && (
            <AlertBanner
              type="error"
              title="SDK Load Failed"
              message={sdkError}
            />
          )}

          <StatusDisplay 
            status={status} 
            networkQuality={networkQuality}
          />

          <ConfigForm
            defaultValues={config}
            onValuesChange={setConfig}
            disabled={isConnected || isConnecting}
          />

          {!isConnected && (
            <Button
              onClick={handleJoin}
              disabled={!canJoin}
              className="w-full h-12 text-base font-semibold"
              data-testid="button-join"
            >
              {isConnecting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Connecting...
                </>
              ) : !sdkLoaded ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Loading SDK...
                </>
              ) : (
                <>
                  <Mic className="w-5 h-5 mr-2" />
                  Join Channel
                </>
              )}
            </Button>
          )}

          {isConnected && (
            <>
              <UserList
                remoteUsers={remoteUsers}
                localUserId={localUserId}
                localIsMuted={isMuted}
                localAudioLevel={localAudioLevel}
              />

              <AudioControls
                isMuted={isMuted}
                volume={volume}
                onMuteToggle={toggleMute}
                onVolumeChange={setMicrophoneVolume}
                onLeave={handleLeave}
              />

              <AudioFilePlayer
                isPlaying={isAudioPlaying}
                isPaused={isAudioPaused}
                currentTime={audioCurrentTime}
                duration={audioDuration}
                fileName={audioFileName}
                volume={audioVolume}
                onFileSelect={loadAudioFile}
                onPlay={playAudio}
                onPause={pauseAudio}
                onResume={resumeAudio}
                onStop={stopAudio}
                onSeek={seekAudio}
                onVolumeChange={setAudioFileVolume}
              />
            </>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Bot className="w-4 h-4" />
                Server Audio Bot
              </h3>
              {!audioBot.status.isConnected ? (
                <Button
                  onClick={handleBotJoin}
                  disabled={audioBot.isLoading || !config.appId || !config.channelId}
                  size="sm"
                  data-testid="button-bot-join"
                >
                  Connect Bot
                </Button>
              ) : (
                <Button
                  onClick={handleBotLeave}
                  disabled={audioBot.isLoading}
                  size="sm"
                  variant="outline"
                  data-testid="button-bot-leave"
                >
                  Disconnect Bot
                </Button>
              )}
            </div>

            <ServerAudioPlayer
              isConnected={audioBot.status.isConnected}
              isPlaying={audioBot.status.isPlaying}
              playbackProgress={audioBot.status.playbackProgress}
              playbackDuration={audioBot.status.playbackDuration}
              currentFile={audioBot.status.currentFile}
              uploadedFiles={audioBot.uploadedFiles}
              isLoading={audioBot.isLoading}
              error={audioBot.error}
              onUpload={audioBot.uploadFile}
              onPlay={audioBot.playAudio}
              onStop={audioBot.stopPlayback}
              onDelete={audioBot.deleteFile}
              onRefresh={audioBot.refreshFiles}
            />
          </div>

          <LogsConsole 
            logs={logs} 
            onClear={clearLogs}
          />
        </div>

        <footer className="mt-8 text-center text-xs text-muted-foreground">
          <p>Powered by Agora RTC SDK</p>
        </footer>
      </div>
    </div>
  );
}
