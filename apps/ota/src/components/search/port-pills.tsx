import { cn } from "@/lib/utils";

interface PortPillsProps {
  ports: string[];
  /** Maximum pills to display before showing +N (default: 4) */
  maxDisplay?: number;
  className?: string;
}

export function PortPills({ ports, maxDisplay = 4, className }: PortPillsProps) {
  if (ports.length === 0) return null;

  const visible = ports.slice(0, maxDisplay);
  const overflow = ports.length - maxDisplay;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {visible.map((port) => (
        <span
          key={port}
          className="inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
        >
          {port}
        </span>
      ))}
      {overflow > 0 && (
        <span className="inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          +{overflow}
        </span>
      )}
    </div>
  );
}
