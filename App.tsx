import React, { useState, useEffect } from 'react';
// Removido import direto do GoogleGenAI para segurança
// @ts-ignore
import * as mammoth from "mammoth";
import * as XLSX from 'xlsx';
import { Agent, Message, User, ChatSession, Attachment } from './types';
import { AGENTS } from './config/agents';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import Login from './components/Login';
import { supabase } from './lib/supabase';

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

  // Replaced simple selectedAgentId with session management
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // New State structure: Array of sessions instead of keyed object
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  const [isTyping, setIsTyping] = useState<boolean>(false);

  // --- Supabase Helpers ---

  const loadSessionsFromSupabase = async (userEmail: string) => {
    try {
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions')
        .select('*')
        .eq('user_email', userEmail)
        .order('last_modified', { ascending: false });

      if (sessionsError) {
        console.error('Erro ao carregar sessões:', sessionsError);
        return;
      }

      if (!sessionsData || sessionsData.length === 0) {
        setSessions([]);
        return;
      }

      const sessionIds = sessionsData.map(s => s.id);

      const { data: messagesData, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .in('session_id', sessionIds)
        .order('timestamp', { ascending: true });

      if (messagesError) {
        console.error('Erro ao carregar mensagens:', messagesError);
      }

      // Agrupa mensagens por session_id
      const messagesBySession: Record<string, Message[]> = {};
      (messagesData || []).forEach((msg: any) => {
        if (!messagesBySession[msg.session_id]) {
          messagesBySession[msg.session_id] = [];
        }
        messagesBySession[msg.session_id].push({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          attachments: msg.attachments_meta || [],
          timestamp: msg.timestamp
        });
      });

      const sessionsWithMessages: ChatSession[] = sessionsData.map((session: any) => ({
        id: session.id,
        agentId: session.agent_id,
        title: session.title,
        lastModified: session.last_modified,
        messages: messagesBySession[session.id] || []
      }));

      setSessions(sessionsWithMessages);
    } catch (err) {
      console.error('Erro ao carregar dados do Supabase:', err);
    }
  };

  const saveSessionToSupabase = async (session: ChatSession, userEmail: string) => {
    await supabase.from('sessions').upsert({
      id: session.id,
      user_email: userEmail,
      agent_id: session.agentId,
      title: session.title,
      last_modified: session.lastModified
    });
  };

  const saveMessageToSupabase = async (message: Message, sessionId: string) => {
    const attachmentsMeta = (message.attachments || []).map(att => ({
      name: att.name,
      type: att.type
    }));

    await supabase.from('messages').upsert({
      id: message.id,
      session_id: sessionId,
      role: message.role,
      content: message.content,
      attachments_meta: attachmentsMeta,
      timestamp: message.timestamp
    });
  };

  const updateSessionMetaInSupabase = async (sessionId: string, updates: { title?: string, last_modified?: number }) => {
    const cleanUpdates: Record<string, any> = {};
    if (updates.title) cleanUpdates.title = updates.title;
    if (updates.last_modified) cleanUpdates.last_modified = updates.last_modified;
    if (Object.keys(cleanUpdates).length > 0) {
      await supabase.from('sessions').update(cleanUpdates).eq('id', sessionId);
    }
  };

  // --- Effects ---

  // Restaura usuário e carrega sessões do Supabase
  useEffect(() => {
    const savedUser = localStorage.getItem('agentes_foco_user');
    if (savedUser) {
      const user = JSON.parse(savedUser);
      setCurrentUser(user);
      setIsAuthenticated(true);
      loadSessionsFromSupabase(user.email);
    }
    // Limpa dados antigos do localStorage (migração)
    localStorage.removeItem('agentes_foco_sessions');
  }, []);

  // --- Handlers ---

  const handleLogin = (email: string) => {
    const user: User = { ...MOCK_USER, email };
    setCurrentUser(user);
    setIsAuthenticated(true);
    localStorage.setItem('agentes_foco_user', JSON.stringify(user));
    loadSessionsFromSupabase(email);
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

    // Persiste no Supabase
    if (currentUser) {
      saveSessionToSupabase(newSession, currentUser.email);
    }
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
      // Se o attachment não tem data (carregado do Supabase), pula o processamento
      if (!att.data) continue;

      // Modificado: PDF não é mais tratado como imagem/media direta para o GPT-4o
      const isImage = att.type.startsWith('image/');

      if (isImage) {
        const base64Data = att.data.split(',')[1];
        inlineParts.push({
          inlineData: {
            mimeType: att.type,
            data: base64Data
          }
        });
      }
      else if (att.type === 'application/pdf') {
        try {
          const pdfjsLib = await import('pdfjs-dist');

          if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
          }

          const base64Data = att.data.split(',')[1];
          const binaryString = atob(base64Data);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          const loadingTask = pdfjsLib.getDocument({ data: bytes });
          const pdf = await loadingTask.promise;

          let fullText = "";
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += `\n--- PÁGINA ${i} ---\n${pageText}`;
          }

          textContentParts.push(`\n--- CONTEÚDO DO PDF: ${att.name} ---\n${fullText}\n--- FIM DO PDF ---\n`);

        } catch (e) {
          console.error("Erro ao ler PDF:", e);
          textContentParts.push(`\n[ERRO: Não foi possível ler o texto do arquivo PDF ${att.name}. Certifique-se que contém texto selecionável.]\n`);
        }
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
      else if (att.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || att.type === 'application/vnd.ms-excel') {
        try {
          const base64Data = att.data.split(',')[1];
          const buffer = base64ToUint8Array(base64Data);
          const workbook = XLSX.read(buffer, { type: 'array' });

          // Processa todas as abas ou pelo menos a primeira
          let allSheetsText = "";

          workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const csvContent = XLSX.utils.sheet_to_csv(worksheet);
            if (csvContent.trim()) {
              allSheetsText += `\n--- ABA: ${sheetName} ---\n${csvContent}\n`;
            }
          });

          textContentParts.push(`\n--- CONTEÚDO DA PLANILHA: ${att.name} ---\n${allSheetsText}\n--- FIM DA PLANILHA ---\n`);
        } catch (e) {
          console.error("Erro ao processar planilha:", e);
          textContentParts.push(`\n[ERRO: Não foi possível ler a planilha ${att.name}.]\n`);
        }
      }

      else {
        try {
          // Tentativa genérica para texto (CSV, TXT, MD, etc)
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
    let newTitle = '';
    setSessions(prev => prev.map(session => {
      if (session.id === currentSessionId) {
        // Generate a title if it's the first message
        newTitle = session.messages.length === 0
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

    // 3. Persiste mensagem do usuário no Supabase (sem base64 dos attachments)
    saveMessageToSupabase(userMsg, currentSessionId);
    if (newTitle) {
      updateSessionMetaInSupabase(currentSessionId, { title: newTitle, last_modified: Date.now() });
    }

    setIsTyping(true);

    try {
      // 4. Get Current History for API
      const currentSession = sessions.find(s => s.id === currentSessionId);
      const historyMessages = currentSession?.messages || [];

      const processMessageForOpenAI = async (msg: Message) => {
        // 1. Acumula todo o texto (mensagem principal + conteúdo extraído de docs)
        let fullText = msg.content || "";

        const { inlineParts, textContent } = await processAttachmentsForApi(msg.attachments || []);

        if (textContent) {
          fullText = (fullText ? fullText + "\n\n--- ANEXO ---\n" : "") + textContent;
        }

        // REFORÇO DE PROMPT: Adiciona lembrete para seguir instruções se houver anexo (contexto longo)
        if (textContent && fullText) {
          fullText += "\n\n(IMPORTANTE: Siga estritamente as instruções do sistema quanto ao formato de resposta solicitado. Se foi pedido CSV, entregue APENAS CSV. Se foi pedido Diagnóstico, siga o modelo.)";
        }

        // 2. Processa Imagens
        const imageParts: any[] = [];
        inlineParts.forEach((part: any) => {
          if (part.inlineData && part.inlineData.mimeType.startsWith("image/")) {
            imageParts.push({
              type: "image_url",
              image_url: {
                url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
              }
            });
          }
        });

        // 3. Monta o payload final
        if (imageParts.length === 0) {
          return {
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: fullText || " "
          };
        }

        // Se tem imagens, manda array multimodal
        const content: any[] = [];
        if (fullText) {
          content.push({ type: "text", text: fullText });
        }
        content.push(...imageParts);

        return {
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: content
        };
      };

      // Mapeia histórico
      const apiMessages = await Promise.all(historyMessages.map(processMessageForOpenAI));

      // Adiciona mensagem atual
      const currentMsgApi = await processMessageForOpenAI(userMsg);
      apiMessages.push(currentMsgApi);

      // 5. Call Backend Proxy (Gemini via streaming)
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: apiMessages,
          systemInstruction: activeAgent.systemPrompt,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
        throw new Error(errorData.error || "Erro na comunicação com o servidor.");
      }

      // 6. Lê streaming de texto e atualiza UI progressivamente
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("Resposta sem corpo (body).");
      }

      // Cria a mensagem do assistente vazia para ir preenchendo
      const aiMsgId = (Date.now() + 1).toString();
      const aiMsg: Message = {
        id: aiMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now()
      };

      // Adiciona msg vazia primeiro (só no state, NÃO salva no Supabase ainda)
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

      // Lê chunks do stream e vai atualizando a mensagem
      let fullText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;

        // Atualiza a mensagem do assistente com o texto acumulado
        const currentText = fullText;
        setSessions(prev => prev.map(session => {
          if (session.id === currentSessionId) {
            return {
              ...session,
              messages: session.messages.map(m =>
                m.id === aiMsgId ? { ...m, content: currentText } : m
              ),
              lastModified: Date.now()
            };
          }
          return session;
        }));
      }

      // 7. Stream finalizado - salva mensagem completa do assistente no Supabase
      const finalAiMsg: Message = {
        ...aiMsg,
        content: fullText
      };
      saveMessageToSupabase(finalAiMsg, currentSessionId);
      updateSessionMetaInSupabase(currentSessionId, { last_modified: Date.now() }).catch(() => {});

    } catch (error: any) {
      console.error("Erro API Gemini:", error);

      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `[ERRO] ${error.message || "Erro desconhecido."}`,
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

      // Salva mensagem de erro no Supabase
      saveMessageToSupabase(errorMsg, currentSessionId);
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
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-message-square-dashed"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M9 10h.01" /><path d="M15 10h.01" /><path d="M12 10h.01" /></svg>
            </div>
            <p>Selecione um agente ou inicie uma nova conversa.</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
