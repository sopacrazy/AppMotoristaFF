import React, { useState } from 'react';
import { Delivery, DeliveryStatus } from '../types';
import { DeliveryCard } from '../components/DeliveryCard';
import { Search, Filter, MoreVertical, Play, Power, Clock, RefreshCw } from 'lucide-react';
import { ProgressBar } from '../components/ProgressBar';

interface DeliveryListProps {
  deliveries: Delivery[];
  updateStatus: (id: string, status: DeliveryStatus) => void;
  onArrival: (id: string) => void;
  onRefresh?: () => Promise<void>;
  jornadaIniciada: boolean;
  jornadaEncerrada: boolean;
   horaInicio: Date | null;
  kmInicial?: number | null;
  kmFinal?: number | null;
  toggleJornada: (iniciar: boolean, km?: number) => void;
}

export const DeliveryList: React.FC<DeliveryListProps> = ({
  deliveries,
  updateStatus,
  onArrival,
  onRefresh,
  jornadaIniciada,
   jornadaEncerrada,
  horaInicio,
  kmInicial,
  kmFinal,
  toggleJornada
}) => {
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'DONE'>('ALL');
   const [searchTerm, setSearchTerm] = useState('');
  const [mostrarMenu, setMostrarMenu] = useState(false);
  const [mostrarModalKM, setMostrarModalKM] = useState(false);
  const [kmInput, setKmInput] = useState('');
  const [tipoKM, setTipoKM] = useState<'INICIO' | 'FIM'>('INICIO');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const filteredDeliveries = deliveries.filter(d => {
    const matchesSearch = d.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.address.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (filter === 'PENDING') return d.status === DeliveryStatus.PENDING || d.status === DeliveryStatus.IN_PROGRESS;
    if (filter === 'DONE') return d.status === DeliveryStatus.COMPLETED || d.status === DeliveryStatus.FAILED;
    return true;
  });

  const total = deliveries.length;
  const completed = deliveries.filter(d => d.status === DeliveryStatus.COMPLETED).length;

   const handleToggleJornada = async () => {
    if (jornadaIniciada) {
      if (completed === 0) {
        alert("Você precisa concluir pelo menos uma entrega antes de encerrar a jornada.");
        return;
      }
      setTipoKM('FIM');
      setKmInput(kmFinal ? String(kmFinal) : '');
      setMostrarModalKM(true);
    } else {
      setTipoKM('INICIO');
      setKmInput('');
      setMostrarModalKM(true);
    }
    setMostrarMenu(false);
  };

  const confirmarKM = async () => {
    const kmValue = parseInt(kmInput);
    if (isNaN(kmValue) || kmValue <= 0) {
      alert("Por favor, insira um KM válido.");
      return;
    }

    if (tipoKM === 'INICIO') {
      await toggleJornada(true, kmValue);
    } else {
      if (kmInicial && kmValue < kmInicial) {
        alert(`O KM final (${kmValue}) não pode ser menor que o KM inicial (${kmInicial}). Verifique o valor informado.`);
        return;
      }
      if (kmInicial && (kmValue - kmInicial) > 700) {
        alert(`A diferença entre o KM final (${kmValue}) e o inicial (${kmInicial}) é de ${kmValue - kmInicial} km, acima do limite de 700 km.\n\nVerifique se digitou o valor correto.`);
        return;
      }
      await toggleJornada(false, kmValue);
    }
    setMostrarModalKM(false);
  };

  const handleManualRefresh = async () => {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="pt-20 px-4 pb-24 min-h-screen bg-slate-50" onClick={() => setMostrarMenu(false)}>
      <div className="fixed top-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 pt-10 pb-3 px-4 shadow-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4 relative">
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-800">Minhas Entregas</h1>
             {jornadaIniciada && horaInicio && (
              <span className="text-[10px] text-green-600 font-bold flex items-center gap-1 bg-green-50 px-2 py-0.5 rounded-full w-fit mt-1">
                <Clock size={10} /> {kmInicial ? `${kmInicial} KM • ` : ''} Iniciado às {horaInicio.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {!jornadaIniciada && !jornadaEncerrada && (
              <button 
                onClick={handleToggleJornada}
                className="text-[10px] text-orange-600 font-bold flex items-center gap-1 bg-orange-50 px-2 py-1 rounded-full w-fit mt-1 animate-pulse border border-orange-200"
              >
                <Play size={10} /> CLIQUE PARA INICIAR JORNADA
              </button>
            )}
            {jornadaEncerrada && (
              <span className="text-[10px] text-slate-500 font-bold flex items-center gap-1 bg-slate-200 px-2 py-0.5 rounded-full w-fit mt-1">
                Jornada Finalizada {kmFinal ? `(${kmFinal} KM)` : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <span className="bg-brand-50 text-brand-700 text-[10px] px-2 py-1 rounded-full font-bold border border-brand-100 hidden xs:block">
              {deliveries.filter(d => d.status === DeliveryStatus.PENDING).length} Pendentes
            </span>

            {/* Botão de Refresh Manual */}
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className={`p-2 hover:bg-slate-100 rounded-full text-brand-600 transition-all active:scale-90 ${isRefreshing ? 'animate-spin' : ''}`}
              title="Buscar novos romaneios"
            >
              <RefreshCw size={20} />
            </button>

            {/* Botão de Menu de Opções */}
            <button
              onClick={() => setMostrarMenu(!mostrarMenu)}
              className="p-2 hover:bg-slate-100 rounded-full text-slate-600 transition-colors relative"
            >
              <MoreVertical size={20} />
            </button>

            {/* Dropdown Menu Escondido */}
            {mostrarMenu && (
              <div className="absolute top-10 right-0 bg-white shadow-xl rounded-xl border border-slate-100 p-2 w-48 animate-fade-in z-50">
                <button
                  onClick={handleToggleJornada}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-colors ${
                    jornadaEncerrada || (jornadaIniciada && completed === 0)
                      ? 'text-slate-400 bg-slate-50 cursor-not-allowed'
                      : jornadaIniciada
                        ? 'text-orange-600 hover:bg-orange-50'
                        : 'text-green-600 hover:bg-green-50'
                  }`}
                  disabled={jornadaEncerrada || (jornadaIniciada && completed === 0)}
                >
                  {jornadaEncerrada ? <Power size={18} /> : jornadaIniciada ? <Power size={18} /> : <Play size={18} />}
                  {jornadaEncerrada
                    ? 'Jornada Registrada'
                    : jornadaIniciada && completed === 0
                      ? 'Encerrar (0 entregas)'
                      : jornadaIniciada
                        ? 'Encerrar Jornada'
                        : 'Iniciar Jornada'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Search & Filter */}
        <div className="flex gap-2 mb-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Buscar cliente..."
              className="w-full bg-slate-100 border-none rounded-xl py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-brand-500 outline-none transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="p-2 bg-slate-100 rounded-xl text-slate-600 hover:bg-slate-200">
            <Filter size={20} />
          </button>
        </div>
      </div>

      <div className="mt-32 space-y-4">
        {/* Progress Bar Section */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
          <h2 className="text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Progresso do Romaneio</h2>
          <ProgressBar total={total} completed={completed} />
        </div>

        {/* Tabs */}
        <div className="flex p-1 bg-slate-200/50 rounded-lg mb-4">
          <button
            onClick={() => setFilter('ALL')}
            className={`flex-1 text-xs font-semibold py-2 rounded-md transition-all ${filter === 'ALL' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500'}`}
          >
            Todas
          </button>
          <button
            onClick={() => setFilter('PENDING')}
            className={`flex-1 text-xs font-semibold py-2 rounded-md transition-all ${filter === 'PENDING' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500'}`}
          >
            Pendentes
          </button>
          <button
            onClick={() => setFilter('DONE')}
            className={`flex-1 text-xs font-semibold py-2 rounded-md transition-all ${filter === 'DONE' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500'}`}
          >
            Finalizadas
          </button>
        </div>

         {filteredDeliveries.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-10 text-slate-400">
            <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mb-4">
              {isRefreshing ? <RefreshCw size={32} className="text-brand-600 animate-spin" /> : <Search size={32} className="text-slate-400" />}
            </div>
            <p>{isRefreshing ? "Buscando novas entregas..." : "Nenhuma entrega encontrada."}</p>
          </div>
        ) : (
          filteredDeliveries.map(delivery => (
            <DeliveryCard
              key={delivery.id}
              delivery={delivery}
              onStatusChange={updateStatus}
              onArrival={onArrival}
              jornadaIniciada={jornadaIniciada}
            />
          ))
        )}
      </div>

      {/* Modal de KM */}
      {mostrarModalKM && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 shadow-2xl w-full max-w-sm animate-scale-up border border-slate-100">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${tipoKM === 'INICIO' ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'}`}>
              <Clock size={28} />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">
              {tipoKM === 'INICIO' ? 'Iniciar Jornada' : 'Encerrar Jornada'}
            </h3>
            <p className="text-slate-500 text-sm mb-6 leading-relaxed">
              {tipoKM === 'INICIO'
                ? 'Informe o KM inicial do veículo para liberar as entregas.'
                : `Informe o KM final do veículo para encerrar sua jornada.${kmInicial ? ` (KM inicial: ${kmInicial})` : ''}`}
            </p>
            {tipoKM === 'FIM' && (
              <p className="text-xs text-amber-600 font-semibold mb-4 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                ⚠️ Limite máximo de diferença: 700 km
              </p>
            )}

            <div className="relative mb-6">
              <input
                type="number"
                inputMode="numeric"
                placeholder="Ex: 45230"
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-2xl font-bold text-slate-800 focus:border-brand-500 focus:bg-white outline-none transition-all placeholder:text-slate-200"
                value={kmInput}
                onChange={(e) => setKmInput(e.target.value)}
                autoFocus
              />
              <span className="absolute right-6 top-1/2 -translate-y-1/2 font-bold text-slate-300">KM</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMostrarModalKM(false)}
                className="py-3.5 bg-slate-50 text-slate-400 rounded-xl font-bold hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarKM}
                disabled={!kmInput || parseInt(kmInput) <= 0}
                className={`py-3.5 text-white rounded-xl font-bold shadow-lg active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${tipoKM === 'INICIO' ? 'bg-green-600 shadow-green-500/20' : 'bg-orange-600 shadow-orange-500/20'}`}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};