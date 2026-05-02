"use client";

import Link from "next/link";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { openChat } from "@/components/chat/chat-widget";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { NAV_ITEMS, type NavItem } from "@/components/layout/nav";
import phoenixLogo from "@/assets/phoenix-logo.svg";

interface MobileNavProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAuthenticated?: boolean;
}

function MobileNavItem({ item, onClose }: { item: NavItem; onClose: () => void }) {
  if (!item.children) {
    return (
      <Link
        href={item.href}
        onClick={onClose}
        className="rounded-lg px-3 py-3 text-base font-medium text-[#1A1A1A] transition-colors hover:bg-muted hover:text-[#C59746]"
      >
        {item.label}
      </Link>
    );
  }

  return (
    <div>
      <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-[#C59746]">
        {item.label}
      </p>
      {item.children.map((child) => (
        <Link
          key={child.href}
          href={child.href}
          onClick={onClose}
          className="block rounded-lg px-3 py-2.5 pl-6 transition-colors hover:bg-muted hover:text-[#C59746]"
        >
          <span className="text-base font-medium text-[#1A1A1A]">{child.label}</span>
          {child.description && (
            <span className="block text-xs text-[#888]">{child.description}</span>
          )}
        </Link>
      ))}
    </div>
  );
}

export function MobileNav({ open, onOpenChange, isAuthenticated = false }: MobileNavProps) {
  const close = () => onOpenChange(false);
  const portalUrl = process.env.NEXT_PUBLIC_CLIENT_PORTAL_URL || 'https://my.phoenixvoyages.ca';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-80 flex-col">
        <SheetHeader>
          <SheetTitle>
            <Link href="/" className="flex items-center gap-3" onClick={close}>
              <Image
                src={phoenixLogo}
                alt="Phoenix Voyages"
                width={28}
                height={28}
                className="h-7 w-7"
              />
              <span className="font-display text-base font-bold tracking-[0.15em] text-[#1A1A1A]">
                PHOENIX VOYAGES
              </span>
            </Link>
          </SheetTitle>
        </SheetHeader>

        <Separator />

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-4">
          {NAV_ITEMS.map((item) => (
            <MobileNavItem key={item.href} item={item} onClose={close} />
          ))}
        </nav>

        <SheetFooter className="flex flex-col gap-2">
          <a
            href={isAuthenticated ? portalUrl : `${portalUrl}/login`}
            onClick={close}
            className="flex w-full items-center justify-center rounded-lg border border-[#1A1A1A] px-6 py-2.5 text-sm font-medium text-[#1A1A1A] transition-colors hover:border-[#C59746] hover:text-[#C59746]"
          >
            {isAuthenticated ? 'My Account' : 'Sign In'}
          </a>
          <Button
            className="w-full bg-[#C59746] text-white hover:bg-[#B08638]"
            size="lg"
            onClick={() => {
              close();
              openChat("Hi! I'm looking for help planning a trip.");
            }}
          >
            Talk to AI
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
