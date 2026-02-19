import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { 
  Radio, 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX,
  AlertCircle,
  Music2,
  Wifi,
  WifiOff
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import AgoraRTC, { IAgoraRTCClient, ILocalAudioTrack } from "agora-rtc-sdk-ng";
import { Howl } from "howler";

interface Song {
  id: string;
  filename: string;
  originalName: string;
  size: number;
}

interface StreamConfig {
  appId: string;
  channel: string;
  token: string;
  userId: string;
}

const BOT_API_URL = import.meta.env.VITE_BOT_API_URL || '';

export default function StreamPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const audioTrackRef = useRef<ILocalAudioTrack | null>(null);
  const howlRef = useRef<Howl | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const connectedNodesRef = useRef<Set<HTMLMediaElement>>(new Set());
  const sseRef = useRef<EventSource | null>(null);
  const songsRef = useRef<Song[]>([]);
  const isProcessingRef = useRef(false);
  const currentIndexRef = useRef(0);
  const isConnectedRef = useRef(false);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const remoteAudioTracksRef = useRef<Map<number, any>>(new Map());
  const sseQueueRef = useRef<Promise<void>>(Promise.resolve());
  
  const { toast } = useToast();

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  const getOrCreateAudioContext = useCallback(async () => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContext();
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  const buildApiUrl = useCallback((path: string) => {
    return BOT_API_URL ? `${BOT_API_URL}${path}` : path;
  }, []);

  const { data: configData, refetch: refetchConfig } = useQuery({
    queryKey: ['/api/jack/stream-config'],
    queryFn: async () => {
      const res = await fetch(buildApiUrl('/api/jack/stream-config'));
      return res.json();
    }
  });

  const { data: songsData } = useQuery({
    queryKey: ['/api/jack/stream-songs'],
    queryFn: async () => {
      const res = await fetch(buildApiUrl('/api/jack/stream-songs'));
      return res.json();
    },
    refetchInterval: 45000,
  });

  const streamConfig: StreamConfig | null = configData?.success ? configData.data : null;
  const songs: Song[] = songsData?.data || [];
  const currentSong = songs[currentIndex];

  useEffect(() => {
    songsRef.current = songs;
    if (songs.length > 0) {
      console.log(`[Songs] Loaded ${songs.length} songs`);
    }
  }, [songs]);

  const cleanupHowl = useCallback((fullCleanup: boolean = false) => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    if (howlRef.current) {
      howlRef.current.unload();
      howlRef.current = null;
    }
    if (fullCleanup) {
      if (mediaSourceRef.current) {
        try {
          mediaSourceRef.current.disconnect();
        } catch {}
        mediaSourceRef.current = null;
      }
      connectedNodesRef.current.clear();
    }
  }, []);

  const cleanupAgoraTrack = useCallback(async () => {
    if (audioTrackRef.current && clientRef.current) {
      try {
        await clientRef.current.unpublish(audioTrackRef.current);
        audioTrackRef.current.stop();
        audioTrackRef.current.close();
      } catch (e) {
        console.log('[Agora] Track cleanup error:', e);
      }
      audioTrackRef.current = null;
    }
  }, []);

  const playAudio = useCallback(async (index: number, streamToAgora: boolean = false) => {
    const song = songsRef.current[index];
    if (!song) return;

    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    try {
      cleanupHowl();

      const audioUrl = buildApiUrl(`/api/jack/songs/file/${song.filename}${streamToAgora ? `?t=${Date.now()}` : ''}`);
      
      const howl = new Howl({
        src: [audioUrl],
        html5: true,
        volume: isMuted ? 0 : volume / 100,
        onload: () => {
          setDuration(howl.duration());
        },
        onplay: () => {
          setIsPlaying(true);
          progressIntervalRef.current = setInterval(() => {
            setCurrentTime(howl.seek() as number);
          }, 250);
        },
        onpause: () => {
          setIsPlaying(false);
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
          }
        },
        onstop: () => {
          setIsPlaying(false);
          setCurrentTime(0);
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
          }
        },
        onend: () => {
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
          }
          const nextIdx = (currentIndexRef.current + 1) % songsRef.current.length;
          setCurrentIndex(nextIdx);
          playAudio(nextIdx, isConnectedRef.current && !!clientRef.current);
        },
        onloaderror: (id: number, error: unknown) => {
          console.error('[Howler] Load error:', error);
          toast({ title: "Load error", description: "Could not load audio file", variant: "destructive" });
          isProcessingRef.current = false;
        },
        onplayerror: (id: number, error: unknown) => {
          console.error('[Howler] Play error:', error);
          howl.once('unlock', () => {
            howl.play();
          });
        }
      });

      howlRef.current = howl;

      howl.play();
      
      if (streamToAgora && clientRef.current) {
        await new Promise(r => setTimeout(r, 100));
        
        const audioContext = await getOrCreateAudioContext();
        
        // @ts-ignore - Access internal audio node from Howler
        const audioNode = howl._sounds[0]?._node as HTMLAudioElement | undefined;
        
        if (audioNode && !connectedNodesRef.current.has(audioNode)) {
          if (audioTrackRef.current) {
            try {
              await clientRef.current!.unpublish(audioTrackRef.current);
              audioTrackRef.current.stop();
              audioTrackRef.current.close();
            } catch (e) {
              console.log('[Agora] Track cleanup:', e);
            }
            audioTrackRef.current = null;
          }
          
          if (mediaSourceRef.current) {
            try {
              mediaSourceRef.current.disconnect();
            } catch {}
            mediaSourceRef.current = null;
          }
          
          const destination = audioContext.createMediaStreamDestination();
          destinationRef.current = destination;
          
          const source = audioContext.createMediaElementSource(audioNode);
          mediaSourceRef.current = source;
          connectedNodesRef.current.add(audioNode);
          
          source.connect(destination);
          source.connect(audioContext.destination);
          
          const track = AgoraRTC.createCustomAudioTrack({
            mediaStreamTrack: destination.stream.getAudioTracks()[0]
          });
          audioTrackRef.current = track;
          await clientRef.current.publish(track);
          
          console.log(`[Agora] Published new track for: ${song.originalName}`);
        } else {
          console.log(`[Agora] Playing (existing connection): ${song.originalName}`);
        }
      }
      toast({ title: "Now playing", description: song.originalName });
    } catch (error: any) {
      console.error('[Playback] Error:', error);
      toast({ title: "Playback error", description: error.message || "Could not play song", variant: "destructive" });
    } finally {
      isProcessingRef.current = false;
    }
  }, [volume, isMuted, cleanupHowl, cleanupAgoraTrack, buildApiUrl, getOrCreateAudioContext, toast]);

  const connect = useCallback(async () => {
    if (!streamConfig) {
      toast({ title: "Error", description: "Stream configuration not available", variant: "destructive" });
      return;
    }

    setIsConnecting(true);

    try {
      await getOrCreateAudioContext();

      const client = AgoraRTC.createClient({ mode: "live", codec: "vp8", role: "host" });
      clientRef.current = client;

      client.on("user-published", async (user, mediaType) => {
        if (mediaType === "audio") {
          await client.subscribe(user, mediaType);
          remoteAudioTracksRef.current.set(user.uid as number, user.audioTrack!);
          console.log(`[Agora] Subscribed to remote user ${user.uid}`);
        }
      });

      client.on("user-unpublished", (user, mediaType) => {
        if (mediaType === "audio") {
          remoteAudioTracksRef.current.delete(user.uid as number);
          console.log(`[Agora] Remote user ${user.uid} unpublished audio`);
        }
      });

      await client.join(
        streamConfig.appId,
        streamConfig.channel,
        streamConfig.token,
        streamConfig.userId
      );

      setIsConnected(true);
      toast({ title: "Connected", description: `Joined channel: ${streamConfig.channel}` });
    } catch (error: any) {
      toast({ title: "Connection failed", description: error.message || "Could not connect to channel", variant: "destructive" });
    } finally {
      setIsConnecting(false);
    }
  }, [streamConfig, getOrCreateAudioContext, toast]);

  const disconnect = useCallback(async () => {
    try {
      await cleanupAgoraTrack();
      cleanupHowl(true);
      destinationRef.current = null;
      
      if (clientRef.current) {
        await clientRef.current.leave();
        clientRef.current = null;
      }
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
    setIsConnected(false);
    isConnectedRef.current = false;
    setIsPlaying(false);
  }, [cleanupHowl, cleanupAgoraTrack]);

  const pauseSong = useCallback(() => {
    if (howlRef.current) {
      howlRef.current.pause();
    }
  }, []);

  const resumeSong = useCallback(() => {
    if (howlRef.current) {
      howlRef.current.play();
    }
  }, []);

  const seekTo = useCallback((time: number) => {
    if (howlRef.current) {
      howlRef.current.seek(time);
      setCurrentTime(time);
    }
  }, []);

  const playNext = useCallback(() => {
    if (songs.length === 0) return;
    const nextIndex = (currentIndex + 1) % songs.length;
    setCurrentIndex(nextIndex);
    playAudio(nextIndex, isConnected);
  }, [songs.length, currentIndex, isConnected, playAudio]);

  const playPrevious = useCallback(() => {
    if (songs.length === 0) return;
    const prevIndex = currentIndex === 0 ? songs.length - 1 : currentIndex - 1;
    setCurrentIndex(prevIndex);
    playAudio(prevIndex, isConnected);
  }, [songs.length, currentIndex, isConnected, playAudio]);

  useEffect(() => {
    if (howlRef.current) {
      howlRef.current.volume(isMuted ? 0 : volume / 100);
    }
  }, [volume, isMuted]);

  const handleSSEMessage = useCallback(async (event: MessageEvent) => {
    if (isProcessingRef.current) return;
    
    try {
      const data = JSON.parse(event.data);
      console.log('Stream event received:', data);
      
      switch (data.action) {
        case 'play': {
          const howl = howlRef.current;
          const hasExistingPausedAudio = howl && !howl.playing() && (howl.seek() as number) > 0;
          
          if (hasExistingPausedAudio) {
            howl.play();
            toast({ title: "Remote Play", description: "Admin resumed playback" });
          } else if (data.songIndex !== undefined) {
            setCurrentIndex(data.songIndex);
            playAudio(data.songIndex, isConnectedRef.current && !!clientRef.current);
            toast({ title: "Remote Play", description: "Admin triggered play command" });
          }
          break;
        }
        
        case 'pause':
          pauseSong();
          toast({ title: "Remote Pause", description: "Admin paused the stream" });
          break;
        
        case 'next':
          if (data.songIndex !== undefined) {
            setCurrentIndex(data.songIndex);
            playAudio(data.songIndex, isConnectedRef.current && !!clientRef.current);
          }
          toast({ title: "Remote Next", description: "Admin skipped to next song" });
          break;
        
        case 'stop':
          if (howlRef.current) {
            howlRef.current.stop();
          }
          toast({ title: "Remote Stop", description: "Admin stopped the stream" });
          break;
        
        case 'youtube': {
          if (data.url) {
            console.log('[YouTube] Playing URL:', data.url);
            console.log('[YouTube] Current volume:', volume, 'isMuted:', isMuted);
            
            cleanupHowl();
            
            const audioEl = new Audio();
            audioEl.crossOrigin = 'anonymous';
            const resolvedUrl = data.url.startsWith('/') ? buildApiUrl(data.url) : data.url;
            audioEl.src = resolvedUrl;
            audioEl.volume = isMuted ? 0 : volume / 100;
            
            const howl = new Howl({
              src: [resolvedUrl],
              html5: true,
              volume: 1,
              format: ['webm', 'opus', 'm4a', 'mp3', 'ogg'],
              onload: () => {
                console.log('[YouTube] Audio loaded, duration:', howl.duration());
                setDuration(howl.duration());
                howl.volume(isMuted ? 0 : volume / 100);
                console.log('[YouTube] Volume set to:', howl.volume());
              },
              onplay: () => {
                console.log('[YouTube] Playing started');
                setIsPlaying(true);
                progressIntervalRef.current = setInterval(() => {
                  setCurrentTime(howl.seek() as number);
                }, 250);
              },
              onpause: () => {
                setIsPlaying(false);
                if (progressIntervalRef.current) {
                  clearInterval(progressIntervalRef.current);
                }
              },
              onstop: () => {
                setIsPlaying(false);
                setCurrentTime(0);
                if (progressIntervalRef.current) {
                  clearInterval(progressIntervalRef.current);
                }
              },
              onend: () => {
                if (progressIntervalRef.current) {
                  clearInterval(progressIntervalRef.current);
                }
                setIsPlaying(false);
                setCurrentTime(0);
              },
              onloaderror: (id: number, error: unknown) => {
                console.error('[Howler] YouTube load error:', error);
                toast({ title: "Load error", description: "Could not load YouTube audio", variant: "destructive" });
              },
              onplayerror: (id: number, error: unknown) => {
                console.error('[Howler] YouTube play error:', error);
                howl.once('unlock', () => {
                  console.log('[YouTube] Audio unlocked, attempting play');
                  howl.play();
                });
              }
            });

            howlRef.current = howl;
            
            setTimeout(() => {
              if (howlRef.current) {
                howlRef.current.volume(isMuted ? 0 : volume / 100);
                console.log('[YouTube] Delayed volume set to:', howlRef.current.volume());
              }
            }, 500);
            
            howl.play();
            
            if (isConnectedRef.current && clientRef.current) {
              (async () => {
                try {
                  await new Promise(r => setTimeout(r, 100));
                  
                  const audioContext = await getOrCreateAudioContext();
                  
                  // @ts-ignore - Access internal audio node from Howler
                  const audioNode = howl._sounds[0]?._node as HTMLAudioElement | undefined;
                  
                  if (audioNode && !connectedNodesRef.current.has(audioNode)) {
                    audioNode.crossOrigin = 'anonymous';
                    
                    if (audioTrackRef.current) {
                      try {
                        await clientRef.current!.unpublish(audioTrackRef.current);
                        audioTrackRef.current.stop();
                        audioTrackRef.current.close();
                      } catch (e) {
                        console.log('[Agora] Track cleanup:', e);
                      }
                      audioTrackRef.current = null;
                    }
                    
                    if (mediaSourceRef.current) {
                      try {
                        mediaSourceRef.current.disconnect();
                      } catch {}
                      mediaSourceRef.current = null;
                    }
                    
                    const destination = audioContext.createMediaStreamDestination();
                    destinationRef.current = destination;
                    
                    const source = audioContext.createMediaElementSource(audioNode);
                    mediaSourceRef.current = source;
                    connectedNodesRef.current.add(audioNode);
                    
                    source.connect(destination);
                    source.connect(audioContext.destination);
                    
                    const track = AgoraRTC.createCustomAudioTrack({
                      mediaStreamTrack: destination.stream.getAudioTracks()[0]
                    });
                    audioTrackRef.current = track;
                    await clientRef.current!.publish(track);
                    
                    console.log(`[Agora] Published YouTube track via proxy`);
                    toast({ title: "YouTube → Agora", description: data.songName || "Streaming to voice channel" });
                  }
                } catch (err) {
                  console.error('[Agora] YouTube stream error:', err);
                  toast({ title: "YouTube", description: data.songName || "Playing locally (Agora error)" });
                }
              })();
            } else {
              toast({ title: "YouTube", description: data.songName || "Playing YouTube audio" });
            }
          }
          break;
        }

        case 'credentials': {
          console.log('[Stream] Received fresh Agora credentials from bot TMS');
          try {
            if (isConnectedRef.current && clientRef.current) {
              await disconnect();
            }
            const { appId, channel, token, userId } = data;
            if (appId && channel && token) {
              setIsConnecting(true);
              const client = AgoraRTC.createClient({ mode: "live", codec: "vp8", role: "host" });
              clientRef.current = client;

              client.on("user-published", async (user, mediaType) => {
                if (mediaType === "audio") {
                  await client.subscribe(user, mediaType);
                  remoteAudioTracksRef.current.set(user.uid as number, user.audioTrack!);
                  console.log(`[Agora] Subscribed to remote user ${user.uid}`);
                }
              });
              client.on("user-unpublished", (user, mediaType) => {
                if (mediaType === "audio") {
                  remoteAudioTracksRef.current.delete(user.uid as number);
                }
              });

              await client.join(appId, channel, token, userId);
              setIsConnected(true);
              isConnectedRef.current = true;
              refetchConfig();
              toast({ title: "Agora Connected", description: "Ready to stream with fresh credentials" });
            }
          } catch (err: any) {
            console.error('[Agora] Credentials connect error:', err);
            toast({ title: "Connection Failed", description: err.message, variant: "destructive" });
          } finally {
            setIsConnecting(false);
          }
          break;
        }
        
        case 'reconnect':
          toast({ title: "Reconnecting", description: "Admin triggered Agora reconnect..." });
          await disconnect();
          
          try {
            const configRes = await fetch(buildApiUrl('/api/jack/stream-config'));
            const freshConfig = await configRes.json();
            
            if (freshConfig.success && freshConfig.data) {
              const { appId, channel, token, userId } = freshConfig.data;
              
              setIsConnecting(true);
              const client = AgoraRTC.createClient({ mode: "live", codec: "vp8", role: "host" });
              clientRef.current = client;
              
              await client.join(appId, channel, token, userId);
              
              setIsConnected(true);
              setCurrentIndex(0);
              refetchConfig();
              
              setTimeout(() => playAudio(0, true), 500);
              toast({ title: "Reconnected", description: `Joined channel: ${channel}` });
            } else {
              setCurrentIndex(0);
              setTimeout(() => playAudio(0, false), 100);
              toast({ title: "Playing Locally", description: "No Agora credentials available" });
            }
          } catch (err: any) {
            console.error('Error reconnecting:', err);
            toast({ title: "Reconnect Failed", description: err.message || "Could not reconnect", variant: "destructive" });
            setCurrentIndex(0);
            setTimeout(() => playAudio(0, false), 100);
          } finally {
            setIsConnecting(false);
          }
          break;
      }
    } catch (err) {
      console.error('Error parsing SSE event:', err);
    }
  }, [playAudio, pauseSong, disconnect, buildApiUrl, refetchConfig, toast, cleanupHowl, getOrCreateAudioContext, volume, isMuted]);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    
    const connectSSE = () => {
      const sseUrl = buildApiUrl('/api/jack/stream-events');
      console.log('Connecting to SSE at:', sseUrl);
      
      eventSource = new EventSource(sseUrl);
      sseRef.current = eventSource;

      eventSource.onmessage = (event: MessageEvent) => {
        sseQueueRef.current = sseQueueRef.current
          .then(() => handleSSEMessage(event))
          .catch((err) => console.error('[SSE Queue] Error:', err));
      };

      eventSource.onerror = () => {
        console.error('SSE connection error, reconnecting in 5s...');
        eventSource?.close();
        reconnectTimeout = setTimeout(connectSSE, 5000);
      };
    };
    
    connectSSE();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      eventSource?.close();
      sseRef.current = null;
    };
  }, [buildApiUrl, handleSSEMessage]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const configError = configData && !configData.success;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Stream</h1>
        <p className="text-muted-foreground mt-1">
          Stream music to Agora channel
        </p>
      </div>

      {configError && (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
              <div>
                <p className="font-medium text-amber-700 dark:text-amber-400">Configuration Required</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {configData.message}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="h-5 w-5 text-primary" />
              <CardTitle>Stream Control</CardTitle>
            </div>
            <Badge variant={isConnected ? "default" : "secondary"} className="gap-1">
              {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {isConnected ? "Connected" : "Disconnected"}
            </Badge>
          </div>
          <CardDescription>
            {streamConfig ? `Channel: ${streamConfig.channel}` : "Configure Agora credentials in .env file"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex gap-3">
            {!isConnected ? (
              <Button 
                onClick={connect} 
                disabled={isConnecting || !streamConfig}
                className="gap-2"
              >
                {isConnecting ? (
                  <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                ) : (
                  <Wifi className="h-4 w-4" />
                )}
                {isConnecting ? "Connecting..." : "Connect"}
              </Button>
            ) : (
              <Button onClick={disconnect} variant="destructive" className="gap-2">
                <WifiOff className="h-4 w-4" />
                Disconnect
              </Button>
            )}
          </div>

          {isConnected && (
            <div className="space-y-4 p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center h-16 w-16 rounded-lg bg-primary/10">
                  <Music2 className="h-8 w-8 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {currentSong?.originalName || "No song selected"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {songs.length > 0 ? `Track ${currentIndex + 1} of ${songs.length}` : "No songs in queue"}
                  </p>
                </div>
              </div>

              {currentSong && (
                <>
                  <div className="space-y-2">
                    <Slider
                      value={[currentTime]}
                      max={duration || 100}
                      step={1}
                      className="cursor-pointer"
                      onValueChange={([val]) => seekTo(val)}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{formatTime(currentTime)}</span>
                      <span>{formatTime(duration)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-2">
                    <Button variant="ghost" size="icon" onClick={playPrevious}>
                      <SkipBack className="h-5 w-5" />
                    </Button>
                    
                    {isPlaying ? (
                      <Button size="icon" className="h-12 w-12" onClick={pauseSong}>
                        <Pause className="h-6 w-6" />
                      </Button>
                    ) : (
                      <Button size="icon" className="h-12 w-12" onClick={() => {
                        if (howlRef.current && (howlRef.current.seek() as number) > 0) {
                          resumeSong();
                        } else {
                          playAudio(currentIndex, true);
                        }
                      }}>
                        <Play className="h-6 w-6" />
                      </Button>
                    )}
                    
                    <Button variant="ghost" size="icon" onClick={playNext}>
                      <SkipForward className="h-5 w-5" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsMuted(!isMuted)}
                    >
                      {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </Button>
                    <Slider
                      value={[isMuted ? 0 : volume]}
                      max={100}
                      step={1}
                      className="flex-1"
                      onValueChange={([val]) => {
                        setVolume(val);
                        if (val > 0) setIsMuted(false);
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {songs.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Queue ({songs.length} songs)</h3>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {songs.map((song, idx) => (
                  <div
                    key={song.id}
                    className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-muted/50 ${
                      idx === currentIndex ? 'bg-primary/10' : ''
                    }`}
                    onClick={() => {
                      setCurrentIndex(idx);
                      playAudio(idx, isConnected);
                    }}
                  >
                    <span className="text-xs text-muted-foreground w-6">{idx + 1}</span>
                    <span className="truncate text-sm">{song.originalName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
