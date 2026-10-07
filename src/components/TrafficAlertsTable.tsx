import React, { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, MapPin, Clock, Info } from 'lucide-react';
import { getApiUrl } from '../apiConfig';

interface TrafficAlert {
    id: string;
    type: string;
    location: string;
    description: string;
    delay: number; // em segundos
    rawCategory?: number;
}

export const TrafficAlertsTable: React.FC = () => {
    const [alerts, setAlerts] = useState<TrafficAlert[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const fetchTrafficAlerts = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(getApiUrl('api/traffic-alerts'));

            if (!response.ok) {
                throw new Error(`Erro na requisição: ${response.status}`);
            }

            const data = await response.json();
            setAlerts(data);
            setLastUpdated(new Date());
        } catch (err: any) {
            console.error('Erro ao buscar alertas de trânsito:', err);
            setError('Não foi possível carregar os alertas de trânsito agora.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTrafficAlerts();
    }, []);

    const formatDelay = (seconds: number) => {
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        return `${minutes} min`;
    };

    const getSeverityColor = (delay: number) => {
        if (delay > 1200) return 'text-red-600 bg-red-50'; // > 20 min
        if (delay > 600) return 'text-orange-600 bg-orange-50'; // > 10 min
        return 'text-yellow-600 bg-yellow-50';
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden w-full">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="text-orange-500" size={20} />
                    <h2 className="font-semibold text-slate-800">Monitoramento de Trânsito</h2>
                </div>

                <div className="flex items-center gap-3">
                    {lastUpdated && (
                        <span className="text-xs text-slate-400 hidden sm:inline">
                            Atualizado em: {lastUpdated.toLocaleTimeString()}
                        </span>
                    )}
                    <button
                        onClick={fetchTrafficAlerts}
                        disabled={loading}
                        className="p-2 hover:bg-slate-200 rounded-full transition-colors disabled:opacity-50"
                        title="Atualizar"
                    >
                        <RefreshCw size={18} className={`text-slate-600 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
                        <tr>
                            <th className="px-4 py-3 font-medium w-32">Tipo</th>
                            <th className="px-4 py-3 font-medium w-48">O que está acontecendo</th>
                            <th className="px-4 py-3 font-medium">Localização</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading && alerts.length === 0 ? (
                            <tr>
                                <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                                    <div className="flex justify-center items-center gap-2">
                                        <RefreshCw className="animate-spin" size={16} />
                                        Carregando dados do trânsito...
                                    </div>
                                </td>
                            </tr>
                        ) : error ? (
                            <tr>
                                <td colSpan={3} className="px-4 py-8 text-center text-red-500">
                                    {error}
                                </td>
                            </tr>
                        ) : alerts.length === 0 ? (
                            <tr>
                                <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                                    Nenhum incidente de trânsito relevante reportado na região.
                                </td>
                            </tr>
                        ) : (
                            alerts.map((alert) => (
                                <tr key={alert.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-3 font-medium text-slate-700 align-top">
                                        <div className="flex flex-col gap-1">
                                            <span className="inline-flex w-fit items-center px-2 py-1 rounded-md bg-slate-100 border border-slate-200 text-xs whitespace-nowrap">
                                                {alert.type}
                                            </span>
                                            {alert.delay > 0 && (
                                                <span className={`inline-flex w-fit items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${getSeverityColor(alert.delay)}`}>
                                                    <Clock size={10} />
                                                    +{formatDelay(alert.delay)}
                                                </span>
                                            )}
                                        </div>
                                    </td>

                                    <td className="px-4 py-3 text-slate-600 align-top">
                                        <div className="flex items-start gap-1.5">
                                            <Info size={14} className="text-slate-400 shrink-0 mt-0.5" />
                                            <span>{alert.description}</span>
                                        </div>
                                    </td>

                                    <td className="px-4 py-3 text-slate-600 align-top">
                                        <div className="flex items-start gap-1.5">
                                            <MapPin size={14} className="text-slate-400 shrink-0 mt-0.5" />
                                            <span className="break-words">{alert.location || 'Local desconhecido'}</span>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
