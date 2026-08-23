import { NavigationLink } from "#/components/shared/navigation-link";
import { cn } from "#/utils/utils";

const BRAND_NAME = "EvoLoom";

export function LoomMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("evoloom-mark", className)}
      viewBox="0 0 40 40"
      fill="none"
    >
      <path d="M9 7v26M20 7v26M31 7v26" />
      <path d="M5 13c8 0 9 14 17 14s8-14 13-14" />
      <path d="M5 27c8 0 9-14 17-14s8 14 13 14" />
    </svg>
  );
}

export function EvoLoomWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <NavigationLink
      to="/conversations"
      aria-label={BRAND_NAME}
      className="evoloom-wordmark"
    >
      <LoomMark />
      {!compact ? <span>{BRAND_NAME}</span> : null}
    </NavigationLink>
  );
}
