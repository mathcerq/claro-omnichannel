import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';

export default function Register() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/register', { name, email, password, ...(phone ? { phone } : {}) });
      toast.success('Conta criada! Faça login para continuar.');
      navigate('/login');
    } catch {} finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="bg-claro-red px-6 pt-12 pb-16">
        <button onClick={() => navigate('/login')} className="text-white/80 hover:text-white mb-4 flex items-center gap-2">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-white">Criar conta</h1>
        <p className="text-red-200 text-sm mt-1">Central de Atendimento Claro</p>
      </div>

      <div className="flex-1 -mt-6 bg-white rounded-t-3xl px-6 pt-8 pb-6">
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome completo</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Seu nome" required minLength={2} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">E-mail</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="seu@email.com" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Telefone (opcional)</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="input" placeholder="(11) 99999-0000" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Senha</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" placeholder="Mínimo 8 caracteres" required minLength={8} />
          </div>
          <button type="submit" disabled={loading} className="btn-primary flex items-center justify-center gap-2 mt-6">
            {loading ? <Loader2 size={18} className="animate-spin" /> : null}
            {loading ? 'Criando conta...' : 'Criar conta'}
          </button>
          <p className="text-center text-sm text-gray-500">
            Já tem conta?{' '}
            <Link to="/login" className="text-claro-red font-semibold">Entrar</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
