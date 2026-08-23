import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useSettings } from "#/hooks/query/use-settings";
import {
  type AcpModelContext,
  useAcpModelContext,
} from "#/hooks/use-acp-model-context";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useCanManageOrgProfiles } from "#/hooks/use-can-manage-org-profiles";
import { useActiveAcpProfileDetail } from "#/hooks/query/use-active-acp-profile-detail";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import { useEvoLoomConfig } from "#/evoloom/config";
import {
  getAcpPreferredDefaultModel,
  getAcpProvider,
  labelForAcpModel,
  resolveEffectiveAcpModel,
  type ACPModelOption,
} from "#/constants/acp-providers";

export interface ChatInputModelState {
  isAcpContext: boolean;
  displayModel: string | null;
  currentModelId: string | null;
  availableAcpModels: ACPModelOption[];
  showAcpPicker: boolean;
  switchConversationId: string | null;
  destinationPath: AcpModelContext["destinationPath"];
  destinationLabel: string;
}

export function useChatInputModelState(): ChatInputModelState {
  const { data: conversation } = useActiveConversation();
  const { data: settings } = useSettings();
  const { conversationId } = useOptionalConversationId();
  const { backend } = useActiveBackend();
  const canManageOrgProfiles = useCanManageOrgProfiles();
  const activeAcpProfile = useActiveAcpProfileDetail();
  const publicConfig = useEvoLoomConfig();
  const {
    isActiveAcpConversation,
    isHomeAcp,
    isAcpContext,
    destinationPath,
    destinationLabel,
  } = useAcpModelContext();

  const settingsAcpServerKey =
    typeof settings?.agent_settings?.acp_server === "string"
      ? settings.agent_settings.acp_server
      : null;
  const acpServerKey = isActiveAcpConversation
    ? conversation?.acp_server
    : isHomeAcp
      ? (activeAcpProfile?.acp_server ?? settingsAcpServerKey)
      : null;
  const acpProvider = isAcpContext ? getAcpProvider(acpServerKey) : undefined;

  const settingsAcpModel =
    typeof settings?.agent_settings?.acp_model === "string"
      ? settings.agent_settings.acp_model
      : null;
  const acpConfiguredModel =
    isHomeAcp && activeAcpProfile
      ? activeAcpProfile.acp_model
      : settingsAcpModel;

  let currentModelId: string | null = null;
  if (isActiveAcpConversation) {
    currentModelId =
      conversation?.llm_model ??
      resolveEffectiveAcpModel({
        configured: acpConfiguredModel,
        providerDefault: getAcpPreferredDefaultModel(acpServerKey),
      });
  } else if (isHomeAcp) {
    currentModelId = resolveEffectiveAcpModel({
      configured: acpConfiguredModel,
      providerDefault: getAcpPreferredDefaultModel(acpServerKey),
    });
  } else {
    currentModelId = conversation?.llm_model ?? settings?.llm_model ?? null;
  }

  const relayModels = publicConfig.data?.available_models ?? [];
  const usesRelayCatalog = acpServerKey === "codex" && relayModels.length > 0;
  const availableAcpModels = usesRelayCatalog
    ? relayModels
    : (acpProvider?.available_models ?? []);
  const relayLabel = relayModels.find(
    (item) => item.id === currentModelId,
  )?.label;
  const displayModel =
    currentModelId && isAcpContext
      ? (relayLabel ??
        labelForAcpModel(acpServerKey, currentModelId) ??
        currentModelId)
      : currentModelId;
  const canPersistHomeAcpModel =
    !isHomeAcp || backend.kind !== "cloud" || canManageOrgProfiles;
  const showAcpPicker =
    isAcpContext && availableAcpModels.length > 0 && canPersistHomeAcpModel;
  const switchConversationId = isActiveAcpConversation
    ? (conversationId ?? null)
    : null;

  return {
    isAcpContext,
    displayModel,
    currentModelId,
    availableAcpModels,
    showAcpPicker,
    switchConversationId,
    destinationPath,
    destinationLabel,
  };
}
