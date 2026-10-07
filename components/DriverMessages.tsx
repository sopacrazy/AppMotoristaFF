import React, { useState, useEffect } from 'react';
import { MessageSquare, X, Image, ChevronDown, ChevronUp } from 'lucide-react';
import { getApiUrl } from '../src/apiConfig';

interface DriverMessage {
  id: number;
  mensagem: string;
  foto_url: string | null;
  lida: number;
  criado_em: string;
}

interface DriverMessagesProps {
  codMotorista: string | null;
}

export const DriverMessages: React.FC<DriverMessagesProps> = ({ codMotorista }) => {
  const [messages, setMessages] = useState<DriverMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [photoModal, setPhotoModal] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const fetchMessages = async () => {
    if (!codMotorista) return;
    setLoading(true);
    try {
      const res = await fetch(getApiUrl(`api/mensagens/${codMotorista}`));
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (e) {
      console.error('Erro ao buscar mensagens:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
    // Atualiza a cada 60 segundos
    const interval = setInterval(fetchMessages, 60000);
    return () => clearInterval(interval);
  }, [codMotorista]);

  const markAsRead = async (id: number) => {
    try {
      await fetch(getApiUrl(`api/mensagens/${id}/lida`), { method: 'PUT' });
      setMessages(prev =>
        prev.map(m => m.id === id ? { ...m, lida: 1 } : m)
      );
    } catch (e) {
      console.error('Erro ao marcar como lida:', e);
    }
  };

  const toggleExpand = (id: number) => {
    const msg = messages.find(m => m.id === id);
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Marca como lida ao expandir
        if (msg && !msg.lida) markAsRead(id);
      }
      return next;
    });
  };

  if (!codMotorista || (messages.length === 0 && !loading)) return null;

  const unreadCount = messages.filter(m => !m.lida).length;

  return (
    <>
      {/* Modal de foto */}
      {photoModal && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setPhotoModal(null)}
        >
          <div className="relative w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setPhotoModal(null)}
              className="absolute -top-10 right-0 text-white/80 hover:text-white p-2"
            >
              <X size={28} />
            </button>
            <p className="text-white/60 text-xs text-center mb-3 font-semibold uppercase tracking-wider">
              Imagem da mensagem
            </p>
            <img
              src={photoModal}
              alt="Imagem da mensagem do gestor"
              className="w-full rounded-2xl shadow-2xl border-2 border-white/10"
            />
          </div>
        </div>
      )}

      <div className="px-6 mt-4 animate-fade-in-up">
        {/* Cabeçalho da seção */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-slate-800 rounded-lg">
              <MessageSquare size={14} className="text-white" />
            </div>
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
              Mensagens
            </h2>
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center animate-pulse">
                {unreadCount}
              </span>
            )}
          </div>
          {loading && (
            <div className="w-3 h-3 border border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          )}
        </div>

        {/* Lista de mensagens */}
        <div className="space-y-2">
          {messages.map(msg => {
            const isExpanded = expanded.has(msg.id);
            const isLong = msg.mensagem.length > 100;
            const displayText = !isExpanded && isLong
              ? msg.mensagem.slice(0, 100) + '...'
              : msg.mensagem;

            return (
              <div
                key={msg.id}
                className={`rounded-2xl border transition-all overflow-hidden ${
                  msg.lida
                    ? 'bg-white border-slate-100'
                    : 'bg-amber-50 border-amber-200 shadow-sm shadow-amber-100'
                }`}
              >
                {/* Barra de destaque topo (não lida) */}
                {!msg.lida && (
                  <div className="h-1 bg-gradient-to-r from-amber-400 to-orange-400" />
                )}

                <div className="p-3">
                  {/* Header da mensagem */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${msg.lida ? 'bg-slate-300' : 'bg-amber-400'}`} />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Gestor
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {new Date(msg.criado_em).toLocaleDateString('pt-BR', {
                        day: '2-digit', month: '2-digit',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </span>
                  </div>

                  {/* Texto da mensagem */}
                  <p className={`text-sm leading-relaxed mb-2 ${msg.lida ? 'text-slate-600' : 'text-slate-800 font-medium'}`}>
                    {displayText}
                  </p>

                  {/* Botões de ação */}
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <div className="flex items-center gap-2">
                      {/* Ver foto */}
                      {msg.foto_url && (
                        <button
                          onClick={() => {
                            setPhotoModal(msg.foto_url!);
                            if (!msg.lida) markAsRead(msg.id);
                          }}
                          className="flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full border border-blue-100 hover:bg-blue-100 transition-colors active:scale-95"
                        >
                          <Image size={11} />
                          Ver imagem
                        </button>
                      )}

                      {/* Marcar como lida */}
                      {!msg.lida && (
                        <button
                          onClick={() => markAsRead(msg.id)}
                          className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-full border border-amber-200 hover:bg-amber-200 transition-colors"
                        >
                          Marcar como lida
                        </button>
                      )}
                    </div>

                    {/* Expandir texto longo */}
                    {isLong && (
                      <button
                        onClick={() => toggleExpand(msg.id)}
                        className="flex items-center gap-0.5 text-[10px] font-bold text-slate-400 hover:text-slate-600"
                      >
                        {isExpanded ? (
                          <><ChevronUp size={12} /> Menos</>
                        ) : (
                          <><ChevronDown size={12} /> Mais</>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};
