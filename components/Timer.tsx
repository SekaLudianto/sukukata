import React, { useEffect } from 'react';

interface TimerProps {
    timeLeft: number;
    totalTime: number;
}

export const Timer: React.FC<TimerProps> = ({ timeLeft, totalTime }) => {
    const percentage = (timeLeft / totalTime) * 100;
    
    // Color states
    let colorClass = 'bg-emerald-500';
    if (percentage < 60) colorClass = 'bg-amber-500';
    if (percentage < 30) colorClass = 'bg-rose-500';

    return (
        <div className="w-full max-w-md mt-4">
            <div className="flex justify-between text-xs text-slate-400 mb-1 font-mono uppercase">
                <span>Waktu Jawab</span>
                <span>{timeLeft}s</span>
            </div>
            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                <div 
                    className={`h-full transition-all duration-1000 ease-linear ${colorClass}`} 
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
};