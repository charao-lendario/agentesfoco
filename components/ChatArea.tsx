import React, { useRef, useEffect, useState } from 'react';
import { Agent, Message, Attachment } from '../types';
import { Send, Bot, Sparkles, Paperclip, X, FileText, PlusCircle } from 'lucide-react';

interface ChatAreaProps {
  agent: Agent;
  messages: Message[];
  onSendMessage: (text: string, attachments: Attachment[]) => void;
  onNewChat: () => void;
  isTyping: boolean;
}

const ChatArea: React.FC<ChatAreaProps> = ({ agent, messages, onSendMessage, onNewChat, isTyping }) => {
  const [inputText, setInputText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Attachment[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, selectedFiles]);

  useEffect(() => {
    // Focus input on agent switch
    inputRef.current?.focus();
    setSelectedFiles([]); // Clear files on agent switch
  }, [agent.id]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newAttachments: Attachment[] = [];
      
      for (let i = 0; i < e.target.files.length; i++) {
        const file = e.target.files[i];
        
        // Convert to Base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = error => reject(error);
        });

        newAttachments.push({
          name: file.name,
          type: file.type,
          data: base64
        });
      }
      
      setSelectedFiles(prev => [...prev, ...newAttachments]);
      // Reset input so same file can be selected again if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() || selectedFiles.length > 0) {
      onSendMessage(inputText, selectedFiles);
      setInputText('');
      setSelectedFiles([]);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#F9FAFB] relative">
      {/* Chat Header */}
      <div className="h-16 border-b border-gray-200 bg-white flex items-center px-6 justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <div>
            <h2 className="font-bold text-gray-900">{agent.name}</h2>
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <Sparkles size={10} className="text-[#D4AF37]" />
              {agent.role}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="hidden md:block text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded border border-gray-100">
            Modelo: Gemini 3.0 Pro
          </div>
          <button 
            onClick={onNewChat}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:text-[#D4AF37] hover:border-[#D4AF37] hover:bg-yellow-50/50 transition-all shadow-sm"
            title="Limpar histórico e iniciar nova conversa"
          >
            <PlusCircle size={14} />
            Nova Conversa
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-60">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4 text-[#D4AF37]">
              <Bot size={32} />
            </div>
            <p className="text-lg font-medium">Inicie uma conversa com {agent.name}</p>
            <p className="text-sm">Pronto para ajudar com {agent.role}</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex w-full ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-5 py-4 shadow-sm text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[#0A192F] text-white rounded-br-none'
                    : 'bg-white border border-gray-100 text-gray-800 rounded-bl-none'
                }`}
              >
                 {/* Attachments Display in Message */}
                 {msg.attachments && msg.attachments.length > 0 && (
                   <div className="mb-3 flex flex-wrap gap-2">
                     {msg.attachments.map((att, idx) => (
                       <div key={idx} className={`flex items-center gap-2 p-2 rounded-lg max-w-full ${msg.role === 'user' ? 'bg-white/10' : 'bg-gray-100'}`}>
                          {att.type.startsWith('image/') ? (
                             <img src={att.data} alt={att.name} className="h-16 w-16 object-cover rounded-md" />
                          ) : (
                             <div className={`p-2 rounded-md ${msg.role === 'user' ? 'bg-white/20' : 'bg-gray-200'}`}>
                               <FileText size={24} />
                             </div>
                          )}
                          <div className="overflow-hidden">
                            <p className="truncate text-xs font-medium w-24">{att.name}</p>
                            <p className="text-[10px] opacity-70 uppercase">{att.name.split('.').pop()}</p>
                          </div>
                       </div>
                     ))}
                   </div>
                 )}

                 <div className="whitespace-pre-wrap">{msg.content}</div>
                 <div className={`text-[10px] mt-2 opacity-60 ${msg.role === 'user' ? 'text-gray-300' : 'text-gray-400'}`}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                 </div>
              </div>
            </div>
          ))
        )}
        
        {/* Typing Indicator */}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm flex items-center gap-2">
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-gray-200 shrink-0">
        
        {/* File Preview Area */}
        {selectedFiles.length > 0 && (
          <div className="flex gap-2 mb-3 overflow-x-auto pb-2 scrollbar-hide">
            {selectedFiles.map((file, idx) => (
              <div key={idx} className="relative group flex-shrink-0">
                <div className="w-16 h-16 rounded-lg border border-gray-200 overflow-hidden flex items-center justify-center bg-gray-50">
                  {file.type.startsWith('image/') ? (
                    <img src={file.data} alt="preview" className="w-full h-full object-cover" />
                  ) : (
                    <FileText className="text-gray-400" size={24} />
                  )}
                </div>
                <button 
                  onClick={() => removeFile(idx)}
                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={10} />
                </button>
                <span className="text-[9px] text-gray-500 truncate w-16 block text-center mt-1">{file.name}</span>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSend} className="max-w-4xl mx-auto relative flex gap-2 items-end">
          <input 
            type="file"
            multiple
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileSelect}
            // Add .doc and .docx support
            accept=".pdf,.txt,.md,.jpg,.jpeg,.png,.html,.css,.js,.ts,.json,.csv,.doc,.docx"
          />
          
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-gray-500 hover:text-[#D4AF37] hover:border-[#D4AF37] transition-all"
            title="Anexar arquivos (PDF, Docs, Imagens, Texto)"
          >
            <Paperclip size={20} />
          </button>

          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`Mensagem para ${agent.name}...`}
              className="w-full pl-4 pr-14 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:border-[#D4AF37] focus:bg-white transition-all shadow-sm text-gray-800"
            />
            <button
              type="submit"
              disabled={(!inputText.trim() && selectedFiles.length === 0) || isTyping}
              className="absolute right-2 top-2 bottom-2 aspect-square bg-[#D4AF37] hover:bg-[#b5952f] text-white rounded-lg flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              <Send size={18} />
            </button>
          </div>
        </form>
        <p className="text-center text-[10px] text-gray-400 mt-2">
          Suporta PDF, DOC/DOCX, Imagens e Texto.
        </p>
      </div>
    </div>
  );
};

export default ChatArea;