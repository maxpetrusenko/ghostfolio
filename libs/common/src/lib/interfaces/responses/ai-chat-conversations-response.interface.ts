import type { AiAgentChatResponse } from './ai-agent-chat-response.interface';

export type AiChatConversationMessageRole = 'assistant' | 'user';

export interface AiChatConversationLastMessage {
  content: string;
  createdAt: Date;
  role: AiChatConversationMessageRole;
}

export interface AiChatConversationSummary {
  createdAt: Date;
  id: string;
  lastMessage?: AiChatConversationLastMessage;
  memorySessionId?: string;
  messagesCount: number;
  title: string;
  updatedAt: Date;
}

export interface AiChatConversationResponse {
  conversation: AiChatConversationSummary;
}

export interface AiChatConversationsResponse {
  conversations: AiChatConversationSummary[];
  count: number;
}

export interface AiChatConversationMessage {
  content: string;
  conversationId: string;
  createdAt: Date;
  id: string;
  response?: AiAgentChatResponse;
  role: AiChatConversationMessageRole;
  sequence: number;
}

export interface AiChatConversationMessagesResponse {
  conversation: AiChatConversationSummary;
  count: number;
  messages: AiChatConversationMessage[];
}
