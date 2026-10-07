import React, { useEffect, useState } from 'react';
import { BadgeFeedItem } from '../../types';
import { getApiUrl } from '../apiConfig';
import { Trophy, TrendingUp, User } from 'lucide-react';

interface CommunityFeedProps {
    refreshTrigger?: number; // Para forçar atualização externa
}

export const CommunityFeed: React.FC<CommunityFeedProps> = ({ refreshTrigger }) => {
    const [feed, setFeed] = useState<BadgeFeedItem[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchFeed = async () => {
        try {
            const response = await fetch(getApiUrl('badges/feed'));
            if (response.ok) {
                const data = await response.json();
                setFeed(data);
            }
        } catch (err) {
            console.error("Erro ao carregar feed:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFeed();
    }, [refreshTrigger]);

    if (loading) return null;
    if (feed.length === 0) return null;

    // Função para formatar tempo relativo (ex: "há 2 horas")
    const timeAgo = (dateStr: string) => {
        const diff = new Date().getTime() - new Date(dateStr).getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (minutes < 1) return 'agora';
        if (minutes < 60) return `há ${minutes} min`;
        if (hours < 24) return `há ${hours} h`;
        return `há ${days} dias`;
    };

    return (
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
            <div className="flex items-center justify-between mb-4 relative z-10">
                <h2 className="font-bold text-sm flex items-center gap-2 text-slate-800">
                    <TrendingUp size={16} className="text-yellow-500" />
                    Mural da Fama
                </h2>
                <span className="text-[10px] bg-green-50 px-2 py-0.5 rounded-full text-green-700 font-bold border border-green-100 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                    Ao vivo
                </span>
            </div>

            <div className="space-y-3 relative z-10">
                {feed.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-100">
                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 border border-slate-200 shadow-sm text-xs font-bold text-slate-700">
                            {item.nome_motorista.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-600 truncate">
                                <span className="font-bold text-slate-800">{item.nome_motorista.split(' ')[0]}</span> conquistou
                            </p>
                            <p className="text-[10px] text-yellow-600 font-bold flex items-center gap-1">
                                {item.badge_name}
                            </p>
                        </div>
                        <span className="text-[10px] text-slate-400 shrink-0 bg-white px-2 py-1 rounded-md border border-slate-100">
                            {timeAgo(item.conquistado_em)}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};
