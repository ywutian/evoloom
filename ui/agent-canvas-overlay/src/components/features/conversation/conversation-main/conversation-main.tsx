import React from "react";
import { ChatInterfaceWrapper } from "./chat-interface-wrapper";
import { ConversationNameWithStatus } from "../conversation-name-with-status";
import { useConversationStore } from "#/stores/conversation-store";
import {
  useBreakpoint,
  SIDEBAR_RAIL_COLLAPSE_MAX_WIDTH,
} from "#/hooks/use-breakpoint";
import { SidebarMobileMenuToggle } from "#/components/features/sidebar/sidebar-mobile-menu-toggle";
import { RunInspector } from "#/evoloom/run-inspector";
import { copy, useEvoLoomLocale } from "#/evoloom/locale";

export function ConversationMain() {
  const isMobile = useBreakpoint();
  const { locale } = useEvoLoomLocale();
  const isSidebarRailHidden = useBreakpoint(SIDEBAR_RAIL_COLLAPSE_MAX_WIDTH);
  const { isRightPanelShown, hasRightPanelToggled, setIsRightPanelShown } =
    useConversationStore();

  React.useEffect(() => {
    if (!hasRightPanelToggled) setIsRightPanelShown(!isMobile);
  }, [hasRightPanelToggled, isMobile, setIsRightPanelShown]);

  const closeInspector = () => {
    setIsRightPanelShown(false);
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLButtonElement>('[data-testid="right-panel-toggle"]')
        ?.focus();
    });
  };

  return (
    <div className="evoloom-conversation">
      <section
        className="evoloom-conversation__chat"
        aria-label={copy[locale].inspector.conversation}
      >
        <div
          data-testid="chat-pane-header"
          className="evoloom-conversation__header"
        >
          {isSidebarRailHidden ? <SidebarMobileMenuToggle /> : null}
          <div className="min-w-0 flex-1">
            <ConversationNameWithStatus />
          </div>
        </div>
        <div className="min-h-0 flex-1 flex flex-col">
          <ChatInterfaceWrapper
            isRightPanelShown={!isMobile && isRightPanelShown}
          />
        </div>
      </section>
      {!isMobile ? (
        <RunInspector open={isRightPanelShown} onClose={closeInspector} />
      ) : (
        <RunInspector
          mobile
          open={isRightPanelShown}
          onClose={closeInspector}
        />
      )}
    </div>
  );
}
