export type WebsiteChatMode = "bot" | "human";
export type WebsiteChatStatus = "bot_controlled" | "waiting" | "human_controlled" | "resolved";

export type WebsiteChatConversationState = {
  conversationId: string;
  contactId: string;
  name: string;
  mode: WebsiteChatMode;
  status: WebsiteChatStatus;
};

export type AgentPresence = {
  online: boolean;
  typing: boolean;
  lastSeenAt: string | null;
  name: string | null;
};

export type WebsiteChatMessage = {
  id: string;
  senderKind: "guest" | "bot" | "admin";
  senderName: string;
  body: string;
  createdAt: string;
};
