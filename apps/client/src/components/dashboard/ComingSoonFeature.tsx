"use client";

import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { Button, Card, CardContent } from "@tailfire/ui-public";

interface ComingSoonFeatureProps {
  title: string;
  icon: LucideIcon;
  description: string;
}

export function ComingSoonFeature({ title, icon: Icon, description }: ComingSoonFeatureProps) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-8">
        <Link href="/">
          <Button variant="ghost" size="icon" className="text-phoenix-text-muted hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold text-white">{title}</h1>
      </div>
      <Card className="bg-phoenix-charcoal/50 border-phoenix-gold/30">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Icon className="h-16 w-16 text-phoenix-gold/40 mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Coming Soon</h2>
          <p className="text-phoenix-text-muted max-w-md">{description}</p>
        </CardContent>
      </Card>
    </div>
  );
}
