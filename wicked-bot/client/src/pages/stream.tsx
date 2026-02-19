import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  WifiOff,
  Mic,
  MicOff,
  Send,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import AgoraRTC, { IAgoraRTCClient, ILocalAudioTrack, IRemoteAudioTrack } from "agora-rtc-sdk-ng";
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

interface GPTAudioChunk {
  buffer: AudioBuffer;
  timestamp: number;
}

const BOT_API_URL = import.meta.env.VITE_BOT_API_URL || '';

export default function StreamPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [openaiKey, setOpenaiKey] = useState('');
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const [isTalkingEnabled, setIsTalkingEnabled] = useState(false);
  const [isGPTConnected, setIsGPTConnected] = useState(false);
  const [isGPTSpeaking, setIsGPTSpeaking] = useState(false);
  const [gptMessage, setGptMessage] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [botName, setBotName] = useState("Bot");
  
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
  
  const gptWebSocketRef = useRef<WebSocket | null>(null);
  const gptAudioQueueRef = useRef<GPTAudioChunk[]>([]);
  const gptSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gptTrackRef = useRef<ILocalAudioTrack | null>(null);
  const gptDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const gptIsPlayingRef = useRef(false);
  const gptNextStartTimeRef = useRef(0);
  const remoteAudioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const remoteAudioTracksRef = useRef<Map<number, IRemoteAudioTrack>>(new Map());
  const isTalkingEnabledRef = useRef(false);
  const sseQueueRef = useRef<Promise<void>>(Promise.resolve());
  
  const { toast } = useToast();

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  useEffect(() => {
    isTalkingEnabledRef.current = isTalkingEnabled;
  }, [isTalkingEnabled]);

  const { data: botConfigData } = useQuery({
    queryKey: ['/api/jack/bot-config'],
    queryFn: async () => {
      const res = await fetch(buildApiUrl('/api/jack/bot-config'));
      return res.json();
    }
  });

  useEffect(() => {
    if (botConfigData?.success && botConfigData?.data?.botName) {
      setBotName(botConfigData.data.botName);
    }
  }, [botConfigData]);

  useEffect(() => {
    fetch('/api/jack/openai-key')
      .then(res => res.json())
      .then(data => { if (data.success) setOpenaiKey(data.key); })
      .catch(() => {});
  }, []);

  const getOrCreateAudioContext = useCallback(async () => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
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
        try { mediaSourceRef.current.disconnect(); } catch {}
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

  const base64ToInt16Array = useCallback((base64: string): Int16Array => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Int16Array(bytes.buffer);
  }, []);

  const pcm16ToAudioBuffer = useCallback(async (pcmData: Int16Array, sampleRate: number = 24000): Promise<AudioBuffer> => {
    const audioContext = await getOrCreateAudioContext();
    const audioBuffer = audioContext.createBuffer(1, pcmData.length, sampleRate);
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < pcmData.length; i++) {
      channelData[i] = pcmData[i] / 32768.0;
    }
    return audioBuffer;
  }, [getOrCreateAudioContext]);

  const int16ArrayToBase64 = useCallback((int16Array: Int16Array): string => {
    const uint8 = new Uint8Array(int16Array.buffer);
    let binary = '';
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    return btoa(binary);
  }, []);

  const floatTo16BitPCM = useCallback((float32Array: Float32Array): Int16Array => {
    const int16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16;
  }, []);

  const downsampleBuffer = useCallback((buffer: Float32Array, inputSampleRate: number, outputSampleRate: number): Float32Array => {
    if (inputSampleRate === outputSampleRate) return buffer;
    const ratio = inputSampleRate / outputSampleRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const index = Math.round(i * ratio);
      result[i] = buffer[Math.min(index, buffer.length - 1)];
    }
    return result;
  }, []);

  const stopRemoteAudioCapture = useCallback(() => {
    if (remoteAudioProcessorRef.current) {
      try { remoteAudioProcessorRef.current.disconnect(); } catch {}
      remoteAudioProcessorRef.current = null;
    }
    remoteAudioTracksRef.current.clear();
    console.log('[Agora] Stopped remote audio capture');
  }, []);

  const startRemoteAudioCapture = useCallback(async () => {
    if (!clientRef.current) return;
    
    const audioContext = await getOrCreateAudioContext();
    const bufferSize = 4096;
    const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
    remoteAudioProcessorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (!gptWebSocketRef.current || gptWebSocketRef.current.readyState !== WebSocket.OPEN) return;
      if (!isTalkingEnabledRef.current) return;
      if (gptIsPlayingRef.current) return;
      
      const inputData = e.inputBuffer.getChannelData(0);
      
      let hasSignal = false;
      for (let i = 0; i < inputData.length; i++) {
        if (Math.abs(inputData[i]) > 0.001) {
          hasSignal = true;
          break;
        }
      }
      if (!hasSignal) return;
      
      const downsampled = downsampleBuffer(inputData, audioContext.sampleRate, 24000);
      const pcm16 = floatTo16BitPCM(downsampled);
      const base64Audio = int16ArrayToBase64(pcm16);
      
      try {
        gptWebSocketRef.current.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: base64Audio
        }));
      } catch (err) {
        console.error('[GPT] Error sending audio:', err);
      }
    };

    processor.connect(audioContext.destination);

    for (const [uid, track] of remoteAudioTracksRef.current) {
      try {
        const mediaStream = new MediaStream([track.getMediaStreamTrack()]);
        const source = audioContext.createMediaStreamSource(mediaStream);
        source.connect(processor);
        console.log(`[Agora] Connected remote user ${uid} audio to GPT processor`);
      } catch (err) {
        console.error(`[Agora] Error connecting remote user ${uid}:`, err);
      }
    }

    console.log('[Agora] Remote audio capture started');
  }, [getOrCreateAudioContext, downsampleBuffer, floatTo16BitPCM, int16ArrayToBase64]);

  const playGPTAudioQueue = useCallback(async () => {
    if (gptIsPlayingRef.current || gptAudioQueueRef.current.length === 0) return;

    gptIsPlayingRef.current = true;
    
    try {
      const audioContext = await getOrCreateAudioContext();

      let destination = gptDestinationRef.current;
      if (!destination || destination.context !== audioContext) {
        destination = audioContext.createMediaStreamDestination();
        gptDestinationRef.current = destination;
        
        if (clientRef.current && isConnectedRef.current) {
          try {
            if (gptTrackRef.current) {
              await clientRef.current.unpublish(gptTrackRef.current);
              gptTrackRef.current.stop();
              gptTrackRef.current.close();
            }
            
            const track = AgoraRTC.createCustomAudioTrack({
              mediaStreamTrack: destination.stream.getAudioTracks()[0]
            });
            
            gptTrackRef.current = track;
            await clientRef.current.publish(track);
            console.log('[GPT] Published persistent Agora track');
          } catch (err) {
            console.error('[GPT] Agora publish error:', err);
          }
        }
      }

      const playNextChunk = async () => {
        if (gptAudioQueueRef.current.length === 0) {
          gptIsPlayingRef.current = false;
          setIsGPTSpeaking(false);
          return;
        }

        const chunk = gptAudioQueueRef.current.shift()!;
        const source = audioContext.createBufferSource();
        source.buffer = chunk.buffer;

        source.connect(destination);
        source.connect(audioContext.destination);
        
        const currentTime = audioContext.currentTime;
        const startTime = Math.max(currentTime, gptNextStartTimeRef.current);
        source.start(startTime);
        gptNextStartTimeRef.current = startTime + chunk.buffer.duration;

        source.onended = () => {
          playNextChunk();
        };

        gptSourceNodeRef.current = source;
      };

      await playNextChunk();
    } catch (error) {
      console.error('[GPT] Playback error:', error);
      gptIsPlayingRef.current = false;
      setIsGPTSpeaking(false);
    }
  }, [getOrCreateAudioContext]);

  const connectGPT = useCallback(async () => {
    if (!openaiKey) {
      toast({
        title: "API Key Missing",
        description: "Set OPENAI in your .env file",
        variant: "destructive"
      });
      return;
    }

    try {
      const url = `wss://api.openai.com/v1/realtime?model=gpt-realtime-mini-2025-12-15`;
      
      const ws = new WebSocket(url, [
        'realtime',
        `openai-insecure-api-key.${openaiKey}`
      ]);

      ws.onopen = () => {
        console.log('[GPT] WebSocket connected');
        setIsGPTConnected(true);
        
        const currentBotName = botName || 'Bot';
        
        const sessionConfig = {
          type: 'session.update',
          session: {
            type: 'realtime',
            model: 'gpt-realtime-mini-2025-12-15',
            output_modalities: ['audio'],
            instructions: `You are ${currentBotName}, a friendly club bot. You speak in Roman Urdu/Punjabi style. IMPORTANT RULES: 1) Only respond when someone clearly addresses you by saying "${currentBotName}" or a close variation of your name. 2) If nobody mentions your name, stay completely silent - do NOT generate any response. 3) Keep responses brief (1-2 sentences). 4) Be fun and engaging when addressed.`,
            tools: [],
            tool_choice: 'auto',
            max_output_tokens: 'inf',
            audio: {
              input: {
                format: {
                  type: 'audio/pcm',
                  rate: 24000
                },
                transcription: {
                  model: 'whisper-1'
                },
                turn_detection: {
                  type: 'server_vad',
                  threshold: 0.5,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 500
                }
              },
              output: {
                format: {
                  type: 'audio/pcm',
                  rate: 24000
                },
                voice: 'marin',
                speed: 1.0
              }
            }
          }
        };
        
        console.log('[GPT] Sending session config');
        ws.send(JSON.stringify(sessionConfig));

        toast({ title: "GPT Connected", description: `Voice AI ready as ${currentBotName}` });

        setTimeout(() => {
          if (isTalkingEnabledRef.current) {
            startRemoteAudioCapture();
          }
        }, 1000);
      };

      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'session.created':
            console.log('[GPT] Session created');
            break;
          case 'session.updated':
            console.log('[GPT] Session updated');
            break;
          case 'response.output_audio.delta':
            try {
              const audioData = base64ToInt16Array(data.delta);
              const audioBuffer = await pcm16ToAudioBuffer(audioData);
              gptAudioQueueRef.current.push({ buffer: audioBuffer, timestamp: Date.now() });
              setIsGPTSpeaking(true);
              if (!gptIsPlayingRef.current) {
                playGPTAudioQueue();
              }
            } catch (err) {
              console.error('[GPT] Error processing audio delta:', err);
            }
            break;
          case 'response.output_audio.done':
            console.log('[GPT] Audio response complete');
            break;
          case 'response.output_audio_transcript.delta':
            console.log('[GPT] Transcript:', data.delta);
            break;
          case 'conversation.item.input_audio_transcription.completed':
            console.log('[GPT] User said:', data.transcript);
            break;
          case 'response.done':
            setIsSendingMessage(false);
            if (data.response?.status === 'failed') {
              console.error('[GPT] Response failed:', data.response.status_details);
              toast({ title: "GPT Error", description: data.response.status_details?.error?.message || "Response failed", variant: "destructive" });
            }
            break;
          case 'error':
            console.error('[GPT] Error:', data.error);
            toast({ title: "GPT Error", description: data.error.message || "An error occurred", variant: "destructive" });
            setIsSendingMessage(false);
            break;
          case 'input_audio_buffer.speech_started':
            console.log('[GPT] Speech detected');
            break;
          case 'input_audio_buffer.speech_stopped':
            console.log('[GPT] Speech ended');
            break;
          default:
            break;
        }
      };

      ws.onerror = (error) => {
        console.error('[GPT] WebSocket error:', error);
        toast({ title: "GPT Connection Error", description: "Check your API key", variant: "destructive" });
        setIsGPTConnected(false);
      };

      ws.onclose = (event) => {
        console.log('[GPT] WebSocket closed:', event.code);
        setIsGPTConnected(false);
        setIsGPTSpeaking(false);
        stopRemoteAudioCapture();
        if (event.code !== 1000) {
          toast({ title: "GPT Disconnected", description: event.reason || `Code: ${event.code}`, variant: "destructive" });
        }
      };

      gptWebSocketRef.current = ws;
    } catch (error: any) {
      console.error('[GPT] Connection error:', error);
      toast({ title: "GPT Connection Failed", description: error.message, variant: "destructive" });
    }
  }, [toast, base64ToInt16Array, pcm16ToAudioBuffer, playGPTAudioQueue, botName, startRemoteAudioCapture, stopRemoteAudioCapture]);

  const disconnectGPT = useCallback(() => {
    stopRemoteAudioCapture();
    
    if (gptWebSocketRef.current) {
      gptWebSocketRef.current.close();
      gptWebSocketRef.current = null;
    }

    if (gptSourceNodeRef.current) {
      try { gptSourceNodeRef.current.stop(); } catch {}
      gptSourceNodeRef.current = null;
    }

    if (gptTrackRef.current && clientRef.current) {
      try {
        clientRef.current.unpublish(gptTrackRef.current);
        gptTrackRef.current.stop();
        gptTrackRef.current.close();
      } catch {}
      gptTrackRef.current = null;
    }

    gptAudioQueueRef.current = [];
    gptIsPlayingRef.current = false;
    gptNextStartTimeRef.current = 0;
    gptDestinationRef.current = null;
    setIsGPTConnected(false);
    setIsGPTSpeaking(false);
    setIsSendingMessage(false);
  }, [stopRemoteAudioCapture]);

  const sendMessageToGPT = useCallback(async (message: string) => {
    if (!gptWebSocketRef.current || !message.trim()) return;
    if (gptWebSocketRef.current.readyState !== WebSocket.OPEN) {
      toast({ title: "Not Connected", description: "GPT is not connected", variant: "destructive" });
      return;
    }

    setIsSendingMessage(true);
    await getOrCreateAudioContext();

    gptAudioQueueRef.current = [];
    gptNextStartTimeRef.current = 0;
    
    try {
      gptWebSocketRef.current.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: message }]
        }
      }));

      gptWebSocketRef.current.send(JSON.stringify({
        type: 'response.create',
        response: {
          instructions: 'Respond in a natural, conversational tone. Keep it brief.'
        }
      }));
    } catch (error) {
      console.error('[GPT] Error sending message:', error);
      toast({ title: "Send Error", description: "Failed to send message", variant: "destructive" });
      setIsSendingMessage(false);
    }
  }, [toast, getOrCreateAudioContext]);

  const handleTalkingToggle = useCallback(async (enabled: boolean) => {
    if (enabled) {
      if (howlRef.current) {
        howlRef.current.stop();
        cleanupHowl(true);
      }
      setIsPlaying(false);
      await connectGPT();
    } else {
      disconnectGPT();
    }
    setIsTalkingEnabled(enabled);
  }, [connectGPT, disconnectGPT, cleanupHowl]);

  const playAudio = useCallback(async (index: number, streamToAgora: boolean = false) => {
    if (isTalkingEnabled) {
      toast({ title: "Music Disabled", description: "Disable talking mode to play music" });
      return;
    }

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
        onload: () => { setDuration(howl.duration()); },
        onplay: () => {
          setIsPlaying(true);
          progressIntervalRef.current = setInterval(() => {
            setCurrentTime(howl.seek() as number);
          }, 250);
        },
        onpause: () => {
          setIsPlaying(false);
          if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
        },
        onstop: () => {
          setIsPlaying(false);
          setCurrentTime(0);
          if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
        },
        onend: () => {
          if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
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
          howl.once('unlock', () => { howl.play(); });
        }
      });

      howlRef.current = howl;
      howl.play();
      
      if (streamToAgora && clientRef.current) {
        await new Promise(r => setTimeout(r, 100));
        const audioContext = await getOrCreateAudioContext();
        // @ts-ignore
        const audioNode = howl._sounds[0]?._node as HTMLAudioElement | undefined;
        
        if (audioNode && !connectedNodesRef.current.has(audioNode)) {
          if (audioTrackRef.current) {
            try {
              await clientRef.current!.unpublish(audioTrackRef.current);
              audioTrackRef.current.stop();
              audioTrackRef.current.close();
            } catch (e) { console.log('[Agora] Track cleanup:', e); }
            audioTrackRef.current = null;
          }
          if (mediaSourceRef.current) {
            try { mediaSourceRef.current.disconnect(); } catch {}
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
          console.log(`[Agora] Published track for: ${song.originalName}`);
        }
      }
      toast({ title: "Now playing", description: song.originalName });
    } catch (error: any) {
      console.error('[Playback] Error:', error);
      toast({ title: "Playback error", description: error.message || "Could not play song", variant: "destructive" });
    } finally {
      isProcessingRef.current = false;
    }
  }, [volume, isMuted, isTalkingEnabled, cleanupHowl, buildApiUrl, getOrCreateAudioContext, toast]);

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
          const remoteTrack = user.audioTrack;
          if (remoteTrack) {
            remoteAudioTracksRef.current.set(user.uid as number, remoteTrack);
            console.log(`[Agora] Subscribed to remote user ${user.uid} audio`);
            
            if (isTalkingEnabledRef.current && gptWebSocketRef.current) {
              try {
                const audioContext = await getOrCreateAudioContext();
                const mediaStream = new MediaStream([remoteTrack.getMediaStreamTrack()]);
                const source = audioContext.createMediaStreamSource(mediaStream);
                if (remoteAudioProcessorRef.current) {
                  source.connect(remoteAudioProcessorRef.current);
                  console.log(`[Agora] Connected new remote user ${user.uid} to GPT processor`);
                }
              } catch (err) {
                console.error(`[Agora] Error connecting new remote user:`, err);
              }
            }
          }
        }
      });

      client.on("user-unpublished", (user, mediaType) => {
        if (mediaType === "audio") {
          remoteAudioTracksRef.current.delete(user.uid as number);
          console.log(`[Agora] Remote user ${user.uid} unpublished audio`);
        }
      });

      await client.join(streamConfig.appId, streamConfig.channel, streamConfig.token, streamConfig.userId);

      setIsConnected(true);
      toast({ title: "Connected", description: `Joined channel: ${streamConfig.channel}` });
    } catch (error: any) {
      toast({ title: "Connection failed", description: error.message || "Could not connect", variant: "destructive" });
    } finally {
      setIsConnecting(false);
    }
  }, [streamConfig, getOrCreateAudioContext, toast]);

  const disconnect = useCallback(async () => {
    try {
      await cleanupAgoraTrack();
      cleanupHowl(true);
      destinationRef.current = null;
      disconnectGPT();
      
      if (clientRef.current) {
        await clientRef.current.leave();
        clientRef.current = null;
      }
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
    setIsConnected(false);
    setIsPlaying(false);
    setIsTalkingEnabled(false);
  }, [cleanupHowl, cleanupAgoraTrack, disconnectGPT]);

  const pauseSong = useCallback(() => {
    if (howlRef.current) howlRef.current.pause();
  }, []);

  const resumeSong = useCallback(() => {
    if (howlRef.current) howlRef.current.play();
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
          if (isTalkingEnabled) {
            toast({ title: "Music Disabled", description: "Talking mode is active" });
            return;
          }
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
          if (howlRef.current) howlRef.current.stop();
          toast({ title: "Remote Stop", description: "Admin stopped the stream" });
          break;
        case 'talk':
          if (data.enable !== undefined) {
            await handleTalkingToggle(data.enable);
            toast({ 
              title: data.enable ? "Talking Enabled" : "Talking Disabled", 
              description: data.enable ? "Music stopped, GPT activated" : "GPT deactivated" 
            });
          }
          if (data.message) {
            const waitForGPT = async (retries = 20) => {
              for (let i = 0; i < retries; i++) {
                if (gptWebSocketRef.current && gptWebSocketRef.current.readyState === WebSocket.OPEN) {
                  sendMessageToGPT(data.message);
                  return;
                }
                await new Promise(r => setTimeout(r, 500));
              }
              toast({ title: "GPT Not Ready", description: "Could not send message - GPT didn't connect in time", variant: "destructive" });
            };
            waitForGPT();
          }
          break;
        case 'dedication': {
          if (isTalkingEnabled) {
            toast({ title: "Music Disabled", description: "Talking mode is active" });
            return;
          }
          if (data.url) {
            cleanupHowl();
            toast({ title: "💖 Dedication", description: `"${data.songName}" for ${data.dedicatedTo}` });
            const resolvedDedicationUrl = data.url.startsWith('/') ? buildApiUrl(data.url) : data.url;
            const howl = new Howl({
              src: [resolvedDedicationUrl],
              html5: true,
              volume: isMuted ? 0 : volume / 100,
              format: ['webm', 'opus', 'm4a', 'mp3', 'ogg'],
              onload: () => {
                setDuration(howl.duration());
                howl.volume(isMuted ? 0 : volume / 100);
              },
              onplay: () => {
                setIsPlaying(true);
                progressIntervalRef.current = setInterval(() => {
                  setCurrentTime(howl.seek() as number);
                }, 250);
              },
              onpause: () => {
                setIsPlaying(false);
                if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
              },
              onstop: () => {
                setIsPlaying(false);
                setCurrentTime(0);
                if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
              },
              onend: () => {
                if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
                setIsPlaying(false);
                setCurrentTime(0);
                fetch(`${BOT_API_URL}/api/jack/dedicate/ended`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ dedicationId: data.dedicationId })
                }).catch(() => {});
              },
              onloaderror: (id: number, error: unknown) => {
                console.error('[Howler] Dedication load error:', error);
                toast({ title: "Load error", description: "Could not load dedication audio", variant: "destructive" });
                fetch(`${BOT_API_URL}/api/jack/dedicate/ended`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ dedicationId: data.dedicationId })
                }).catch(() => {});
              },
              onplayerror: (id: number, error: unknown) => {
                console.error('[Howler] Dedication play error:', error);
                howl.once('unlock', () => { howl.play(); });
              }
            });

            howlRef.current = howl;
            howl.play();
            
            if (isConnectedRef.current && clientRef.current) {
              (async () => {
                try {
                  await new Promise(r => setTimeout(r, 100));
                  const audioContext = await getOrCreateAudioContext();
                  // @ts-ignore
                  const audioNode = howl._sounds[0]?._node as HTMLAudioElement | undefined;
                  if (audioNode && !connectedNodesRef.current.has(audioNode)) {
                    audioNode.crossOrigin = 'anonymous';
                    if (audioTrackRef.current) {
                      try {
                        await clientRef.current!.unpublish(audioTrackRef.current);
                        audioTrackRef.current.stop();
                        audioTrackRef.current.close();
                      } catch (e) { console.log('[Agora] cleanup:', e); }
                      audioTrackRef.current = null;
                    }
                    if (mediaSourceRef.current) {
                      try { mediaSourceRef.current.disconnect(); } catch {}
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
                    toast({ title: "Dedication Playing", description: `${data.songName} for ${data.dedicatedTo}` });
                  }
                } catch (err) {
                  console.error('[Agora] Dedication stream error:', err);
                  toast({ title: "Dedication", description: `${data.songName} for ${data.dedicatedTo}` });
                }
              })();
            } else {
              toast({ title: "Dedication", description: `${data.songName} for ${data.dedicatedTo}` });
            }
          }
          break;
        }
        case 'youtube': {
          if (isTalkingEnabled) {
            toast({ title: "Music Disabled", description: "Talking mode is active" });
            return;
          }
          if (data.url) {
            cleanupHowl();
            const resolvedUrl = data.url.startsWith('/') ? buildApiUrl(data.url) : data.url;
            const howl = new Howl({
              src: [resolvedUrl],
              html5: true,
              volume: isMuted ? 0 : volume / 100,
              format: ['webm', 'opus', 'm4a', 'mp3', 'ogg'],
              onload: () => {
                setDuration(howl.duration());
                howl.volume(isMuted ? 0 : volume / 100);
              },
              onplay: () => {
                setIsPlaying(true);
                progressIntervalRef.current = setInterval(() => {
                  setCurrentTime(howl.seek() as number);
                }, 250);
              },
              onpause: () => {
                setIsPlaying(false);
                if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
              },
              onstop: () => {
                setIsPlaying(false);
                setCurrentTime(0);
                if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
              },
              onend: () => {
                if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
                setIsPlaying(false);
                setCurrentTime(0);
              },
              onloaderror: (id: number, error: unknown) => {
                console.error('[Howler] YouTube load error:', error);
                toast({ title: "Load error", description: "Could not load YouTube audio", variant: "destructive" });
              },
              onplayerror: (id: number, error: unknown) => {
                console.error('[Howler] YouTube play error:', error);
                howl.once('unlock', () => { howl.play(); });
              }
            });

            howlRef.current = howl;
            howl.play();
            
            if (isConnectedRef.current && clientRef.current) {
              (async () => {
                try {
                  await new Promise(r => setTimeout(r, 100));
                  const audioContext = await getOrCreateAudioContext();
                  // @ts-ignore
                  const audioNode = howl._sounds[0]?._node as HTMLAudioElement | undefined;
                  if (audioNode && !connectedNodesRef.current.has(audioNode)) {
                    audioNode.crossOrigin = 'anonymous';
                    if (audioTrackRef.current) {
                      try {
                        await clientRef.current!.unpublish(audioTrackRef.current);
                        audioTrackRef.current.stop();
                        audioTrackRef.current.close();
                      } catch (e) { console.log('[Agora] cleanup:', e); }
                      audioTrackRef.current = null;
                    }
                    if (mediaSourceRef.current) {
                      try { mediaSourceRef.current.disconnect(); } catch {}
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
                    toast({ title: "YouTube → Agora", description: data.songName || "Streaming to voice channel" });
                  }
                } catch (err) {
                  console.error('[Agora] YouTube stream error:', err);
                  toast({ title: "YouTube", description: data.songName || "Playing locally" });
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
              if (!isTalkingEnabled) {
                setTimeout(() => playAudio(0, true), 500);
              }
              toast({ title: "Reconnected", description: `Joined channel: ${channel}` });
            } else {
              setCurrentIndex(0);
              if (!isTalkingEnabled) setTimeout(() => playAudio(0, false), 100);
              toast({ title: "Playing Locally", description: "No Agora credentials" });
            }
          } catch (err: any) {
            console.error('Error reconnecting:', err);
            toast({ title: "Reconnect Failed", description: err.message, variant: "destructive" });
            setCurrentIndex(0);
            if (!isTalkingEnabled) setTimeout(() => playAudio(0, false), 100);
          } finally {
            setIsConnecting(false);
          }
          break;
      }
    } catch (err) {
      console.error('Error parsing SSE event:', err);
    }
  }, [playAudio, pauseSong, disconnect, buildApiUrl, refetchConfig, toast, cleanupHowl, getOrCreateAudioContext, volume, isMuted, isTalkingEnabled, handleTalkingToggle, isGPTConnected, sendMessageToGPT]);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    
    const connectSSE = () => {
      const sseUrl = buildApiUrl('/api/jack/stream-events');
      eventSource = new EventSource(sseUrl);
      sseRef.current = eventSource;
      eventSource.onmessage = (event: MessageEvent) => {
        sseQueueRef.current = sseQueueRef.current
          .then(() => handleSSEMessage(event))
          .catch((err) => console.error('[SSE Queue] Error:', err));
      };
      eventSource.onerror = () => {
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
    return () => { disconnect(); };
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
        <p className="text-muted-foreground mt-1">Stream music or talk to Agora channel</p>
      </div>

      {configError && (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
              <div>
                <p className="font-medium text-amber-700 dark:text-amber-400">Configuration Required</p>
                <p className="text-sm text-muted-foreground mt-1">{configData.message}</p>
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
              <Button onClick={connect} disabled={isConnecting || !streamConfig} className="gap-2">
                {isConnecting ? <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" /> : <Wifi className="h-4 w-4" />}
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
            <>
              <Card className="border-2 border-primary/20">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isTalkingEnabled ? <Mic className="h-5 w-5 text-primary" /> : <MicOff className="h-5 w-5 text-muted-foreground" />}
                      <CardTitle className="text-lg">Voice AI Mode</CardTitle>
                    </div>
                    <div className="flex items-center gap-3">
                      {isGPTConnected && (
                        <Badge variant="outline" className="gap-1">
                          {isGPTSpeaking ? (<><Loader2 className="h-3 w-3 animate-spin" />Speaking</>) : (<><Mic className="h-3 w-3" />Listening</>)}
                        </Badge>
                      )}
                      <Switch id="talking-mode" checked={isTalkingEnabled} onCheckedChange={handleTalkingToggle} disabled={!isConnected} />
                    </div>
                  </div>
                  <CardDescription>
                    {isTalkingEnabled 
                      ? `Listening for "${botName}" - responds only when addressed by name` 
                      : "Enable to activate voice AI and disable music playback"}
                  </CardDescription>
                </CardHeader>

                {isTalkingEnabled && isGPTConnected && (
                  <CardContent className="space-y-4">
                    {isGPTSpeaking && (
                      <div className="flex items-center gap-2 p-2 bg-primary/10 rounded">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Speaking...</span>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="gpt-message">Send Text Message to GPT</Label>
                      <div className="flex gap-2">
                        <Textarea
                          id="gpt-message"
                          placeholder={`Type what you want ${botName} to say...`}
                          value={gptMessage}
                          onChange={(e) => setGptMessage(e.target.value)}
                          className="resize-none"
                          rows={3}
                          disabled={isSendingMessage}
                        />
                      </div>
                    </div>
                    <Button
                      onClick={() => { sendMessageToGPT(gptMessage); setGptMessage(""); }}
                      disabled={!gptMessage.trim() || isSendingMessage}
                      className="w-full gap-2"
                    >
                      {isSendingMessage ? (<><Loader2 className="h-4 w-4 animate-spin" />Processing...</>) : (<><Send className="h-4 w-4" />Send & Speak</>)}
                    </Button>
                  </CardContent>
                )}

                {isTalkingEnabled && !isGPTConnected && (
                  <CardContent>
                    <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                      <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Connecting to GPT...</p>
                    </div>
                  </CardContent>
                )}

                {!isTalkingEnabled && (
                  <CardContent>
                    {!openaiKey ? (
                      <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                        <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">API Key Required</p>
                          <p className="text-xs text-muted-foreground">Set OPENAI in .env to enable GPT voice</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Enable the switch above to start using voice AI</p>
                    )}
                  </CardContent>
                )}
              </Card>

              {!isTalkingEnabled && (
                <div className="space-y-4 p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center h-16 w-16 rounded-lg bg-primary/10">
                      <Music2 className="h-8 w-8 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{currentSong?.originalName || "No song selected"}</p>
                      <p className="text-sm text-muted-foreground">
                        {songs.length > 0 ? `Track ${currentIndex + 1} of ${songs.length}` : "No songs in queue"}
                      </p>
                    </div>
                  </div>

                  {currentSong && (
                    <>
                      <div className="space-y-2">
                        <Slider value={[currentTime]} max={duration || 100} step={1} className="cursor-pointer" onValueChange={([val]) => seekTo(val)} />
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
                        <Button variant="ghost" size="icon" onClick={() => setIsMuted(!isMuted)}>
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

              {!isTalkingEnabled && songs.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Queue ({songs.length} songs)</h3>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {songs.map((song, idx) => (
                      <div
                        key={song.id}
                        className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-muted/50 ${idx === currentIndex ? 'bg-primary/10' : ''}`}
                        onClick={() => { setCurrentIndex(idx); playAudio(idx, isConnected); }}
                      >
                        <span className="text-xs text-muted-foreground w-6">{idx + 1}</span>
                        <span className="truncate text-sm">{song.originalName}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
