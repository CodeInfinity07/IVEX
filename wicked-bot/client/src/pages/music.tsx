import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Music2, Upload, Trash2, FileAudio, AlertCircle, Lock } from "lucide-react";
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

interface Song {
  id: string;
  filename: string;
  originalName: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
}

export default function MusicPage() {
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: featureStatus } = useQuery({
    queryKey: ['vps-music-feature-status'],
    queryFn: async () => {
      const token = localStorage.getItem('bot_auth_token');
      const res = await fetch(`${import.meta.env.VITE_BOT_API_URL || ''}/api/jack/music-feature-status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.json();
    }
  });

  const { data: songsData, isLoading } = useQuery({
    queryKey: ['/api/jack/songs'],
    queryFn: async () => {
      const token = localStorage.getItem('bot_auth_token');
      const res = await fetch('/api/jack/songs', {
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.json();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = localStorage.getItem('bot_auth_token');
      const res = await fetch(`/api/jack/songs/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Song deleted", description: "Song removed successfully" });
        queryClient.invalidateQueries({ queryKey: ['/api/jack/songs'] });
      } else {
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
      setDeleteId(null);
    }
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.mp3')) {
      toast({ title: "Invalid file", description: "Only MP3 files are allowed", variant: "destructive" });
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 15MB", variant: "destructive" });
      return;
    }

    const formData = new FormData();
    formData.append('song', file);

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const token = localStorage.getItem('bot_auth_token');
      const xhr = new XMLHttpRequest();
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(progress);
        }
      };

      xhr.onload = () => {
        setIsUploading(false);
        setUploadProgress(0);
        if (fileInputRef.current) fileInputRef.current.value = '';
        
        const response = JSON.parse(xhr.responseText);
        if (response.success) {
          toast({ title: "Upload complete", description: "Song uploaded successfully" });
          queryClient.invalidateQueries({ queryKey: ['/api/jack/songs'] });
        } else {
          toast({ title: "Upload failed", description: response.message, variant: "destructive" });
        }
      };

      xhr.onerror = () => {
        setIsUploading(false);
        setUploadProgress(0);
        toast({ title: "Upload failed", description: "Network error occurred", variant: "destructive" });
      };

      xhr.open('POST', '/api/jack/songs/upload');
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.send(formData);
    } catch (error) {
      setIsUploading(false);
      setUploadProgress(0);
      toast({ title: "Upload failed", description: "An error occurred", variant: "destructive" });
    }
  };

  const songs: Song[] = songsData?.data || [];
  const canUpload = songs.length < 15;
  const uploadEnabled = featureStatus?.uploadEnabled === true;

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!uploadEnabled) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Music Library</h1>
          <p className="text-muted-foreground mt-1">
            Upload and manage songs for streaming
          </p>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Lock className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">This feature is not available for you</h2>
            <p className="text-muted-foreground text-center max-w-md">
              Music upload functionality is currently disabled. Please contact the administrator if you need access to this feature.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Music Library</h1>
        <p className="text-muted-foreground mt-1">
          Upload and manage songs for streaming ({songs.length}/15)
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            <CardTitle>Upload Song</CardTitle>
          </div>
          <CardDescription>
            Upload MP3 files (max 15MB each). Maximum 15 songs allowed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".mp3,audio/mpeg"
                onChange={handleUpload}
                disabled={isUploading || !canUpload}
                className="max-w-md"
              />
              {!canUpload && (
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <AlertCircle className="h-4 w-4" />
                  <span>Maximum songs reached</span>
                </div>
              )}
            </div>
            {isUploading && (
              <div className="space-y-2">
                <Progress value={uploadProgress} className="h-2" />
                <p className="text-sm text-muted-foreground">Uploading... {uploadProgress}%</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Music2 className="h-5 w-5 text-primary" />
            <CardTitle>Song Library</CardTitle>
          </div>
          <CardDescription>
            {songs.length} song{songs.length !== 1 ? 's' : ''} in your library
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : songs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileAudio className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No songs uploaded yet</p>
              <p className="text-sm">Upload MP3 files to get started</p>
            </div>
          ) : (
            <div className="space-y-2">
              {songs.map((song, index) => (
                <div
                  key={song.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-8 w-8 rounded bg-primary/10 text-primary text-sm font-medium">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">{song.originalName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatSize(song.size)} • {formatDate(song.uploadedAt)}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteId(song.id)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Song</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this song? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
