import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { AlertTriangle, CheckCircle, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { getApiUrl } from '../src/apiConfig';

// Mock chart data (mantido visualmente por enquanto, já que o back só devolve totais)
const chartData = [
  { name: 'Sem 1', completed: 0, issues: 0 },
  { name: 'Sem 2', completed: 0, issues: 0 },
  { name: 'Sem 3', completed: 0, issues: 0 },
  { name: 'Sem 4', completed: 0, issues: 0 },
];

interface MonthlyStats {
  total: number;
  completas: number;
  problemas: number;
}

interface PerformanceData {
  motorista: string;
  periodo: {
    mes: string;
    mesAnterior: string;
  };
  entregas: {
    total: number;
    completas: number;
    taxaSucesso: number;
  };
  erros: {
    total: number;
    pendentes: number;
    resolvidos: number;
    informativos: number;
    valorTotal: number;
    taxaErro: number;
    variacao: number;
    mesAnterior: number;
  };
  performance: {
    score: number;
    nivel: 'EXCELENTE' | 'BOM' | 'REGULAR' | 'ATENÇÃO';
  };
}

interface ReportsProps {
  codMotorista: string | null;
}

export const Reports: React.FC<ReportsProps> = ({ codMotorista }) => {
  const [stats, setStats] = useState<MonthlyStats>({ total: 0, completas: 0, problemas: 0 });
  const [loading, setLoading] = useState(true);
  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [loadingPerformance, setLoadingPerformance] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      if (!codMotorista) return;

      try {
        const response = await fetch(getApiUrl(`api/driver/monthly-stats/${codMotorista}`));
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (error) {
        console.error("Erro ao carregar estatísticas mensais:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [codMotorista]);

  // Buscar performance do motorista
  useEffect(() => {
    if (!codMotorista) return;

    const fetchPerformance = async () => {
      setLoadingPerformance(true);
      try {
        const response = await fetch(getApiUrl(`api/driver/performance/${codMotorista}`));
        if (response.ok) {
          const data = await response.json();
          setPerformance(data);
        }
      } catch (error) {
        console.error("Erro ao buscar performance:", error);
      } finally {
        setLoadingPerformance(false);
      }
    };

    fetchPerformance();
  }, [codMotorista]);

  const getNivelColor = (nivel: string) => {
    switch (nivel) {
      case 'EXCELENTE': return 'text-green-600 bg-green-50 border-green-200';
      case 'BOM': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'REGULAR': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'ATENÇÃO': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-slate-600 bg-slate-50 border-slate-200';
    }
  };

  const monthName = new Date().toLocaleString('pt-BR', { month: 'long' });
  const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  return (
    <div className="pt-16 px-6 pb-24 min-h-screen bg-slate-50">
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-2xl font-bold text-slate-800">Resumo Mensal</h1>
        {loading && <RefreshCw size={16} className="animate-spin text-slate-400" />}
      </div>
      <p className="text-slate-500 text-sm mb-6">Desempenho de {capitalizedMonth}</p>

      {/* Performance do Motorista */}
      {performance && (
        <div className="bg-gradient-to-br from-slate-50 to-white p-5 rounded-xl shadow-sm border border-slate-200 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-800">Performance do Mês</h2>
            <span className={`text-xs font-bold px-3 py-1 rounded-full border ${getNivelColor(performance.performance.nivel)}`}>
              {performance.performance.nivel}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white p-3 rounded-lg border border-slate-100">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle size={16} className="text-green-600" />
                <span className="text-xs text-slate-600">Taxa de Sucesso</span>
              </div>
              <p className="text-2xl font-bold text-green-600">{performance.entregas.taxaSucesso.toFixed(1)}%</p>
              <p className="text-[10px] text-slate-400">{performance.entregas.completas}/{performance.entregas.total} entregas</p>
            </div>

            <div className="bg-white p-3 rounded-lg border border-slate-100">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={16} className="text-red-600" />
                <span className="text-xs text-slate-600">Taxa de Erro</span>
              </div>
              <p className="text-2xl font-bold text-red-600">{performance.erros.taxaErro.toFixed(1)}%</p>
              <p className="text-[10px] text-slate-400">{performance.erros.total} erros</p>
            </div>
          </div>

          {performance.erros.total > 0 && (
            <div className="bg-white p-3 rounded-lg border border-slate-100 mb-3">
              <p className="text-xs font-semibold text-slate-700 mb-2">Detalhamento de Erros</p>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-600">Pendentes:</span>
                  <span className="font-bold text-orange-600">{performance.erros.pendentes}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-600">Resolvidos:</span>
                  <span className="font-bold text-green-600">{performance.erros.resolvidos}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-600">Informativos:</span>
                  <span className="font-bold text-blue-600">{performance.erros.informativos}</span>
                </div>
                {performance.erros.valorTotal > 0 && (
                  <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-100">
                    <span className="text-slate-600">Valor Total:</span>
                    <span className="font-bold text-slate-800">R$ {performance.erros.valorTotal.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {performance.erros.mesAnterior > 0 && (
            <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200">
              <span className="text-slate-600">Comparado ao mês anterior:</span>
              <div className="flex items-center gap-1">
                {performance.erros.variacao > 0 ? (
                  <>
                    <TrendingUp size={14} className="text-red-600" />
                    <span className="font-bold text-red-600">+{performance.erros.variacao}%</span>
                  </>
                ) : performance.erros.variacao < 0 ? (
                  <>
                    <TrendingDown size={14} className="text-green-600" />
                    <span className="font-bold text-green-600">{performance.erros.variacao}%</span>
                  </>
                ) : (
                  <span className="font-bold text-slate-600">Sem mudança</span>
                )}
              </div>
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Score de Performance</span>
              <span className="text-lg font-bold text-brand-600">{performance.performance.score.toFixed(0)}/100</span>
            </div>
            <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all duration-500"
                style={{ width: `${performance.performance.score}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {loadingPerformance && (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 mb-6">
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin h-6 w-6 border-3 border-brand-500 border-t-transparent rounded-full"></div>
            <span className="ml-2 text-sm text-slate-600">Carregando performance...</span>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-2 opacity-10">
            <CheckCircle size={48} className="text-green-600" />
          </div>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Entregas</p>
          <p className="text-3xl font-bold text-slate-800 mt-1">
            {loading ? "-" : stats?.completas}
          </p>
          <span className="text-green-600 text-xs font-bold flex items-center gap-1 mt-1">
            <TrendingUp size={12} /> {stats?.total > 0 ? Math.round((stats.completas / stats.total) * 100) : 0}% Conclusão
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-2 opacity-10">
            <AlertTriangle size={48} className="text-red-600" />
          </div>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Problemas</p>
          <p className="text-3xl font-bold text-slate-800 mt-1">
            {loading ? "-" : stats?.problemas}
          </p>
          <span className="text-red-500 text-xs font-bold mt-1">Devoluções/Parciais</span>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 mb-6">
        <h2 className="text-sm font-semibold text-slate-500 mb-6">Entregas x Semana</h2>
        <div className="h-64 w-full flex items-center justify-center bg-slate-50 rounded-xl text-slate-400 text-xs">
          <p>Gráfico indisponível temporariamente</p>
        </div>
      </div>

      <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 opacity-50">
        <h3 className="text-orange-900 font-bold text-sm mb-2 flex items-center gap-2">
          <AlertTriangle size={16} /> Motivos de Devolução
        </h3>
        <p className="text-xs text-orange-800 italic">Em desenvolvimento...</p>
      </div>
    </div>
  );
};