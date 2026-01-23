import React from 'react';
import { Agent, User, ChatSession } from '../types';
import { 
  BrainCircuit, 
  PenTool, 
  Terminal, 
  BarChart3, 
  Bot, 
  LogOut, 
  Settings,
  Notebook,
  MessageSquare,
  Clock
} from 'lucide-react';

interface SidebarProps {
  agents: Agent[];
  selectedAgentId: string | null;
  onSelectAgent: (id: string) => void;
  currentUser: User | null;
  onLogout: () => void;
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
}

// Map string names to Lucide components
const IconMap: Record<string, React.FC<any>> = {
  BrainCircuit,
  PenTool,
  Terminal,
  BarChart3,
  Bot,
  Notebook
};

const Sidebar: React.FC<SidebarProps> = ({ 
  agents, 
  selectedAgentId, 
  onSelectAgent, 
  currentUser,
  onLogout,
  sessions,
  currentSessionId,
  onSelectSession
}) => {
  // Sort sessions by last modified (newest first)
  const sortedSessions = [...sessions].sort((a, b) => b.lastModified - a.lastModified);

  return (
    <div className="h-full w-72 bg-[#0A192F] flex flex-col shadow-2xl z-10">
      {/* Header */}
      <div className="p-6 border-b border-white/10 flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 bg-[#D4AF37] rounded-lg flex items-center justify-center text-[#0A192F]">
          <Bot size={20} />
        </div>
        <span className="text-white font-bold text-xl tracking-tight">Agentes Foco</span>
      </div>

      {/* Main Navigation (Agents & History) */}
      <div className="flex-1 overflow-y-auto py-6 px-3 space-y-6">
        
        {/* Agents Section */}
        <div className="space-y-2">
          <h3 className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Nova Conversa com
          </h3>
          
          {agents.map((agent) => {
            const IconComponent = IconMap[agent.avatar] || Bot;
            const isAgentActive = selectedAgentId === agent.id;

            return (
              <button
                key={agent.id}
                onClick={() => onSelectAgent(agent.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group text-left
                  ${isAgentActive 
                    ? 'bg-white/10 text-white' 
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }`}
              >
                <div className={`p-2 rounded-lg ${isAgentActive ? 'bg-[#D4AF37] text-[#0A192F]' : 'bg-[#0A192F] border border-gray-600 group-hover:border-[#D4AF37]/50'}`}>
                  <IconComponent size={18} />
                </div>
                <div className="flex flex-col">
                  <span className={`font-medium text-sm ${isAgentActive ? 'text-white' : 'text-gray-300'}`}>
                    {agent.name}
                  </span>
                  <span className="text-xs text-gray-500 truncate w-32">
                    {agent.role}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* History Section */}
        {sortedSessions.length > 0 && (
          <div className="space-y-2 pt-4 border-t border-white/10">
            <h3 className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Clock size={12} /> Histórico Recente
            </h3>
            
            {sortedSessions.map((session) => {
              const isActive = currentSessionId === session.id;
              const agent = agents.find(a => a.id === session.agentId);
              
              return (
                <button
                  key={session.id}
                  onClick={() => onSelectSession(session.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group text-left text-xs
                    ${isActive 
                      ? 'bg-[#D4AF37]/10 text-[#D4AF37] border-l-2 border-[#D4AF37]' 
                      : 'text-gray-400 hover:bg-white/5 hover:text-gray-200 border-l-2 border-transparent'
                    }`}
                >
                  <MessageSquare size={14} className={isActive ? "text-[#D4AF37]" : "text-gray-500"} />
                  <div className="flex flex-col overflow-hidden">
                    <span className="font-medium truncate w-40">
                      {session.title || "Nova Conversa"}
                    </span>
                    <span className="text-[10px] opacity-60 truncate">
                      {agent?.name} • {new Date(session.lastModified).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* User Footer */}
      <div className="p-4 border-t border-white/10 bg-[#0A192F] shrink-0">
        <div className="flex items-center gap-3 mb-4 px-2">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#D4AF37] to-yellow-200 flex items-center justify-center text-[#0A192F] font-bold">
            {currentUser?.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium text-white truncate">{currentUser?.name}</p>
            <p className="text-xs text-gray-400 truncate">{currentUser?.email}</p>
          </div>
        </div>
        
        <div className="flex gap-1">
          <button className="flex-1 flex items-center justify-center gap-2 p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors text-xs">
            <Settings size={16} />
            Config
          </button>
          <button 
            onClick={onLogout}
            className="flex-1 flex items-center justify-center gap-2 p-2 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-900/20 transition-colors text-xs"
          >
            <LogOut size={16} />
            Sair
          </button>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;