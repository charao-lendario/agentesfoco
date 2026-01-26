import React, { useState, useEffect } from 'react';
import { GoogleGenerativeAI } from "@google/generative-ai";
// @ts-ignore
import * as mammoth from "mammoth";
import { Agent, Message, User, ChatSession, Attachment } from './types';
import { AGENTS } from './config/agents';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import Login from './components/Login';

// Mock User Data
const MOCK_USER: User = {
  id: 'u-123',
  email: 'demo@agentesfoco.com',
  name: 'versão de teste'
};

// API Key must be set via environment variables
const API_KEY = (import.meta.env as any).VITE_GEMINI_API_KEY || '';

if (!API_KEY) {
  console.warn('Warning: VITE_GEMINI_API_KEY environment variable is not set');
}

const App: React.FC = () => {
  // --- State ---
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  // Replaced simple selectedAgentId with session management
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  
  // New State structure: Array of sessions instead of keyed object
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  
  const [isTyping, setIsTyping] = useState<boolean>(false);

  // --- Effects ---
  
  // Restore session (simulated)
  useEffect(() => {
    const savedUser = localStorage.getItem('agentes_foco_user');
    if (savedUser) {
      setCurrentUser(JSON.parse(savedUser));
      setIsAuthenticated(true);
      
      // Load sessions from local storage if available
      const savedSessions = localStorage.getItem('agentes_foco_sessions');
      if (savedSessions) {
        setSessions(JSON.parse(savedSessions));
      }
    }
  }, []);

  // Persist sessions whenever they change
  useEffect(() => {
    if (isAuthenticated) {
      localStorage.setItem('agentes_foco_sessions', JSON.stringify(sessions));
    }
  }, [sessions, isAuthenticated]);

  // --- Handlers ---

  const handleLogin = (email: string) => {
    const user: User = { ...MOCK_USER, email };
    setCurrentUser(user);
    setIsAuthenticated(true);
    localStorage.setItem('agentes_foco_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    localStorage.removeItem('agentes_foco_user');
    // We keep the sessions in local storage for demonstration, but clear state
    setSessions([]); 
    setCurrentSessionId(null);
    setSelectedAgentId(null);
  };

  const createNewSession = (agentId: string) => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      agentId: agentId,
      title: 'Nova Conversa',
      messages: [],
      lastModified: Date.now()
    };
    
    setSessions(prev => [...prev, newSession]);
    setCurrentSessionId(newSession.id);
    setSelectedAgentId(agentId);
  };

  const handleSelectAgent = (agentId: string) => {
    // When clicking an agent, we check if there's an EMPTY active session for them?
    // Or we just find the most recent session for this agent.
    // For this UX, let's create a NEW session if the user explicitly clicks the agent in the sidebar "Nova Conversa" section
    // OR we could toggle to the last session. 
    // Given the Sidebar UI has a "New Chat" section header, let's treat clicking an Agent as "Start New Context".
    
    // However, to prevent spamming empty sessions, if the LAST session for this agent is empty, switch to it.
    const lastSessionForAgent = sessions
      .filter(s => s.agentId === agentId)
      .sort((a, b) => b.lastModified - a.lastModified)[0];

    if (lastSessionForAgent && lastSessionForAgent.messages.length === 0) {
      setCurrentSessionId(lastSessionForAgent.id);
      setSelectedAgentId(agentId);
    } else {
      createNewSession(agentId);
    }
  };

  const handleSelectSession = (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      setCurrentSessionId(session.id);
      setSelectedAgentId(session.agentId);
    }
  };

  const handleNewChat = () => {
    if (selectedAgentId) {
      // Force create new session
      createNewSession(selectedAgentId);
    }
  };

  // Helper to convert Base64 Data URI to Uint8Array (Buffer)
  const base64ToUint8Array = (base64Data: string) => {
    const binString = atob(base64Data);
    const len = binString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binString.charCodeAt(i);
    }
    return bytes;
  };

  // Helper to process attachments for API
  const processAttachmentsForApi = async (attachments: Attachment[]) => {
    const inlineParts: any[] = [];
    const textContentParts: string[] = [];

    for (const att of attachments) {
      const isMedia = att.type.startsWith('image/') || att.type === 'application/pdf';

      if (isMedia) {
        const base64Data = att.data.split(',')[1];
        inlineParts.push({
          inlineData: {
            mimeType: att.type,
            data: base64Data
          }
        });
      } 
      else if (att.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        try {
          const base64Data = att.data.split(',')[1];
          const buffer = base64ToUint8Array(base64Data);
          const result = await mammoth.extractRawText({ arrayBuffer: buffer.buffer });
          textContentParts.push(`\n--- CONTEÚDO DO ARQUIVO DOCX: ${att.name} ---\n${result.value}\n--- FIM DO ARQUIVO DOCX ---\n`);
        } catch (e) {
          textContentParts.push(`\n[ERRO: Não foi possível ler o arquivo ${att.name}.]\n`);
        }
      }
      else {
        try {
          const base64Data = att.data.split(',')[1];
          const bytes = base64ToUint8Array(base64Data);
          const text = new TextDecoder().decode(bytes);
          textContentParts.push(`\n--- CONTEÚDO DO ARQUIVO: ${att.name} (${att.type}) ---\n${text}\n--- FIM DO ARQUIVO ---\n`);
        } catch (e) {
          console.error(`Erro ao processar arquivo de texto ${att.name}`, e);
        }
      }
    }

    return { inlineParts, textContent: textContentParts.join('\n') };
  };

  const handleSendMessage = async (text: string, attachments: Attachment[] = []) => {
    if (!currentSessionId || !selectedAgentId) return;

    const activeAgent = AGENTS.find(a => a.id === selectedAgentId);
    if (!activeAgent) return;

    // 1. Prepare User Message
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      attachments: attachments,
      timestamp: Date.now()
    };

    // 2. Update Local State (Optimistic UI)
    setSessions(prev => prev.map(session => {
      if (session.id === currentSessionId) {
        // Generate a title if it's the first message
        const newTitle = session.messages.length === 0 
          ? (text.slice(0, 30) + (text.length > 30 ? '...' : '')) 
          : session.title;

        return {
          ...session,
          title: newTitle,
          messages: [...session.messages, userMsg],
          lastModified: Date.now()
        };
      }
      return session;
    }));

    setIsTyping(true);

    try {
      // 3. Initialize Gemini
      const ai = new GoogleGenerativeAI(API_KEY);

      // 4. Get Current History for API
      const currentSession = sessions.find(s => s.id === currentSessionId);
      const currentHistory = currentSession ? currentSession.messages : []; // Note: this is pre-update in this closure, but we just pushed userMsg to state.
      // Actually, we need the history including the message we just added. 
      // Since setState is async, we'll manually append userMsg to what we know.
      const historyForApi = [...(currentSession?.messages || []), userMsg];

      // Exclude the very last message from "history parts" because it's the current turn
      const previousMessages = historyForApi.slice(0, -1);
      const currentMessage = historyForApi[historyForApi.length - 1];

      // Map Previous Messages
      const apiContents = await Promise.all(previousMessages.map(async (msg) => {
        const { inlineParts, textContent } = await processAttachmentsForApi(msg.attachments || []);
        let finalContent = msg.content;
        if (textContent) finalContent = (finalContent ? finalContent + "\n" : "") + textContent;

        const parts: any[] = [];
        if (finalContent) parts.push({ text: finalContent });
        parts.push(...inlineParts);

        return {
          role: msg.role === 'user' ? 'user' : 'model',
          parts: parts
        };
      }));

      // Prepare Current Turn
      const { inlineParts, textContent } = await processAttachmentsForApi(currentMessage.attachments || []);
      let finalCurrentText = currentMessage.content;
      if (textContent) finalCurrentText = (finalCurrentText ? finalCurrentText + "\n" : "") + textContent;
      
      const currentParts: any[] = [];
      if (finalCurrentText) currentParts.push({ text: finalCurrentText });
      currentParts.push(...inlineParts);

      apiContents.push({ role: 'user', parts: currentParts });

      // 5. Call API
      const model = ai.getGenerativeModel({
        model: 'gemini-3-pro-preview',
        systemInstruction: activeAgent.systemPrompt
      });
      const response = await model.generateContent({
        contents: apiContents,
      });

      const aiText = response.response?.text?.() || "Não foi possível gerar uma resposta.";

      // 6. Update UI with AI Response
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: aiText,
        timestamp: Date.now()
      };

      setSessions(prev => prev.map(session => {
        if (session.id === currentSessionId) {
          return {
            ...session,
            messages: [...session.messages, aiMsg],
            lastModified: Date.now()
          };
        }
        return session;
      }));

    } catch (error: any) {
      console.error("Erro API Gemini:", error);
      
      let errorMessage = "Erro desconhecido.";
      if (error.message?.includes('API key')) errorMessage = "Erro de autenticação (API Key).";
      else if (error.message?.includes('Unsupported MIME type')) errorMessage = "Formato de arquivo não suportado.";
      else errorMessage = error.message || "Erro na comunicação com a IA.";

      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `[ERRO] ${errorMessage}`,
        timestamp: Date.now()
      };

      setSessions(prev => prev.map(session => {
        if (session.id === currentSessionId) {
          return {
            ...session,
            messages: [...session.messages, errorMsg],
            lastModified: Date.now()
          };
        }
        return session;
      }));
    } finally {
      setIsTyping(false);
    }
  };

  // --- Render ---

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  const activeAgent = AGENTS.find(a => a.id === selectedAgentId);
  const activeSession = sessions.find(s => s.id === currentSessionId);
  const activeMessages = activeSession ? activeSession.messages : [];

  return (
    <div className="flex h-screen overflow-hidden bg-[#F9FAFB]">
      <Sidebar 
        agents={AGENTS}
        selectedAgentId={selectedAgentId}
        onSelectAgent={handleSelectAgent}
        currentUser={currentUser}
        onLogout={handleLogout}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={handleSelectSession}
      />

      <main className="flex-1 flex flex-col relative h-full">
        {activeAgent && activeSession ? (
          <ChatArea 
            agent={activeAgent}
            messages={activeMessages}
            onSendMessage={handleSendMessage}
            onNewChat={handleNewChat}
            isTyping={isTyping}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 flex-col gap-4">
            <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center text-[#D4AF37]">
               <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-message-square-dashed"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M12 10h.01"/></svg>
            </div>
            <p>Selecione um agente ou inicie uma nova conversa.</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;