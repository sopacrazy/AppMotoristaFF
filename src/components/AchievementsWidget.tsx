import React, { useState } from 'react';
import {
    Sunrise,
    Zap,
    Map,
    Award,
    Star,
    Trophy,
    Crown,
    Medal,
    Target,
    ShieldCheck,
    Truck
} from 'lucide-react';
import { Badge } from '../../types';

interface AchievementsWidgetProps {
    badges: Badge[];
    isLoading?: boolean;
}

// Mapeamento de strings para componentes Lucide
const iconMap: { [key: string]: React.ElementType } = {
    'Sunrise': Sunrise,
    'Zap': Zap,
    'Map': Map,
    'Crown': Crown,
    'Award': Award,
    'Star': Star,
    'Trophy': Trophy,
    'Medal': Medal,
    'Target': Target,
    'ShieldCheck': ShieldCheck,
    'Truck': Truck,
};

export const AchievementsWidget: React.FC<AchievementsWidgetProps> = ({ badges, isLoading }) => {
    const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);

    if (isLoading) {
        return (
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 animate-pulse h-32 flex items-center justify-center">
                <span className="text-slate-400 text-xs">Carregando conquistas...</span>
            </div>
        );
    }

    // Se não houver badges cadastradas no sistema
    if (!badges || badges.length === 0) {
        return null;
    }

    return (
        <>
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                        <Trophy size={16} className="text-yellow-500" />
                        Minhas Conquistas
                    </h2>
                    <span className="text-xs text-slate-400 font-medium">
                        {badges.filter(b => b.conquistado).length}/{badges.length}
                    </span>
                </div>

                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x">
                    {badges.map((badge) => {
                        const IconComponent = iconMap[badge.icon] || Award; // Fallback para Award

                        return (
                            <div
                                key={badge.id}
                                className={`
                  flex flex-col items-center gap-2 min-w-[70px] snap-center transition-all duration-300
                  ${badge.conquistado ? 'opacity-100 scale-100' : 'opacity-60 scale-95'}
                `}
                            >
                                <div
                                    className={`
                    w-12 h-12 rounded-full flex items-center justify-center shadow-sm border
                    ${badge.conquistado
                                            ? 'bg-yellow-100 border-yellow-200 text-yellow-600 shadow-yellow-100'
                                            : 'bg-yellow-50 border-yellow-100 text-yellow-400'}
                  `}
                                >
                                    <IconComponent size={20} strokeWidth={badge.conquistado ? 2.5 : 2} />
                                </div>
                                <span className="text-[10px] font-bold text-center leading-tight max-w-[80px] text-slate-700">
                                    {badge.name}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Modal/Tooltip de Detalhes da Badge */}
            {selectedBadge && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in p-4"
                    onClick={() => setSelectedBadge(null)}
                >
                    <div
                        className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl relative animate-scale-up"
                        onClick={e => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setSelectedBadge(null)}
                            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1"
                        >
                            ✕
                        </button>

                        <div className="flex flex-col items-center text-center">
                            <div
                                className={`
                  w-20 h-20 rounded-full flex items-center justify-center mb-4 shadow-md
                  ${selectedBadge.conquistado
                                        ? 'bg-gradient-to-br from-yellow-100 to-yellow-50 text-yellow-600 border-4 border-white ring-4 ring-yellow-50'
                                        : 'bg-slate-100 text-slate-400 border-4 border-white grayscale'}
                `}
                            >
                                {(() => {
                                    const Icon = iconMap[selectedBadge.icon] || Award;
                                    return <Icon size={40} strokeWidth={2} />;
                                })()}
                            </div>

                            <h3 className="text-xl font-bold text-slate-800 mb-1">{selectedBadge.name}</h3>

                            <div className="mb-4">
                                {selectedBadge.conquistado ? (
                                    <span className="inline-block px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">
                                        Conquistado! 🏆
                                    </span>
                                ) : (
                                    <span className="inline-block px-3 py-1 bg-slate-100 text-slate-500 text-xs font-bold rounded-full">
                                        Bloqueado 🔒
                                    </span>
                                )}
                            </div>

                            <p className="text-slate-600 text-sm leading-relaxed mb-6">
                                {selectedBadge.description}
                            </p>

                            {selectedBadge.conquistado && selectedBadge.conquistado_em && (
                                <p className="text-[10px] text-slate-400">
                                    Data da conquista: {new Date(selectedBadge.conquistado_em).toLocaleDateString()}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
