import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';

const priorities = [
  { value: 'LOW', label: 'Baixa', color: 'text-gray-500 border-gray-200 bg-gray-50' },
  { value: 'MEDIUM', label: 'Média', color: 'text-blue-600 border-blue-200 bg-blue-50' },
  { value: 'HIGH', label: 'Alta', color: 'text-orange-600 border-orange-200 bg-orange-50' },
  { value: 'URGENT', label: 'Urgente', color: 'text-red-600 border-red-200 bg-red-50' },
];

export default function NewProtocol() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/protocols', { title, ...(description ? { description } : {}), priority });
      toast.success(`Protocolo ${res.data.protocolNumber} criado!`);
      navigate(`/protocols/${res.data.id}`);
    } catch {} finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto">
      <div className="bg-claro-red px-5 pt-12 pb-6">
        <button onClick={() => navigate('/')} className="text-white/80 hover:text-white mb-4 flex items-center gap-2">
          <ArrowLeft size={20} />
          <span className="text-sm">Voltar</span>
        </button>
        <h1 className="text-2xl font-bold text-white">Novo Chamado</h1>
        <p className="text-red-200 text-sm mt-1">Descreva seu problema</p>
      </div>

      <div className="flex-1 -mt-4 bg-white rounded-t-3xl px-5 pt-6 pb-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Assunto *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input"
              placeholder="Ex: Internet sem funcionar, cobrança incorreta..."
              required
              minLength={5}
              maxLength={120}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input resize-none"
              rows={3}
              placeholder="Descreva o problema com mais detalhes..."
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Prioridade</label>
            <div className="grid grid-cols-4 gap-2">
              {priorities.map(({ value, label, color }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPriority(value)}
                  className={`py-2 px-1 rounded-xl border-2 text-xs font-semibold transition-all ${
                    priority === value ? color + ' border-current' : 'border-gray-100 text-gray-400 bg-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-gray-400 flex items-start gap-1.5">
            <Send size={12} className="mt-0.5 flex-shrink-0" />
            Este chamado é aberto pelo WebChat. Você também pode abrir e acompanhar chamados pelo Telegram — o
            número do protocolo e o histórico são os mesmos em todos os canais.
          </p>

          <button type="submit" disabled={loading || !title.trim()} className="btn-primary flex items-center justify-center gap-2 mt-4">
            {loading ? <Loader2 size={18} className="animate-spin" /> : null}
            {loading ? 'Criando...' : 'Abrir Chamado'}
          </button>
        </form>
      </div>
    </div>
  );
}
