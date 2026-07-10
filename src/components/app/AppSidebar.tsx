import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Radar, TrendingUp, Hash, Layers, Radio, LineChart, Bot, Library,
  Activity, BookOpen, Newspaper, Settings, Shield, LogOut, Cpu, Brain,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

type NavItem = { title: string; url: string; icon: React.ComponentType<{ className?: string; size?: number }>; };

const groups: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/app/dashboard", icon: LayoutDashboard },
      { title: "Precision Edge V2", url: "/precision-edge", icon: Cpu },
      { title: "Precision Parity AI", url: "/precision-parity", icon: Brain },
    ],
  },
  {
    label: "Analysis",
    items: [
      { title: "AI Scanner", url: "/app/scanner", icon: Radar },
      { title: "Rise / Fall", url: "/app/scanner/rise-fall", icon: TrendingUp },
      { title: "Digits", url: "/app/scanner/digits", icon: Hash },
      { title: "Volatility", url: "/app/scanner/volatility", icon: Layers },
      { title: "Signals", url: "/app/signals", icon: Radio },
    ],
  },
  {
    label: "Trading",
    items: [
      { title: "Manual Trading", url: "/app/trading", icon: LineChart },
      { title: "Trade History", url: "/app/history", icon: Activity },
    ],
  },
  {
    label: "Automation",
    items: [
      { title: "Auto Trading", url: "/app/auto-trading", icon: Cpu },
      { title: "Bot Builder", url: "/app/bot-builder", icon: Bot },
      { title: "DBot Library", url: "/app/bot-library", icon: Library },
    ],
  },
  {
    label: "Insights",
    items: [
      { title: "Analytics", url: "/app/analytics", icon: Activity },
      { title: "Journal", url: "/app/journal", icon: BookOpen },
      { title: "News", url: "/app/news", icon: Newspaper },
    ],
  },
  {
    label: "Account",
    items: [
      { title: "Settings", url: "/app/settings", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (url: string) => pathname === url || pathname.startsWith(url + "/");

  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return false;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
      return !!data;
    },
    staleTime: 60_000,
  });

  const allGroups = isAdmin
    ? [...groups, { label: "Admin", items: [{ title: "Admin", url: "/app/admin", icon: Shield }] }]
    : groups;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-border/40">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="w-8 h-8 rounded-md bg-gradient-to-br from-[var(--neon)] to-[var(--accent)] flex items-center justify-center shrink-0">
            <Activity size={16} className="text-[var(--primary-foreground)]" />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold tracking-wide neon-text">PRECISION <span className="text-[var(--accent)]">EDGE</span></span>
              <span className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground">AI Trading Platform</span>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {allGroups.map((g) => (
          <SidebarGroup key={g.label}>
            <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <Link to={item.url} className="flex items-center gap-2">
                        <item.icon size={16} />
                        {!collapsed && <span>{item.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-border/40">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={async () => { await supabase.auth.signOut(); window.location.href = "/"; }}>
              <LogOut size={16} />
              {!collapsed && <span>Sign out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
