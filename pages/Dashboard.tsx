import React, { useState, useRef, useEffect } from 'react';
import { Package, MapPinned, History, PieChart, LogOut, RefreshCw, ClipboardCheck, MessageSquare, Timer, Receipt } from 'lucide-react';
import { DriverStats, AppRoute, Badge } from '../types';
import { ProgressBar } from '../components/ProgressBar';
import { AchievementsWidget } from '../src/components/AchievementsWidget';
import { CommunityFeed } from '../src/components/CommunityFeed';
import { getApiUrl } from '../src/apiConfig';
import { DriverMessages } from '../components/DriverMessages';

interface DashboardProps {
  stats: DriverStats;
  navigate: (route: AppRoute) => void;
  onLogout: () => void;
  codMotorista: string | null;
  onRefresh?: () => Promise<void>;
  onCheckUpdate?: () => Promise<void>;
  checklistConcluido?: boolean;
  jornadaIniciada?: boolean;
  isAdmin?: boolean;
}

const MenuButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  desc: string;
  colorClass: string;
  onClick: () => void;
  disabled?: boolean;
  alert?: boolean;
  done?: boolean;
}> = ({ icon, label, desc, colorClass, onClick, disabled, alert, done }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-start p-4 bg-white rounded-2xl shadow-sm border active:scale-95 transition-transform w-full relative group ${disabled ? '' : 'border-slate-100 hover:shadow-md'
      }`}
  // Remover filter quando disabled para manter branco
  >
    {alert && !done && (
      <div className="absolute top-2 right-2 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse" />
    )}
    {done && (
      <div className="absolute top-2 right-2 bg-green-100 text-green-600 rounded-full p-1">
        <ClipboardCheck size={12} />
      </div>
    )}

    {/* Ícone: Mantém colorClass (ex: bg-slate-400 se disabled) */}
    <div className={`p-3 rounded-xl ${colorClass} text-white mb-3 shadow-md transition-colors`}>
      {icon}
    </div>

    {/* Label: Cinza se disabled, Escuro se normal */}
    <span className={`font-bold transition-colors ${disabled ? 'text-slate-400' : 'text-slate-800'}`}>
      {label}
    </span>
    <span className="text-xs text-slate-400 text-left mt-1">{desc}</span>
  </button>
);


export const Dashboard: React.FC<DashboardProps> = ({ stats, navigate, onLogout, codMotorista, onRefresh, onCheckUpdate, checklistConcluido, jornadaIniciada, isAdmin }) => {
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);
  // ... (Hooks existing)
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const touchStartY = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Gamification State
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loadingBadges, setLoadingBadges] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const fetchBadges = async () => {
    if (!codMotorista) return;
    setLoadingBadges(true);
    try {
      const response = await fetch(getApiUrl(`api/users/${codMotorista}/badges`));
      if (response.ok) {
        const data = await response.json();
        setBadges(data);
      }
    } catch (error) {
      console.error("Erro ao buscar badges:", error);
    } finally {
      setLoadingBadges(false);
    }
  };

  useEffect(() => {
    fetchBadges();
  }, [codMotorista, refreshTrigger]);

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Função para atualizar dados
  const handleRefresh = async () => {
    if (isRefreshing || !onRefresh) return;

    setIsRefreshing(true);
    try {
      setRefreshTrigger(prev => prev + 1); // Força atualização do feed e badges
      await Promise.all([onRefresh(), fetchBadges()]);
    } catch (error) {
      console.error('Erro ao atualizar:', error);
    } finally {
      setIsRefreshing(false);
      setPullDistance(0);
    }
  };

  // Handlers para pull-to-refresh (touch)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop === 0) {
      touchStartY.current = e.touches[0].clientY;
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling || !containerRef.current) return;

    const currentY = e.touches[0].clientY;
    const distance = currentY - touchStartY.current;

    if (distance > 0 && containerRef.current.scrollTop === 0) {
      const maxPull = 80;
      const pull = Math.min(distance, maxPull);
      setPullDistance(pull);
    } else {
      setIsPulling(false);
      setPullDistance(0);
    }
  };

  const handleTouchEnd = () => {
    if (pullDistance > 50 && !isRefreshing) {
      handleRefresh();
    } else {
      setPullDistance(0);
    }
    setIsPulling(false);
  };

  // Handlers para pull-to-refresh (mouse - desktop)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (containerRef.current && containerRef.current.scrollTop === 0 && e.clientY > 0) {
      touchStartY.current = e.clientY;
      setIsPulling(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPulling || !containerRef.current) return;

    const currentY = e.clientY;
    const distance = currentY - touchStartY.current;

    if (distance > 0 && containerRef.current.scrollTop === 0) {
      const maxPull = 80;
      const pull = Math.min(distance, maxPull);
      setPullDistance(pull);
    } else {
      setIsPulling(false);
      setPullDistance(0);
    }
  };

  const handleMouseUp = () => {
    if (pullDistance > 50 && !isRefreshing) {
      handleRefresh();
    } else {
      setPullDistance(0);
    }
    setIsPulling(false);
  };

  // Calcular rotação do ícone de refresh
  const refreshRotation = pullDistance > 50 ? 180 : 0;
  const shouldTriggerRefresh = pullDistance > 50;

  return (
    <div
      ref={containerRef}
      className="pb-24 animate-fade-in relative overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Pull-to-refresh indicator */}
      {(isPulling || isRefreshing) && (
        <div
          className="fixed top-0 left-0 right-0 z-40 flex items-center justify-center bg-white/95 backdrop-blur-md transition-all duration-300"
          style={{
            height: `${Math.min(pullDistance, 80)}px`,
            transform: `translateY(${Math.min(pullDistance - 80, 0)}px)`,
            opacity: pullDistance > 10 ? 1 : 0
          }}
        >
          <div className="flex flex-col items-center gap-2">
            <RefreshCw
              size={24}
              className={`text-brand-600 transition-transform duration-300 ${isRefreshing ? 'animate-spin' : ''}`}
              style={{ transform: `rotate(${refreshRotation}deg)` }}
            />
            <span className="text-xs text-slate-600 font-medium">
              {isRefreshing
                ? 'Atualizando...'
                : shouldTriggerRefresh
                  ? 'Solte para atualizar'
                  : 'Arraste para atualizar'}
            </span>
          </div>
        </div>
      )}
      {/* Aviso de Offline (Fixed Top) */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 bg-red-600 text-white text-xs font-bold py-2 px-4 text-center z-50 animate-slide-down shadow-md">
          📡 Você está OFFLINE. As operações serão salvas no aparelho.
        </div>
      )}

      {/* Header Section */}
      <div className={`bg-brand-900 pt-8 pb-16 px-6 rounded-b-[2.5rem] shadow-xl relative overflow-hidden transition-all ${!isOnline ? 'mt-8' : ''}`}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full -mr-16 -mt-16 pointer-events-none"></div>
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-brand-100 text-sm">Bem vindo de volta,</p>
              <h1 className="text-2xl font-bold text-white tracking-tight">{stats.name}</h1>
            </div>

            <div className="flex items-center gap-3">
              {/* Botão de Verificação Manual de Atualização */}
              <button
                onClick={onCheckUpdate}
                className="w-10 h-10 bg-white/20 border border-white/30 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform"
                title="Verificar Atualizações"
              >
                <RefreshCw size={18} />
              </button>

              <div className="w-12 h-12 bg-white rounded-full border-2 border-brand-500 flex items-center justify-center text-brand-700 font-bold text-lg shadow-lg">
                {stats.name.charAt(0)}
              </div>

              {/* Botão de Logout (Restaurado) */}
              <button
                onClick={onLogout}
                className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform ml-2"
                title="Sair do App"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
            <ProgressBar total={stats.totalDeliveries} completed={stats.completed} />
          </div>
        </div>
      </div>

      {/* Main Action Grid */}
      <div className="px-6 -mt-8 relative z-20 grid grid-cols-2 gap-4">
         <MenuButton
          icon={<Package size={24} />}
          label="Entregas"
          desc={!checklistConcluido && !isAdmin ? "Bloqueado" : !jornadaIniciada && !isAdmin ? "Iniciar Jornada" : "Rota atual"}
          colorClass={checklistConcluido || isAdmin ? (jornadaIniciada || isAdmin ? "bg-brand-600" : "bg-orange-500") : "bg-slate-400"}
          onClick={() => navigate(AppRoute.DELIVERIES)}
          disabled={!checklistConcluido && !isAdmin}
          alert={(!checklistConcluido || !jornadaIniciada) && !isAdmin}
          done={checklistConcluido && jornadaIniciada}
        />
        <MenuButton
          icon={<PieChart size={24} />}
          label="Resumo Mensal"
          desc="Seu desempenho"
          colorClass="bg-orange-500"
          onClick={() => navigate(AppRoute.REPORTS)}
        />
        <MenuButton
          icon={<History size={24} />}
          label="Histórico"
          desc={isAdmin ? "Pesquisa Global" : "Consultar pedidos"}
          colorClass="bg-rose-600"
          onClick={() => navigate(AppRoute.HISTORY)}
        />
        <MenuButton
          icon={<Timer size={24} />}
          label="Controle de paradas"
          desc="Registrar paradas"
          colorClass="bg-indigo-600"
          onClick={() => navigate(AppRoute.DAILY_CONTROL)}
        />

        {isAdmin ? (
          <MenuButton
            icon={<MessageSquare size={24} />}
            label="Mensagens"
            desc="Enviar para motorista"
            colorClass="bg-brand-600"
            onClick={() => navigate(AppRoute.MESSAGES)}
          />
        ) : (
          <MenuButton
            icon={<ClipboardCheck size={24} />}
            label="Checklist"
            desc={checklistConcluido ? "Concluído" : "Obrigatório"}
            colorClass="bg-emerald-600"
            onClick={() => navigate(AppRoute.CHECKLIST)}
            alert={!checklistConcluido}
            done={checklistConcluido}
          />
        )}

        <MenuButton
          icon={<Receipt size={24} />}
          label="Despesas"
          desc="Prestação de contas"
          colorClass="bg-teal-600"
          onClick={() => navigate(AppRoute.DESPESAS)}
        />
      </div>

      {/* Gamification Widget - OCULTO (reservado para uso futuro) */}
      {/* <div className="px-6 mt-6 animate-fade-in-up delay-100">
        <AchievementsWidget badges={badges} isLoading={loadingBadges} />
      </div> */}

      {/* Mensagens do Gestor */}
      <DriverMessages codMotorista={codMotorista} />

      {/* Community Feed */}
      <div className="px-6 mt-4 animate-fade-in-up delay-200 mb-6">
        <CommunityFeed refreshTrigger={refreshTrigger} />
      </div>



    </div>
  );
};