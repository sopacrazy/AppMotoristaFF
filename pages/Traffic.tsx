import React, { useEffect, useState, useCallback } from 'react';
import {
    AlertTriangle,
    RefreshCw,
    MapPin,
    Clock,
    Construction,
    Car,
    SearchX,
    ShieldAlert,
    CloudRain,
    Wind
} from 'lucide-react';
import { getApiUrl } from '../src/apiConfig';

interface TrafficAlert {
    id: string;
    type: string;
    location: string;
    description: string;
    delay: number; // em segundos
    rawCategory?: number;
}

export const Traffic: React.FC = () => {
    const [alerts, setAlerts] = useState<TrafficAlert[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const fetchTrafficAlerts = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(getApiUrl('traffic-alerts'));

            if (!response.ok) {
                throw new Error(`Erro na conexão: ${response.status}`);
            }

            const data = await response.json();
            setAlerts(data);
            setLastUpdated(new Date());
        } catch (err: any) {
            console.error('Erro ao buscar alertas:', err);
            // Mantém os dados antigos se houver erro, para não limpar a tela
            setError('Falha ao atualizar. Verifique sua conexão.');
        } finally {
            setLoading(false);
        }
    }, []); // Dependências vazias, pois getApiUrl é estável

    useEffect(() => {
        fetchTrafficAlerts();
    }, [fetchTrafficAlerts]);

    const formatDelay = (seconds: number) => {
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        return `${minutes} min`;
    };

    const getIconForType = (type: string) => {
        const t = type.toLowerCase();
        if (t.includes('acidente')) return <AlertTriangle className="text-white" size={24} />;
        if (t.includes('obras')) return <Construction className="text-white" size={24} />;
        if (t.includes('chuva') || t.includes('enchente')) return <CloudRain className="text-white" size={24} />;
        if (t.includes('vento')) return <Wind className="text-white" size={24} />;
        if (t.includes('bloqueada') || t.includes('fechado')) return <ShieldAlert className="text-white" size={24} />;
        return <Car className="text-white" size={24} />;
    };

    const getColorForType = (type: string, delay: number) => {
        if (delay > 1200) return 'bg-red-500 shadow-red-200'; // Muito atraso
        const t = type.toLowerCase();
        if (t.includes('acidente')) return 'bg-red-500 shadow-red-200';
        if (t.includes('obras')) return 'bg-orange-500 shadow-orange-200';
        if (t.includes('bloqueada') || t.includes('fechado')) return 'bg-slate-700 shadow-slate-200';
        return 'bg-amber-500 shadow-amber-200'; // Padrão (amarelo alerta)
    };

    return (
        <div className="min-h-screen bg-slate-50 pb-24">
            {/* Header Fixo */}
            <div className="bg-white px-6 pt-12 pb-6 shadow-sm sticky top-0 z-10">
                <div className="flex justify-between items-center mb-2">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">Trânsito Agora</h1>
                        <p className="text-sm text-slate-500">Belém e Ananindeua</p>
                    </div>
                    <button
                        onClick={fetchTrafficAlerts}
                        disabled={loading}
                        className={`p-3 rounded-full bg-slate-50 text-brand-600 active:scale-95 transition-all ${loading ? 'opacity-70' : 'hover:bg-slate-100'}`}
                    >
                        <RefreshCw size={24} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>

                {lastUpdated && !loading && (
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                        <RefreshCw size={10} />
                        Atualizado às {lastUpdated.toLocaleTimeString()}
                    </p>
                )}

                {error && (
                    <div className="mt-2 bg-red-50 text-red-600 text-xs px-3 py-2 rounded-lg flex items-center gap-2">
                        <AlertTriangle size={14} />
                        {error}
                    </div>
                )}
            </div>

            {/* Lista de Cards */}
            <div className="px-5 mt-4 space-y-4">
                {loading && alerts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                        <RefreshCw className="animate-spin text-brand-500" size={32} />
                        <p>Buscando informações...</p>
                    </div>
                ) : alerts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3 text-center">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-2">
                            <SearchX size={32} />
                        </div>
                        <div>
                            <p className="font-medium text-slate-600">Tudo limpo!</p>
                            <p className="text-sm">Nenhum incidente relevante na região.</p>
                        </div>
                    </div>
                ) : (
                    alerts.map((alert) => (
                        <div
                            key={alert.id}
                            className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden group active:scale-[0.99] transition-transform duration-200"
                        >
                            <div className="flex gap-4">
                                {/* Ícone Lateral */}
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-lg ${getColorForType(alert.type, alert.delay)}`}>
                                    {getIconForType(alert.type)}
                                </div>

                                {/* Conteúdo */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start mb-1">
                                        <h3 className="font-bold text-slate-800 text-sm leading-tight pr-2">
                                            {alert.type}
                                        </h3>
                                        {alert.delay > 0 && (
                                            <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-[10px] font-bold border border-red-100">
                                                <Clock size={10} />
                                                +{formatDelay(alert.delay)}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex items-start gap-1.5 mb-2">
                                        <MapPin size={14} className="text-slate-400 mt-0.5 shrink-0" />
                                        <p className="text-xs text-slate-600 font-medium leading-relaxed break-words">
                                            {alert.location}
                                        </p>
                                    </div>

                                    <p className="text-xs text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                        {alert.description}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))
                )}

                <div className="h-4"></div> {/* Espaçador final */}
            </div>
        </div>
    );
};
