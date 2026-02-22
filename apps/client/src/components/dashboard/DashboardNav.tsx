"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, FileText, Home, User } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@tailfire/ui-public";

const navItems = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/trips", label: "My Trips", icon: Briefcase },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/travelers", label: "My Profile", icon: User },
];

type DashboardNavProps = {
  mobile?: boolean;
  onNavigate?: () => void;
};

export function DashboardNav({ mobile, onNavigate }: DashboardNavProps) {
  const pathname = usePathname();

  if (mobile) {
    return (
      <nav className="flex flex-col space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                isActive
                  ? "bg-phoenix-gold/20 text-phoenix-gold"
                  : "text-phoenix-text-light hover:bg-phoenix-gold/10 hover:text-white"
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <NavigationMenu>
      <NavigationMenuList className="flex gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <NavigationMenuItem key={item.href}>
              <NavigationMenuLink asChild>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-phoenix-gold/20 text-phoenix-gold"
                      : "text-phoenix-text-light hover:bg-phoenix-gold/10 hover:text-white"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden xl:inline">{item.label}</span>
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
          );
        })}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
