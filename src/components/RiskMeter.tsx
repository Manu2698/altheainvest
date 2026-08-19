import { cn } from "@/lib/utils";

export function RiskMeter({ livello }: { livello: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Rischio ${livello} su 10`}>
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 flex-1 rounded-full transition-colors",
            i < livello
              ? livello <= 3
                ? "bg-bull"
                : livello <= 6
                  ? "bg-warn"
                  : "bg-bear"
              : "bg-muted",
          )}
        />
      ))}
    </div>
  );
}
