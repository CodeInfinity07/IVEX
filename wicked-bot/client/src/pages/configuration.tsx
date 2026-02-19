import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Save, Plus, Edit, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

const botConfigSchema = z.object({
  botName: z.string().min(1, "Bot name is required").max(50, "Bot name too long"),
  botTone: z.string().min(1, "Bot tone is required"),
  welcomeMessage: z.string().min(1, "Welcome message is required").max(200, "Welcome message too long"),
});

type BotConfig = z.infer<typeof botConfigSchema>;

interface BotConfigResponse {
  success: boolean;
  data: BotConfig & {
    createdAt?: string;
    updatedAt?: string;
  };
}

interface ToneTemplatesResponse {
  success: boolean;
  data: {
    tones: string[];
    templates: Record<string, string>;
  };
}

interface ToneTemplate {
  name: string;
  template: string;
}

export default function Configuration() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [currentTone, setCurrentTone] = useState<ToneTemplate>({ name: "", template: "" });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [toneToDelete, setToneToDelete] = useState<string | null>(null);

  // Fetch bot config
  const { data, isLoading, isError } = useQuery<BotConfigResponse>({
    queryKey: ["/api/jack/bot-config"],
  });

  // Fetch available tones
  const { data: tonesData, isLoading: tonesLoading } = useQuery<ToneTemplatesResponse>({
    queryKey: ["/api/jack/tone-templates"],
  });

  const form = useForm<BotConfig>({
    resolver: zodResolver(botConfigSchema),
    defaultValues: {
      botName: data?.data.botName || "",
      botTone: data?.data.botTone || "upbeat",
      welcomeMessage: data?.data.welcomeMessage || "",
    },
    values: data?.data ? {
      botName: data.data.botName,
      botTone: data.data.botTone,
      welcomeMessage: data.data.welcomeMessage,
    } : undefined,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: BotConfig) => {
      return await apiRequest("POST", "/api/jack/bot-config", values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jack/bot-config"] });
      toast({
        title: "Success",
        description: "Bot configuration saved successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save configuration",
        variant: "destructive",
      });
    },
  });

  const saveToneMutation = useMutation({
    mutationFn: async (tone: { toneName: string; template: string; isEdit: boolean }) => {
      return await apiRequest("POST", "/api/jack/tone-templates", tone);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jack/tone-templates"] });
      setIsDialogOpen(false);
      toast({
        title: "Success",
        description: `Tone ${isEdit ? "updated" : "added"} successfully`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save tone",
        variant: "destructive",
      });
    },
  });


  const deleteToneMutation = useMutation({
    mutationFn: async (toneName: string) => {
      return await apiRequest("DELETE", `/api/jack/tone-templates/${toneName}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jack/tone-templates"] });
      setDeleteDialogOpen(false);
      toast({
        title: "Success",
        description: "Tone deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete tone",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: BotConfig) => {
    saveMutation.mutate(values);
  };

  const handleAddNew = () => {
    setIsEdit(false);
    setCurrentTone({ name: "", template: "" });
    setIsDialogOpen(true);
  };

  const handleEdit = (toneName: string) => {
    const template = tonesData?.data.templates[toneName] || "";
    setIsEdit(true);
    setCurrentTone({ name: toneName, template });
    setIsDialogOpen(true);
  };

  const handleDelete = (toneName: string) => {
    setToneToDelete(toneName);
    setDeleteDialogOpen(true);
  };

  const handleSaveTone = () => {
    if (!currentTone.name.trim() || !currentTone.template.trim()) {
      toast({
        title: "Validation Error",
        description: "Tone name and template are required",
        variant: "destructive",
      });
      return;
    }

    // This calls the mutation
    saveToneMutation.mutate({
      toneName: currentTone.name.toLowerCase().replace(/\s+/g, '_'),
      template: currentTone.template,
      isEdit,
    });

  };

  const confirmDelete = () => {
    if (toneToDelete) {
      deleteToneMutation.mutate(toneToDelete);
    }
  };

  if (isLoading || tonesLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-configuration">Configuration</h1>
          <p className="text-muted-foreground mt-1">Configure bot settings and behavior</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Loading configuration...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-configuration">Configuration</h1>
          <p className="text-muted-foreground mt-1">Configure bot settings and behavior</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-destructive">Failed to load configuration. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const availableTones = tonesData?.data.tones || [];
  const templates = tonesData?.data.templates || {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="heading-configuration">Configuration</h1>
        <p className="text-muted-foreground mt-1">Configure bot settings and behavior</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bot Settings</CardTitle>
          <CardDescription>Configure bot name and personality</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="botName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bot Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="RexBot"
                        {...field}
                        data-testid="input-bot-name"
                      />
                    </FormControl>
                    <FormDescription>
                      The name of your bot
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="botTone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bot Tone</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-bot-tone">
                          <SelectValue placeholder="Select a tone" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableTones.map((tone) => (
                          <SelectItem key={tone} value={tone}>
                            {tone.charAt(0).toUpperCase() + tone.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      The personality style of your bot
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="welcomeMessage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Welcome Message</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="✨️˚.⭒Wᴇʟᴄᴏᴍᴇ {name}˚✨️"
                        {...field}
                        data-testid="input-welcome-message"
                      />
                    </FormControl>
                    <FormDescription>
                      Use {"{name}"} to insert the user's name
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                disabled={saveMutation.isPending}
                data-testid="button-save-config"
              >
                <Save className="mr-2 h-4 w-4" />
                {saveMutation.isPending ? "Saving..." : "Save Configuration"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Tone Templates</CardTitle>
            </div>
            <Button onClick={handleAddNew} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Tone
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {availableTones.map((toneName) => (
              <Card key={toneName} className="border-2">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg capitalize">{toneName}</CardTitle>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEdit(toneName)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleDelete(toneName)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {templates[toneName]?.substring(0, 100)}...
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit" : "Add New"} Tone</DialogTitle>
            <DialogDescription>
              {isEdit ? "Update the tone template" : "Create a new bot personality tone"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Tone Name</label>
              <Input
                placeholder="e.g., friendly, professional, funny"
                value={currentTone.name}
                onChange={(e) => setCurrentTone({ ...currentTone, name: e.target.value })}
                disabled={isEdit}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use lowercase letters, numbers, and underscores only
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Template</label>
              <Textarea
                placeholder="You are {botName}(FEMALE), a friendly bot..."
                value={currentTone.template}
                onChange={(e) => setCurrentTone({ ...currentTone, template: e.target.value })}
                rows={10}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use {"{botName}"} as a placeholder for the bot's name
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTone} disabled={saveToneMutation.isPending}>
              {saveToneMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the "{toneToDelete}" tone. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}