import React from 'react';

interface ProgressBarProps {
  total: number;
  completed: number;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ total, completed }) => {
  const percentage = total > 0 ? Math.min(100, Math.max(0, (completed / total) * 100)) : 0;
  const isComplete = percentage === 100;

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1">
        <span>Progresso Diário</span>
        <span className={isComplete ? 'text-green-600' : 'text-orange-600'}>
          {Math.round(percentage)}%
        </span>
      </div>
      <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
        <div 
          className={`h-3 rounded-full transition-all duration-1000 ease-out ${
            isComplete ? 'bg-green-500' : 'bg-orange-500'
          }`}
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
      <div className="mt-1 text-xs text-slate-400 text-right">
        {completed}/{total} entregas
      </div>
    </div>
  );
};