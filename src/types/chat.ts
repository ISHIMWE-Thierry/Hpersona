export interface MessageContent {
  type: 'text' | 'image';
  text?: string;
  imageUrl?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: string[]; // Array of image URLs
  timestamp: Date;
  reasoning?: string; // For O1/O3 reasoning models
}

export interface Conversation {
  id: string;
  title: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  messages: Message[];
}

export interface ChatState {
  conversations: Conversation[];
  currentConversationId: string | null;
  isLoading: boolean;
  isStreaming: boolean;
}
