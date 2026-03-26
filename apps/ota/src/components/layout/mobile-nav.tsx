"use client";

import Link from "next/link";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { NAV_LINKS } from "@/components/layout/nav";
import phoenixLogo from "@/assets/phoenix-logo.svg";

interface MobileNavProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileNav({ open, onOpenChange }: MobileNavProps) {
  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => onOpenChange(nextOpen)}
    >
      <SheetContent side="right" className="flex w-80 flex-col">
        <SheetHeader>
          <SheetTitle>
            <Link
              href="/"
              className="flex items-center gap-3"
              onClick={() => onOpenChange(false)}
            >
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

        <nav className="flex flex-1 flex-col gap-1 px-4">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => onOpenChange(false)}
              className="rounded-lg px-3 py-3 text-base font-medium text-[#1A1A1A] transition-colors hover:bg-muted hover:text-[#C59746]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <SheetFooter>
          <Button
            className="w-full bg-[#C59746] text-white hover:bg-[#B08638]"
            size="lg"
            onClick={() => onOpenChange(false)}
          >
            Talk to AI
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
