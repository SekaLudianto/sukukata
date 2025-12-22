import React from 'react';
import { TurnHistory } from '../types';
import { BookOpen, User, Bot } from 'lucide-react';
import { getSyllableSuffix } from '../utils/gameLogic';

interface WordCardProps {
    data: TurnHistory;
    isLatest: boolean;
}

export const WordCard: React.FC<WordCardProps> = ({ data, isLatest }) => {
    const isAi = data.player === 'ai';
    
    // Calculate split for visual
    const suffix = getSyllableSuffix(data.word);
    const stem = data.word.substring(0, data.word.length - suffix.length);

    return (
        <div className={`
            relative w-full max-w-sm md:max-w-md p-3 md:p-4 rounded-xl border transition-all duration-500
            ${isLatest ? 'scale-100 opacity-100 shadow-xl animate-slide-up-entry' : 'scale-95 opacity-50 hover:opacity-80'}
            ${isAi 
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-100' 
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-100'}
        `}>
            <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-1.5">
                    <span className={`p-1 rounded-full ${isAi ? 'bg-rose-500/20' : 'bg-emerald-500/20'}`}>
                        {isAi ? <Bot size={12} /> : <User size={12} />}
                    </span>
                    <span className="text-[10px] md:text-xs font-bold tracking-widest uppercase opacity-70">
                        {isAi ? 'AI' : 'Kamu'}
                    </span>
                </div>
                {isLatest && (
                    <span className="animate-pulse text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full border border-white/10">
                        BARU
                    </span>
                )}
            </div>
            
            <div className="text-2xl md:text-3xl font-black tracking-widest mb-1 font-mono text-center flex justify-center">
                <span className="opacity-70">{stem}</span>
                <span className={`${isAi ? 'text-rose-400' : 'text-emerald-400'} underline decoration-2 underline-offset-4`}>{suffix}</span>
            </div>
            
            <div className="flex items-start gap-1.5 text-xs opacity-90 italic border-t border-white/5 pt-2 mt-1">
                <BookOpen size={12} className="mt-0.5 shrink-0 opacity-50" />
                <p className="line-clamp-2 leading-tight">{data.definition}</p>
            </div>
        </div>
    );
};