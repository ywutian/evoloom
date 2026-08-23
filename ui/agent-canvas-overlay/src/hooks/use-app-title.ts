import { useParams } from "react-router";
import { useUserConversation } from "#/hooks/query/use-user-conversation";
import { useConversationStateStore } from "#/stores/conversation-state-store";
import { getAgentStateEmoji } from "#/utils/agent-state-emoji";

const APP_TITLE = "EvoLoom";

export const useAppTitle = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { data: conversation } = useUserConversation(conversationId ?? null);
  const liveExecutionStatus = useConversationStateStore(
    (state) => state.execution_status,
  );
  const baseTitle =
    conversationId && conversation?.title
      ? `${conversation.title} | ${APP_TITLE}`
      : `${APP_TITLE} · Public Agent Workbench`;
  if (!conversationId) return baseTitle;
  const emoji = getAgentStateEmoji(
    liveExecutionStatus ?? conversation?.execution_status ?? null,
  );
  return emoji ? `${emoji} ${baseTitle}` : baseTitle;
};
