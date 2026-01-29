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
          // Importação dinâmica para evitar problemas de SSR/Build se o pdfjs não estiver setup
          // Vamos usar o pdfjs v4+ (que usa modules) se possível, ou fallback.
          // Como estamos em ambiente browser (client-side), podemos usar import() ou window se importado via script.
          // Mas como instalamos via npm, vamos tentar importar direto no topo ou aqui.
          // Para simplificar e evitar erros de "GlobalWorkerOptions undefined" sem import no topo,
          // vou usar uma abordagem robusta de importação dinâmica + CDN worker.

          const pdfjsLib = await import('pdfjs-dist');

          // Configura worker (essencial para o pdfjs funcionar)
          // Usando unpkg para garantir compatibilidade com a versão instalada ou genérica recente
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
      // 3. REMOVED DIRECT GEMINI SDK CALL FOR SECURITY
      // Instead, we call our own Backend Proxy

      // 4. Get Current History for API
      const currentSession = sessions.find(s => s.id === currentSessionId);
      const historyMessages = currentSession?.messages || []; // Histórico anterior (sem a msg atual que acabamos de criar)

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
        // Se não tem imagens, manda content como string simples (mais seguro e compatível)
        if (imageParts.length === 0) {
          // OpenAI não aceita content vazio, mas a UI não deixa enviar msg vazia. De qualquer forma, fallback.
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

      // 5. Call Backend Proxy
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: apiMessages,
          systemInstruction: activeAgent.systemPrompt,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro na comunicação com o servidor.");
      }

      const aiText = data.text || "Não foi possível gerar uma resposta.";

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