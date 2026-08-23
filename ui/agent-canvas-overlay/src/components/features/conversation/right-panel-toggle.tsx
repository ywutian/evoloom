import { PanelRight } from "lucide-react";
import { useConversationStore } from "#/stores/conversation-store";
import { cn } from "#/utils/utils";
import { mobileTopBarIconButtonClassName } from "#/utils/mobile-top-bar-icon-button-classes";
import { copy, useEvoLoomLocale } from "#/evoloom/locale";

export function RightPanelToggle({ className }: { className?: string }) {
  const { locale } = useEvoLoomLocale();
  const labels = copy[locale].inspector;
  const { isRightPanelShown, setHasRightPanelToggled, setIsRightPanelShown } =
    useConversationStore();
  const toggle = () => {
    setHasRightPanelToggled(true);
    setIsRightPanelShown(!isRightPanelShown);
  };
  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        mobileTopBarIconButtonClassName,
        "size-9 self-center",
        className,
      )}
      aria-label={isRightPanelShown ? labels.hide : labels.show}
      aria-pressed={isRightPanelShown}
      data-testid="right-panel-toggle"
    >
      <PanelRight aria-hidden className="size-5" />
    </button>
  );
}
