import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Shield, Activity, Bot, Trophy, Clock } from "lucide-react";

interface MembersResponse {
  success: boolean;
  data: {
    members: any[];
    total: number;
    levelStats: {
      total: number;
      lowLevel: number;
      mediumLevel: number;
      highLevel: number;
    };
  };
}

interface ProtectionResponse {
  success: boolean;
  data: string[];
}

interface BotStatusResponse {
  success: boolean;
  data: {
    connected: boolean;
    message: string;
  };
}

interface ClubInfoResponse {
  success: boolean;
  data: {
    clubName: string;
    clubCode: string;
    botUid: string;
  };
}

interface MessageCountResponse {
  success: boolean;
  data: {
    count: number;
    date: string;
  };
}

interface TopActiveUser {
  uid: string;
  name: string;
  level: number;
  dailyHours: number;
  weeklyHours: number;
  monthlyHours: number;
}

interface TopActiveResponse {
  success: boolean;
  data: {
    daily: TopActiveUser[];
    weekly: TopActiveUser[];
    monthly: TopActiveUser[];
  };
}

export default function Overview() {
  const { data: membersData } = useQuery<MembersResponse>({
    queryKey: ["/api/jack/members"],
  });

  const { data: spamWordsData } = useQuery<ProtectionResponse>({
    queryKey: ["/api/jack/config/spam-words"],
  });

  const { data: botStatus } = useQuery<BotStatusResponse>({
    queryKey: ["/api/jack/status"],
  });

  const { data: clubInfo } = useQuery<ClubInfoResponse>({
    queryKey: ["/api/jack/club-info"],
  });

  const { data: messageCount } = useQuery<MessageCountResponse>({
    queryKey: ["/api/jack/message-count"],
    refetchInterval: 5000,
  });

  const { data: topActive } = useQuery<TopActiveResponse>({
    queryKey: ["/api/jack/top-active"],
    refetchInterval: 30000,
  });

  const totalMembers = membersData?.data?.total || 0;
  const messagesToday = messageCount?.data?.count || 0;
  const spamWordCount = spamWordsData?.data?.length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="heading-dashboard">Dashboard Overview</h1>
        <p className="text-muted-foreground mt-1">Monitor your bot and club statistics</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Members</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-members">{totalMembers}</div>
            <p className="text-xs text-muted-foreground">Club members</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Messages Today</CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-messages-today">{messagesToday}</div>
            <p className="text-xs text-muted-foreground">Bot activity</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Spam Words</CardTitle>
            <Shield className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-spam-words">{spamWordCount}</div>
            <p className="text-xs text-muted-foreground">Protected terms</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bot Status</CardTitle>
            <Bot className="h-4 w-4 text-cyan-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {botStatus?.data?.connected ? "Online" : "Ready"}
            </div>
            <p className="text-xs text-muted-foreground">System status</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Club Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <p className="text-sm text-muted-foreground">Club Name</p>
              <p className="font-semibold" data-testid="text-club-name">
                {clubInfo?.data?.clubName || 'Loading...'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Club Code</p>
              <p className="font-semibold" data-testid="text-club-code">
                {clubInfo?.data?.clubCode || 'Loading...'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Member Distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Level 1-4</span>
              <span className="font-semibold" data-testid="stat-overview-low">
                {membersData?.data?.levelStats?.lowLevel || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Level 5-9</span>
              <span className="font-semibold" data-testid="stat-overview-medium">
                {membersData?.data?.levelStats?.mediumLevel || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Level 10+</span>
              <span className="font-semibold" data-testid="stat-overview-high">
                {membersData?.data?.levelStats?.highLevel || 0}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          Top Active Members
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-500" />
                Today's Top 3
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topActive?.data?.daily && topActive.data.daily.length > 0 ? (
                <div className="space-y-3">
                  {topActive.data.daily.map((user, index) => (
                    <div key={user.uid} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold text-sm ${index === 0 ? 'text-yellow-500' : index === 1 ? 'text-gray-400' : 'text-amber-600'}`}>
                          #{index + 1}
                        </span>
                        <span className="text-sm truncate max-w-[120px]" title={user.name}>
                          {user.name}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-blue-500">
                        {user.dailyHours.toFixed(1)}h
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No activity today</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-green-500" />
                Weekly Top 3
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topActive?.data?.weekly && topActive.data.weekly.length > 0 ? (
                <div className="space-y-3">
                  {topActive.data.weekly.map((user, index) => (
                    <div key={user.uid} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold text-sm ${index === 0 ? 'text-yellow-500' : index === 1 ? 'text-gray-400' : 'text-amber-600'}`}>
                          #{index + 1}
                        </span>
                        <span className="text-sm truncate max-w-[120px]" title={user.name}>
                          {user.name}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-green-500">
                        {user.weeklyHours.toFixed(1)}h
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No activity this week</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-purple-500" />
                Monthly Top 3
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topActive?.data?.monthly && topActive.data.monthly.length > 0 ? (
                <div className="space-y-3">
                  {topActive.data.monthly.map((user, index) => (
                    <div key={user.uid} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold text-sm ${index === 0 ? 'text-yellow-500' : index === 1 ? 'text-gray-400' : 'text-amber-600'}`}>
                          #{index + 1}
                        </span>
                        <span className="text-sm truncate max-w-[120px]" title={user.name}>
                          {user.name}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-purple-500">
                        {user.monthlyHours.toFixed(1)}h
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No activity this month</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
