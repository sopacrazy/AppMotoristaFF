import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Plus, Clock, MapPin, CheckCircle2, AlertCircle, Camera, Image as ImageIcon, Loader2, WifiOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getApiUrl } from '../src/apiConfig';
import { uploadImageToSupabase } from '../src/services/supabaseService';
import {
  savePendingParadaUpload,
  getPendingParadaUploads,
  deletePendingParadaUpload,
  updatePendingParadaLogId,
} from '../src/services/offlineStorage';
import { isOnline, onNetworkChange } from '../src/services/networkService';

interface DailyLog {
  id: string;
  local: string;
  status: 'pendente' | 'concluido';
  hora_inicio: string;
  hora_fim?: string;
  foto_url?: string;
  data: string;
  _offline?: boolean;    // parada criada offline (ainda não sincronizada)
  _fotoOffline?: boolean; // foto tirada offline (salva no IndexedDB, aguardando sync)
}

interface DailyControlProps {
  codMotorista: string | null;
  routeId: string | null;
}

const BUCKET_PARADAS = 'paradas';
const CACHE_KEY = (id: string) => `daily_logs_cache_${id}`;
const QUEUE_KEY = (id: string) => `daily_logs_queue_${id}`;

export const DailyControl: React.FC<DailyControlProps> = ({ codMotorista, routeId }) => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [networkOnline, setNetworkOnline] = useState(isOnline());

  const [entries, setEntries] = useState<DailyLog[]>([]);
  const [local, setLocal] = useState('');

  // Monitora conexão via Capacitor Network (confiável no Android APK)
  useEffect(() => {
    const unsubscribe = onNetworkChange((online) => {
      setNetworkOnline(online);
      if (online && codMotorista) syncOfflineQueue(codMotorista);
    });
    return unsubscribe;
  }, [codMotorista]);

  // Sincroniza paradas + fotos pendentes quando a internet voltar
  const syncOfflineQueue = async (motoristaId: string) => {
    // 1. Sincroniza novas paradas criadas offline
    const queue: DailyLog[] = JSON.parse(localStorage.getItem(QUEUE_KEY(motoristaId)) || '[]');
    const syncedParadas: string[] = [];
    for (const item of queue) {
      try {
        const res = await fetch(getApiUrl('api/daily_logs'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ motorista_id: motoristaId, route_id: routeId, local: item.local }),
        });
        if (res.ok) {
          const data = await res.json(); // { success: true, id: realId }
          syncedParadas.push(item.id);

          // Se havia foto offline associada a este ID offline, atualiza para o ID real do servidor
          if (data.id && item.id.startsWith('offline_')) {
            const pendingFotos = await getPendingParadaUploads();
            for (const foto of pendingFotos) {
              if (foto.logId === item.id && foto.id !== undefined) {
                await updatePendingParadaLogId(foto.id, String(data.id));
              }
            }
          }
        }
      } catch { /* mantém na fila */ }
    }
    if (syncedParadas.length > 0) {
      const remaining = queue.filter((i) => !syncedParadas.includes(i.id));
      localStorage.setItem(QUEUE_KEY(motoristaId), JSON.stringify(remaining));
    }

    // 2. Sincroniza fotos de paradas tiradas offline (preserva hora_fim original)
    const pendingFotos = await getPendingParadaUploads();
    for (const item of pendingFotos) {
      try {
        const file = new File([item.imageBlob], `parada_${item.logId}.jpg`, { type: 'image/jpeg' });
        let publicUrl = '';
        try {
          publicUrl = await uploadImageToSupabase(file, BUCKET_PARADAS) || '';
        } catch {
          publicUrl = await uploadImageToSupabase(file) || '';
        }
        if (!publicUrl) continue;

        // Converte ISO para HH:MM:SS que o MySQL espera
        const horaFim = item.finalizedAt
          ? new Date(item.finalizedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
          : undefined;

        const res = await fetch(getApiUrl(`api/daily_logs/${item.logId}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ foto_url: publicUrl, hora_fim: horaFim }),
        });
        if (res.ok && item.id !== undefined) {
          await deletePendingParadaUpload(item.id);
        }
      } catch { /* mantém na fila */ }
    }

    // 3. Atualiza lista com dados reais do servidor
    await fetchLogs(true);
  };

  const fetchLogs = async (silent = false) => {
    if (!codMotorista) return;
    try {
      if (!silent) setLoading(true);

      if (!isOnline()) {
        // Offline: usa cache do localStorage
        const cached: DailyLog[] = JSON.parse(localStorage.getItem(CACHE_KEY(codMotorista)) || '[]');
        const queued: DailyLog[] = JSON.parse(localStorage.getItem(QUEUE_KEY(codMotorista)) || '[]');
        setEntries([...queued, ...cached]);
        return;
      }

      const res = await fetch(getApiUrl(`api/daily_logs/${codMotorista}?t=${Date.now()}`));
      if (res.ok) {
        const data = await res.json();
        // Mescla com itens offline ainda na fila
        const queued: DailyLog[] = JSON.parse(localStorage.getItem(QUEUE_KEY(codMotorista)) || '[]');
        setEntries([...queued, ...data]);
        localStorage.setItem(CACHE_KEY(codMotorista), JSON.stringify(data));
      }
    } catch (err) {
      console.error("Erro ao buscar logs:", err);
      // Fallback para cache mesmo em erro inesperado
      const cached: DailyLog[] = JSON.parse(localStorage.getItem(CACHE_KEY(codMotorista)) || '[]');
      setEntries(cached);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [codMotorista]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!local.trim() || !codMotorista || saving) return;

    // Modo offline: salva na fila e mostra na tela imediatamente
    if (!isOnline()) {
      const fakeId = `offline_${Date.now()}`;
      const novaParada: DailyLog = {
        id: fakeId,
        local: local.trim(),
        status: 'pendente',
        hora_inicio: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        data: new Date().toISOString(),
        _offline: true,
      };
      const queue: DailyLog[] = JSON.parse(localStorage.getItem(QUEUE_KEY(codMotorista)) || '[]');
      queue.push(novaParada);
      localStorage.setItem(QUEUE_KEY(codMotorista), JSON.stringify(queue));
      setEntries((prev) => [novaParada, ...prev]);
      setShowForm(false);
      setLocal('');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(getApiUrl('api/daily_logs'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motorista_id: codMotorista, route_id: routeId, local: local }),
      });

      if (res.ok) {
        await fetchLogs(true);
        setShowForm(false);
        setLocal('');
      } else {
        alert("Erro ao salvar parada no servidor.");
      }
    } catch (err) {
      console.error("Erro ao salvar parada:", err);
      alert("Falha na conexão com o servidor.");
    } finally {
      setSaving(false);
    }
  };

  const handleFinalizeClick = (id: string) => {
    setSelectedLogId(id);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && selectedLogId) {
      try {
        setUploadingId(selectedLogId);

        // Modo offline: salva a foto no IndexedDB preservando o horário exato
        if (!isOnline()) {
          const finalizedAt = new Date().toISOString();
          const blob = new Blob([await file.arrayBuffer()], { type: file.type });
          await savePendingParadaUpload(selectedLogId, blob, finalizedAt);
          // Marca _fotoOffline: true para diferenciar de "parada criada offline sem foto"
          setEntries((prev) =>
            prev.map((e) =>
              e.id === selectedLogId ? { ...e, _offline: true, _fotoOffline: true, status: 'pendente' } : e
            )
          );
          // Persiste o estado atualizado no cache do localStorage
          const motoristaId = codMotorista!;
          const cached: DailyLog[] = JSON.parse(localStorage.getItem(CACHE_KEY(motoristaId)) || '[]');
          const queue: DailyLog[] = JSON.parse(localStorage.getItem(QUEUE_KEY(motoristaId)) || '[]');
          const updateFlag = (arr: DailyLog[]) =>
            arr.map((e) => e.id === selectedLogId ? { ...e, _offline: true, _fotoOffline: true } : e);
          localStorage.setItem(CACHE_KEY(motoristaId), JSON.stringify(updateFlag(cached)));
          localStorage.setItem(QUEUE_KEY(motoristaId), JSON.stringify(updateFlag(queue)));
          alert("📶 Sem internet! A foto foi salva e será enviada automaticamente quando a conexão voltar.");
          return;
        }

        let publicUrl = '';
        try {
          publicUrl = await uploadImageToSupabase(file, BUCKET_PARADAS) || '';
        } catch (storageErr: any) {
          console.warn("Bucket 'paradas' falhou, tentando fallback:", storageErr.message);
          publicUrl = await uploadImageToSupabase(file) || '';
        }

        if (!publicUrl) throw new Error("Não foi possível gerar a URL da imagem.");

        const res = await fetch(getApiUrl(`api/daily_logs/${selectedLogId}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ foto_url: publicUrl }),
        });

        if (res.ok) {
          await fetchLogs(true);
        } else {
          alert("Erro ao finalizar parada no servidor.");
        }
      } catch (err: any) {
        console.error("Erro ao finalizar parada:", err);
        alert(`Erro: ${err.message || "Falha ao enviar foto."}`);
      } finally {
        setUploadingId(null);
        setSelectedLogId(null);
      }
    }
    e.target.value = '';
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20 animate-fade-in">
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileChange}
      />

      <div className="bg-brand-900 pt-8 pb-12 px-6 rounded-b-[2.5rem] shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full -mr-16 -mt-16 pointer-events-none"></div>
        <div className="relative z-10 flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center text-white active:scale-95 transition-transform"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Controle de paradas</h1>
            <p className="text-brand-100 text-xs">Rota: {routeId || 'Sem rota ativa'}</p>
          </div>
        </div>

        {/* Indicador offline */}
        {!networkOnline && (
          <div className="relative z-10 mt-3 flex items-center gap-2 bg-amber-400/20 border border-amber-300/30 rounded-xl px-3 py-2">
            <WifiOff size={14} className="text-amber-300" />
            <span className="text-amber-200 text-xs font-semibold">
              Sem internet — paradas salvas localmente
            </span>
          </div>
        )}
      </div>

      <div className="px-6 -mt-6 relative z-20">
        {!showForm ? (
          <>
            <button
              onClick={() => setShowForm(true)}
              className="w-full bg-white p-4 rounded-2xl shadow-lg border border-slate-100 flex items-center justify-between group active:scale-[0.98] transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-brand-50 text-brand-600 rounded-xl flex items-center justify-center shadow-inner">
                  <Plus size={24} strokeWidth={2.5} />
                </div>
                <div className="text-left">
                  <span className="block font-bold text-slate-800">Nova Parada</span>
                  <span className="text-xs text-slate-400">Clique para iniciar uma parada</span>
                </div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-brand-600 group-hover:bg-brand-50 transition-colors">
                <MapPin size={18} />
              </div>
            </button>

            <div className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-slate-800">Registros de Hoje</h2>
                <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  {entries.length} {entries.length === 1 ? 'REGISTRO' : 'REGISTROS'}
                </span>
              </div>

              <div className="space-y-4">
                {loading ? (
                  <div className="py-12 flex flex-col items-center justify-center">
                    <Loader2 className="text-brand-600 animate-spin mb-2" size={32} />
                    <p className="text-slate-400 text-sm">Buscando registros...</p>
                  </div>
                ) : entries.map((entry) => (
                  <div key={entry.id} className="bg-white p-5 rounded-[24px] shadow-sm border border-slate-100 relative overflow-hidden group">
                    {entry._offline && (
                      <div className="absolute top-3 right-3 flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                        <WifiOff size={10} className="text-amber-500" />
                        <span className="text-[9px] font-bold text-amber-600">OFFLINE</span>
                      </div>
                    )}
                    <div className="flex flex-col gap-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${
                            entry.status === 'concluido' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600 animate-pulse'
                          }`}>
                            {entry.status === 'concluido' ? <CheckCircle2 size={22} /> : <Clock size={22} />}
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-800 text-sm leading-tight">{entry.local}</h3>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                entry.status === 'concluido' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                              }`}>
                                {entry.status}
                              </span>
                              <span className="text-[10px] text-slate-400 font-medium">
                                {entry.hora_inicio} {entry.hora_fim ? `às ${entry.hora_fim}` : ''}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {entry.status === 'concluido' && entry.foto_url && (
                        <div className="relative w-full h-32 rounded-2xl overflow-hidden border border-slate-100">
                          <img
                            src={entry.foto_url}
                            alt="Foto da parada"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-2 right-2 p-1.5 bg-black/40 backdrop-blur-md rounded-lg text-white">
                            <ImageIcon size={14} />
                          </div>
                        </div>
                      )}

                      {/* Botão de finalizar: aparece para paradas pendentes SEM foto offline */}
                      {entry.status === 'pendente' && !entry._fotoOffline && (
                        <button
                          disabled={uploadingId === entry.id}
                          onClick={() => handleFinalizeClick(entry.id)}
                          className={`w-full text-white font-bold py-3.5 rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 text-sm ${
                            uploadingId === entry.id ? 'bg-slate-400 cursor-not-allowed' : 'bg-brand-600 shadow-brand-100'
                          }`}
                        >
                          {uploadingId === entry.id ? (
                            <>
                              <Loader2 size={18} className="animate-spin" /> Enviando Foto...
                            </>
                          ) : (
                            <>
                              <Camera size={18} /> Finalizar Parada
                            </>
                          )}
                        </button>
                      )}

                      {/* Foto já tirada offline: aguardando sync */}
                      {entry.status === 'pendente' && entry._fotoOffline && (
                        <div className="w-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold py-3 rounded-xl text-center flex items-center justify-center gap-2">
                          <WifiOff size={13} />
                          Foto salva — enviando quando a internet voltar
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {!loading && entries.length === 0 && (
                  <div className="py-12 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-slate-100 text-slate-300 rounded-full flex items-center justify-center mb-4">
                      <AlertCircle size={32} />
                    </div>
                    <p className="text-slate-400 text-sm font-medium">Nenhuma parada registrada hoje.</p>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white p-6 rounded-[32px] shadow-xl border border-slate-100 animate-slide-up">
            <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Plus className="text-brand-600" size={20} /> Iniciar Parada
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Onde você está parando? (Local)</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <MapPin size={18} />
                  </div>
                  <input
                    required
                    autoFocus
                    type="text"
                    placeholder="Ex: Almoço, Posto, Cliente X..."
                    className="w-full bg-slate-50 border-none rounded-2xl p-4 pl-12 text-slate-800 text-sm focus:ring-2 focus:ring-brand-500 transition-all font-medium"
                    value={local}
                    onChange={(e) => setLocal(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button
                type="button"
                disabled={saving}
                onClick={() => setShowForm(false)}
                className="flex-1 py-4 text-slate-400 font-bold text-sm uppercase tracking-wider hover:text-slate-600 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-[2] bg-brand-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-brand-200 active:scale-95 transition-all flex items-center justify-center gap-2 uppercase tracking-wide text-sm disabled:bg-slate-400"
              >
                {saving ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Salvando...
                  </>
                ) : (
                  <>
                    Incluir <CheckCircle2 size={18} />
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
