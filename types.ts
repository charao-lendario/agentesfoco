export interface Agent {
  id: string;
  name: string;
  avatar: string; // Icon name from Lucide
  role: string;
  systemPrompt: string;
}

export interface Attachment {
  name: string;
  type: string;
  data: string; // Base64 encoded string
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: Attachment[];
  timestamp: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
}

// New interface for handling multiple sessions
export interface ChatSession {
  id: string;
  agentId: string;
  title: string; // "Conversa em 10/10/2023" or First message snippet
  messages: Message[];
  lastModified: number;
}

// Deprecated in favor of ChatSession array, but kept for compatibility if needed temporarily
export interface ChatHistory {
  [agentId: string]: Message[];
}