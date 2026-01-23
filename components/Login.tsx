import React, { useState } from 'react';
import { Lock, Mail, ArrowRight } from 'lucide-react';

interface LoginProps {
  onLogin: (email: string) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // Simulate network delay
    setTimeout(() => {
      onLogin(email);
      setIsLoading(false);
    }, 1000);
  };

  return (
    <div className="flex items-center justify-center h-screen w-full bg-[#F9FAFB]">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-[#0A192F] rounded-xl flex items-center justify-center mb-4 shadow-lg">
            <Lock className="text-[#D4AF37] w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-[#0A192F]">Agentes Foco</h1>
          <p className="text-gray-500 mt-2">Acesse sua equipe de IA especializada</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Endereço de E-mail</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="email"
                required
                className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:border-[#D4AF37] transition-colors"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Senha</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="password"
                required
                className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:border-[#D4AF37] transition-colors"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-[#D4AF37] hover:bg-[#b5952f] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#D4AF37] transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="animate-pulse">Entrando...</span>
            ) : (
              <>
                Entrar <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-400">
            Para fins de demonstração, qualquer e-mail/senha funciona.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;