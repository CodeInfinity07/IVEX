import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Save, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

const settingsSchema = z.object({
  allowAvatars: z.boolean(),
  allowGuestIds: z.boolean(),
  enableLevelBan: z.boolean(),
  banLevel: z.coerce.number().min(1).max(100),
  micCount: z.coerce.number().min(1).max(20),
  punishments: z.object({
    bannedPatterns: z.enum(['ban', 'kick']),
    lowLevel: z.enum(['ban', 'kick']),
    noGuestId: z.enum(['ban', 'kick']),
    noAvatar: z.enum(['ban', 'kick']),
    spamWords: z.enum(['ban', 'kick']),
  }),
});

type Settings = z.infer<typeof settingsSchema>;

interface SettingsResponse {
  success: boolean;
  data: Settings & {
    createdAt?: string;
    updatedAt?: string;
  };
}

export default function Settings() {
  const { toast } = useToast();

  const { data, isLoading, isError } = useQuery<SettingsResponse>({
    queryKey: ["/api/jack/settings"],
  });

  const form = useForm<Settings>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      allowAvatars: data?.data.allowAvatars ?? true,
      allowGuestIds: data?.data.allowGuestIds ?? false,
      enableLevelBan: data?.data.enableLevelBan ?? true,
      banLevel: data?.data.banLevel ?? 10,
      micCount: data?.data.micCount ?? 10,
      punishments: {
        bannedPatterns: data?.data.punishments?.bannedPatterns ?? 'ban',
        lowLevel: data?.data.punishments?.lowLevel ?? 'ban',
        noGuestId: data?.data.punishments?.noGuestId ?? 'ban',
        noAvatar: data?.data.punishments?.noAvatar ?? 'kick',
        spamWords: data?.data.punishments?.spamWords ?? 'kick',
      },
    },
    values: data?.data ? {
      allowAvatars: data.data.allowAvatars,
      allowGuestIds: data.data.allowGuestIds,
      enableLevelBan: data.data.enableLevelBan ?? true,
      banLevel: data.data.banLevel,
      micCount: data.data.micCount ?? 10,
      punishments: {
        bannedPatterns: data.data.punishments?.bannedPatterns ?? 'ban',
        lowLevel: data.data.punishments?.lowLevel ?? 'ban',
        noGuestId: data.data.punishments?.noGuestId ?? 'ban',
        noAvatar: data.data.punishments?.noAvatar ?? 'kick',
        spamWords: data.data.punishments?.spamWords ?? 'kick',
      },
    } : undefined,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: Settings) => {
      return await apiRequest("POST", "/api/jack/settings", values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jack/settings"] });
      toast({
        title: "Success",
        description: "Settings saved successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: Settings) => {
    saveMutation.mutate(values);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-settings">Settings</h1>
          <p className="text-muted-foreground mt-1">Configure club and moderation settings</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Loading settings...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-settings">Settings</h1>
          <p className="text-muted-foreground mt-1">Configure club and moderation settings</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-destructive">Failed to load settings. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="heading-settings">Settings</h1>
        <p className="text-muted-foreground mt-1">Configure club and moderation settings</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Club Settings</CardTitle>
              <CardDescription>Manage club permissions and restrictions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="allowAvatars"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="checkbox-allow-avatars"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Allow Avatars</FormLabel>
                      <FormDescription>
                        Enable or disable avatar display for members
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="allowGuestIds"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="checkbox-allow-guest-ids"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Allow Guest IDs</FormLabel>
                      <FormDescription>
                        Permit guest accounts to join the club
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="enableLevelBan"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="checkbox-enable-level-ban"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Enable Level-Based Banning</FormLabel>
                      <FormDescription>
                        Automatically punish users below the level threshold
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="banLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Auto-Ban Level Threshold</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                        data-testid="input-ban-level"
                      />
                    </FormControl>
                    <FormDescription>
                      Members below this level will be automatically punished (when level banning is enabled)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="micCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mic Count</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                        data-testid="input-mic-count"
                      />
                    </FormControl>
                    <FormDescription>
                      Number of microphone slots available in the club (1-20)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Punishment Settings
              </CardTitle>
              <CardDescription>
                Choose punishment type for each violation (Ban = Permanent, Kick = Temporary)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="punishments.bannedPatterns"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Banned Name Patterns</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-punishment-banned-patterns">
                          <SelectValue placeholder="Select punishment type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ban">🔨 Ban (Permanent)</SelectItem>
                        <SelectItem value="kick">👢 Kick (Temporary)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Users with banned patterns in their name
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="punishments.lowLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Low Level Users</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-punishment-low-level">
                          <SelectValue placeholder="Select punishment type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ban">🔨 Ban (Permanent)</SelectItem>
                        <SelectItem value="kick">👢 Kick (Temporary)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Users below the auto-ban level threshold
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="punishments.noGuestId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Guest IDs</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-punishment-no-guest-id">
                          <SelectValue placeholder="Select punishment type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ban">🔨 Ban (Permanent)</SelectItem>
                        <SelectItem value="kick">👢 Kick (Temporary)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      When "Allow Guest IDs" is disabled
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="punishments.noAvatar"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Avatars</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-punishment-no-avatar">
                          <SelectValue placeholder="Select punishment type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ban">🔨 Ban (Permanent)</SelectItem>
                        <SelectItem value="kick">👢 Kick (Temporary)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      When "Allow Avatars" is disabled
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="punishments.spamWords"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Spam Words</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-punishment-spam-words">
                          <SelectValue placeholder="Select punishment type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ban">🔨 Ban (Permanent)</SelectItem>
                        <SelectItem value="kick">👢 Kick (Temporary)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Users who send messages containing spam words
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Button
            type="submit"
            disabled={saveMutation.isPending}
            data-testid="button-save-settings"
            className="w-full sm:w-auto"
          >
            <Save className="mr-2 h-4 w-4" />
            {saveMutation.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </form>
      </Form>
    </div>
  );
}