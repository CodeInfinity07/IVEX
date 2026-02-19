import { TopBar } from "../top-bar";
import { ThemeProvider } from "../theme-provider";
import { SidebarProvider } from "@/components/ui/sidebar";

export default function TopBarExample() {
  return (
    <ThemeProvider>
      <SidebarProvider>
        <TopBar />
      </SidebarProvider>
    </ThemeProvider>
  );
}
