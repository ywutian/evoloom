import React from "react";
import { ChevronLeft, ChevronRight, FileCheck2, Plus } from "lucide-react";
import { EvoLoomWordmark } from "#/evoloom/brand";
import { copy, useEvoLoomLocale } from "#/evoloom/locale";
import { SidebarNavLink } from "./sidebar-nav-link";
import { SidebarConversationList } from "./sidebar-conversation-list";
import { cn } from "#/utils/utils";

export interface SidebarRailBodyProps {
  collapsed: boolean;
  showCollapseToggle: boolean;
  showMobileCloseButton?: boolean;
  onCloseMobile?: () => void;
  collapseToggleLabel: string;
  onCollapse: () => void;
  onExpand: () => void;
  showCollapsedExpandButton: boolean;
  isExtensionsActive: boolean;
  currentPath: string;
  activeBackendHealth: { isConnected: boolean | null } | undefined;
  collapsedBackendPopoverOpen: boolean;
  setCollapsedBackendPopoverOpen: (open: boolean) => void;
  collapsedBackendPopoverRef: React.RefObject<HTMLDivElement | null>;
  collapsedBackendCloseTimer: React.MutableRefObject<ReturnType<
    typeof setTimeout
  > | null>;
  onOpenAddBackend: () => void;
  onOpenManageBackends: () => void;
}

export function SidebarRailBody(props: SidebarRailBodyProps) {
  const { locale } = useEvoLoomLocale();
  const text = copy[locale].nav;
  const {
    collapsed,
    showCollapseToggle,
    showMobileCloseButton,
    onCloseMobile,
    onCollapse,
    onExpand,
    collapseToggleLabel,
  } = props;

  return (
    <div className="evoloom-sidebar flex min-h-0 flex-1 flex-col">
      <div
        className={cn("evoloom-sidebar__header", collapsed && "is-collapsed")}
      >
        <EvoLoomWordmark compact={collapsed} />
        {showCollapseToggle ? (
          <button
            type="button"
            onClick={collapsed ? onExpand : onCollapse}
            aria-label={collapseToggleLabel}
          >
            {collapsed ? (
              <ChevronRight aria-hidden size={16} />
            ) : (
              <ChevronLeft aria-hidden size={16} />
            )}
          </button>
        ) : null}
        {showMobileCloseButton ? (
          <button type="button" onClick={onCloseMobile} aria-label={text.close}>
            <ChevronLeft aria-hidden size={18} />
          </button>
        ) : null}
      </div>
      <nav aria-label={text.workspace} className="evoloom-sidebar__nav">
        <SidebarNavLink
          to="/conversations"
          end
          label={text.newTask}
          collapsed={collapsed}
          icon={<Plus size={18} />}
        />
        <SidebarNavLink
          to="/proof"
          label={text.proof}
          collapsed={collapsed}
          icon={<FileCheck2 size={18} />}
        />
      </nav>
      {!collapsed ? (
        <p className="evoloom-sidebar__section-label">{text.recent}</p>
      ) : null}
      <SidebarConversationList collapsed={collapsed} />
      {!collapsed ? (
        <p className="evoloom-sidebar__policy">{text.sandboxPolicy}</p>
      ) : null}
    </div>
  );
}
