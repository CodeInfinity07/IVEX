import { Home, Gamepad2, Settings, Sliders, Shield, Command, UserCheck, Users, UserSearch, Star, Activity, UserCog, Music2, AlertTriangle, MessageSquare, UserPlus, Ban, Mail, ToggleRight, ShieldCheck, Building2, Heart } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";

const menuItems = [
  { title: "Overview", url: "/", icon: Home },
  { title: "Bot Controls", url: "/controls", icon: Gamepad2 },
  { title: "Configuration", url: "/configuration", icon: Settings },
  { title: "Settings", url: "/settings", icon: Sliders },
  { title: "Members", url: "/members", icon: Users },
  { title: "Protection", url: "/protection", icon: Shield },
  { title: "Exemptions", url: "/exemptions", icon: UserCheck },
  { title: "Loyal Members", url: "/loyal-members", icon: Star },
  { title: "Players", url: "/players", icon: UserSearch },
  { title: "Commands", url: "/commands", icon: Command },
  { title: "Music", url: "/music", icon: Music2 },
  { title: "Song Dedicate", url: "/dedicate", icon: Heart },
  { title: "Feature Status", url: "/feature-status", icon: ToggleRight },
  { title: "Clubs", url: "/clubs", icon: Building2 },
];

const ownerOnlyItems = [
  { title: "Moderators", url: "/moderators", icon: UserCog },
  { title: "Admins", url: "/admins", icon: UserPlus },
  { title: "Chat History", url: "/chat", icon: MessageSquare },
  { title: "Kick/Ban Logs", url: "/kick-ban-logs", icon: Ban },
  { title: "Blacklist/Hitlist", url: "/blacklist", icon: Ban },
  { title: "Secret Messages", url: "/secret-messages", icon: Mail },
  { title: "Activity Logs", url: "/logs", icon: Activity },
  { title: "Spam Kicks", url: "/spam-kicks", icon: AlertTriangle },
  { title: "Page Protection", url: "/page-protection", icon: ShieldCheck },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { setOpenMobile, isMobile } = useSidebar();
  const { isOwner } = useAuth();

  const handleNavClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Gamepad2 className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Bot</h2>
            <p className="text-xs text-muted-foreground">Manager</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                    <Link href={item.url} onClick={handleNavClick}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isOwner && (
          <SidebarGroup>
            <SidebarGroupLabel>Owner Only</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {ownerOnlyItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={location === item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                      <Link href={item.url} onClick={handleNavClick}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
