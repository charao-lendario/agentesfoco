import React, { useState, useEffect } from 'react';
import { Agent, Message, User, ChatSession, Attachment } from './types';
import { AGENTS } from './config/agents';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import Login from './components/Login';
import mammoth from 'mammoth';

// Mock User Data
const MOCK_USER: User = {
  id: 'u-123',
  email: 'demo@agentesfoco.com',
  name: 'versão de teste'
};

const App: React.FC = () => {
  // --- State ---
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  
  const [isTyping, setIsTyping] = useState<boolean>(false);

  // --- Effects ---
  
  useEffect(() => {
    const savedUser = localStorage.getItem('agentes_foco_user');
    if (savedUser) {
      setCurrentUser(JSON.parse(savedUser));
      setIsAuthenticated(true);
      
      const savedSessions = localStorage.getItem('agentes_foco_sessions');
      if (savedSessions) {
        setSessions(JSON.parse(savedSessions));
      }
    }
  }, []);

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
      createNewSession(selectedAgentId);
    }
  };

  const base64ToUint8Array = (base64Data: string) => {
    const binString = atob(base64Data);
    const len = binString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binString.charCodeAt(i);
    }
    return bytes;
  };

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
          console.error(e);
          textContentParts.push(`\n[ERRO: Não foi possível ler o arquivo ${att.name}. Certifique-se que é um DOCX válido.]\n`);
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

    // 2. Optimistic UI Update
    setSessions(prev => prev.map(session => {
      if (session.id === currentSessionId) {
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
      // 3. Prepare History for API
      const currentSession = sessions.find(s => s.id === currentSessionId);
      const historyForApi = [...(currentSession?.messages || []), userMsg];
      const previousMessages = historyForApi.slice(0, -1);
      const currentMessage = historyForApi[historyForApi.length - 1];

      // Process Attachments
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

      const { inlineParts, textContent } = await processAttachmentsForApi(currentMessage.attachments || []);
      let finalCurrentText = currentMessage.content;
      if (textContent) finalCurrentText = (finalCurrentText ? finalCurrentText + "\n" : "") + textContent;
      
      const currentParts: any[] = [];
      if (finalCurrentText) currentParts.push({ text: finalCurrentText });
      currentParts.push(...inlineParts);

      apiContents.push({ role: 'user', parts: currentParts });

      // 4. Initialize Empty AI Message
      const aiMsgId = (Date.now() + 1).toString();
      const aiMsg: Message = {
        id: aiMsgId,
        role: 'assistant',
        content: "", // Starts empty
        timestamp: Date.now()
      };

      // Add empty message to UI immediately
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

      // 5. Call Backend with Edge Streaming
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gemini-3-flash-preview', // Force Flash for speed
          contents: apiContents,
          systemInstruction: activeAgent.systemPrompt,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server Error: ${response.status} ${response.statusText}`);
      }
      
      if (!response.body) throw new Error("No response body received");

      // 6. Read Stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          fullText += chunk;
          
          setSessions(prev => prev.map(session => {
            if (session.id === currentSessionId) {
               const updatedMessages = session.messages.map(m => 
                 m.id === aiMsgId ? { ...m, content: fullText } : m
               );
               return { ...session, messages: updatedMessages };
            }
            return session;
          }));
        }
      }

    } catch (error: any) {
      console.error("Erro Chat:", error);
      
      const errorMsg: Message = {
        id: (Date.now() + 2).toString(),
        role: 'assistant',
        content: `**Erro de conexão:** ${error.message}. Tente novamente.`,
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
               <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-message-square-dashed"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M12 10h.01"/></svg>
            </div>
            <p>Selecione um agente ou inicie uma nova conversa.</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;