import { StatCard } from "../stat-card";
import { Users } from "lucide-react";

export default function StatCardExample() {
  return (
    <div className="p-4">
      <StatCard title="Total Members" value="156" icon={Users} iconColor="bg-blue-500" />
    </div>
  );
}
