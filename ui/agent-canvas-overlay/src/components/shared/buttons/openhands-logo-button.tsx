import { EvoLoomWordmark } from "#/evoloom/brand";
import { cn } from "#/utils/utils";

export type OpenHandsLogoButtonProps = {
  className?: string;
  logoClassName?: string;
  logoWidth?: number;
  logoHeight?: number;
};

export function OpenHandsLogoButton({
  className,
}: OpenHandsLogoButtonProps = {}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center",
        className,
        "w-auto justify-start",
      )}
    >
      <EvoLoomWordmark />
    </div>
  );
}
