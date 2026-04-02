"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TripComponent } from "./trip-basket-store";

interface SubmitSummaryProps {
  components: TripComponent[];
}

const TYPE_EMOJI: Record<string, string> = {
  flight: "\u2708\uFE0F",
  hotel: "\uD83C\uDFE8",
  cruise: "\uD83D\uDEA2",
  tour: "\uD83D\uDDFA\uFE0F",
  package: "\uD83C\uDF81",
  custom: "\u2728",
};

function extractPrice(data: Record<string, unknown>): number {
  const price = data?.price as Record<string, unknown> | undefined;
  const raw = price?.total;
  return typeof raw === "number" ? raw : typeof raw === "string" ? parseFloat(raw) || 0 : 0;
}

function formatCurrency(dollars: number): string {
  return Math.round(dollars).toLocaleString("en-US");
}

export function SubmitSummary({ components }: SubmitSummaryProps) {
  const total = components.reduce((sum, c) => sum + extractPrice(c.data), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trip Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {components.map((c) => {
          const emoji = TYPE_EMOJI[c.type] ?? TYPE_EMOJI.custom;
          const title =
            c.display?.title ??
            c.type.charAt(0).toUpperCase() + c.type.slice(1);
          const price = extractPrice(c.data);

          return (
            <div
              key={c.id}
              className="flex items-center justify-between text-sm"
            >
              <span className="flex items-center gap-2">
                <span>{emoji}</span>
                <span className="text-foreground">{title}</span>
              </span>
              {price > 0 && (
                <span className="font-medium text-foreground">
                  ${formatCurrency(price)}
                </span>
              )}
            </div>
          );
        })}

        {/* Total */}
        <div className="border-t pt-3">
          <div className="flex items-center justify-between font-semibold">
            <span>Estimated Total</span>
            <span>${formatCurrency(total)}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Prices are approximate and will be confirmed by your advisor
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
