import React, { useState, useEffect } from "react";
import { Send, User, MessageSquare, Image as ImageIcon, X, Check, Loader2, Search } from "lucide-react";
import { getApiUrl } from "../src/apiConfig";

interface Motorista {
  id: number;
  codMotorista: string;
  nome_motorista: string;
}

export const AdminMessages: React.FC = () => {
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [selectedMotorista, setSelectedMotorista] = useState("");
  const [message, setMessage] = useState("");
  const [fotoUrl, setFotoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchMotoristas();
  }, []);

  const fetchMotoristas = async () => {
    try {
      const res = await fetch(getApiUrl("api/motoristas"));
      if (res.ok) {
        const data = await res.json();
        setMotoristas(data);
      }
    } catch (err) {
      console.error("Erro ao carregar motoristas:", err);
    } finally {
      setLoadingList(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMotorista || !message) {
      setStatus({ type: "error", msg: "Selecione um motorista e digite a mensagem." });
      return;
    }

    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch(getApiUrl("api/mensagens"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          motorista_id: selectedMotorista,
          mensagem: message,
          foto_url: fotoUrl || null
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStatus({ type: "success", msg: "Mensagem enviada com sucesso!" });
        setMessage("");
        setFotoUrl("");
        setSelectedMotorista("");
      } else {
        setStatus({ type: "error", msg: data.error || "Erro ao enviar mensagem." });
      }
    } catch (err) {
      setStatus({ type: "error", msg: "Erro de conexão com o servidor." });
    } finally {
      setLoading(false);
    }
  };

  const filteredMotoristas = motoristas.filter(m => 
    m.nome_motorista.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.codMotorista.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <div className="bg-white px-6 pt-12 pb-6 rounded-b-[40px] shadow-sm border-b border-slate-100 mb-6">
        <h1 className="text-2xl font-black text-slate-800 flex items-center gap-3">
          <div className="p-2 bg-brand-100 text-brand-600 rounded-xl">
            <MessageSquare size={24} />
          </div>
          Enviar Mensagem
        </h1>
        <p className="text-slate-500 text-sm mt-1">Comunique-se diretamente com os motoristas</p>
      </div>

      <div className="px-6 space-y-6">
        {/* Form Card */}
        <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100">
          <form onSubmit={handleSend} className="space-y-5">
            {/* Seleção de Motorista */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Motorista Destinatário
              </label>
              
              <div className="relative mb-3">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Search size={16} />
                </div>
                <input
                  type="text"
                  placeholder="Pesquisar motorista..."
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="max-h-48 overflow-y-auto border border-slate-100 rounded-xl bg-slate-50 p-1 space-y-1">
                {loadingList ? (
                  <div className="p-4 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                    <Loader2 size={16} className="animate-spin" /> Carregando...
                  </div>
                ) : filteredMotoristas.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 text-xs">Nenhum motorista encontrado</div>
                ) : (
                  filteredMotoristas.map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setSelectedMotorista(m.codMotorista);
                        setSearchTerm(m.nome_motorista);
                      }}
                      className={`w-full text-left px-4 py-3 rounded-lg text-sm transition-all flex items-center justify-between ${
                        selectedMotorista === m.codMotorista 
                          ? "bg-brand-600 text-white shadow-md shadow-brand-200" 
                          : "hover:bg-brand-50 text-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <User size={16} className={selectedMotorista === m.codMotorista ? "text-white" : "text-brand-500"} />
                        <span className="font-semibold">{m.nome_motorista}</span>
                      </div>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                         selectedMotorista === m.codMotorista ? "bg-white/20" : "bg-slate-200 text-slate-500"
                      }`}>
                        {m.codMotorista}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Mensagem */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Sua Mensagem
              </label>
              <textarea
                className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 text-sm focus:ring-2 focus:ring-brand-500 transition-all min-h-[120px]"
                placeholder="Ex: Favor conferir o ticket 1234..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
              />
            </div>

            {/* URL da Foto */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                <ImageIcon size={14} /> URL da Imagem (Opcional)
              </label>
              <input
                type="text"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:ring-2 focus:ring-brand-500 transition-all"
                placeholder="https://..."
                value={fotoUrl}
                onChange={(e) => setFotoUrl(e.target.value)}
              />
              {fotoUrl && (
                <div className="mt-3 relative inline-block">
                  <img src={fotoUrl} alt="Preview" className="h-24 w-auto rounded-xl border border-slate-200 shadow-sm" />
                  <button 
                    type="button"
                    onClick={() => setFotoUrl("")}
                    className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full shadow-md"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>

            {status && (
              <div className={`p-4 rounded-xl text-sm font-semibold flex items-center gap-2 animate-fade-in ${
                status.type === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
              }`}>
                {status.type === "success" ? <Check size={18} /> : <X size={18} />}
                {status.msg}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !selectedMotorista || !message}
              className="w-full py-4 bg-brand-600 text-white rounded-2xl font-bold shadow-lg shadow-brand-200 hover:bg-brand-700 transition-all active:scale-[0.98] disabled:bg-slate-300 disabled:shadow-none flex items-center justify-center gap-2 uppercase tracking-wide text-sm"
            >
              {loading ? (
                <>
                  <Loader2 size={20} className="animate-spin" /> Enviando...
                </>
              ) : (
                <>
                  <Send size={18} /> Enviar Aviso
                </>
              )}
            </button>
          </form>
        </div>

        {/* Info Card */}
        <div className="bg-slate-800 p-6 rounded-3xl text-white shadow-lg overflow-hidden relative">
          <div className="relative z-10">
            <h3 className="font-bold mb-1">Dica de Admin</h3>
            <p className="text-slate-300 text-xs leading-relaxed">
              O motorista receberá uma notificação visual no topo da tela do Dashboard assim que você enviar a mensagem.
            </p>
          </div>
          <div className="absolute -bottom-4 -right-4 opacity-10">
            <MessageSquare size={120} />
          </div>
        </div>
      </div>
    </div>
  );
};
