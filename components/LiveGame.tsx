import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DictionaryEntry, GameState, TurnHistory, IndoFinityMessage, LiveAttempt } from '../types';
import { getSyllableSuffix, findAIWord, validateUserWord } from '../utils/gameLogic';
import { WordCard } from './WordCard';
import { Timer } from './Timer';
import { Play, Power, MessageSquare, Users, Trophy, Skull, BrainCircuit, Wifi, WifiOff, Home, Loader2, Server, User, Globe } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

// --- Varied Roasts for Live Game ---
const LIVE_ROASTS = {
    win: [
        "Netizen +62 emang gak ada lawan! AI langsung kena mental.",
        "Gila! Kecepatan jempol kalian ngalahin prosesor AI.",
        "AI: 'Ampun bang jago!' Netizen menang telak.",
        "Definisi 'Kekuatan Rakyat' sesungguhnya. AI tak berkutik!",
        "GGWP Netizen! AI butuh upgrade otak nih.",
        "Kalian makan kamus ya? Pinter banget!",
        "AI-nya mau resign aja liat jago-jagonya kalian.",
        "Solid banget! Satu komando menghancurkan AI."
    ],
    lose: [
        "Yah, Netizen kalah... AI-nya ketawa jahat nih.",
        "Waduh, jempolnya pada kram ya? Kok kalah sama bot?",
        "AI: 'Ez game, ez life'. Ayo coba lagi dong!",
        "Malu dong sama kuota, masa kalah sama skrip komputer!",
        "Kekompakan kalian belum cukup buat ngalahin algoritma.",
        "Belajar lagi yuk! AI-nya ternyata lebih cerdas.",
        "Jangan mau kalah! Masa dijajah teknologi?",
        "Waktu habis! Kebanyakan mikir atau kebanyakan ngetik?"
    ]
};

const getRandomRoast = (type: 'win' | 'lose') => {
    const list = LIVE_ROASTS[type];
    return list[Math.floor(Math.random() * list.length)];
};

interface LiveGameProps {
    dictionary: DictionaryEntry[];
    onBack: () => void;
}

export const LiveGame: React.FC<LiveGameProps> = ({ dictionary, onBack }) => {
    // Game State
    const [gameState, setGameState] = useState<GameState>(GameState.IDLE);
    const [history, setHistory] = useState<TurnHistory[]>([]);
    const [usedWords, setUsedWords] = useState<Set<string>>(new Set());
    const [requiredPrefix, setRequiredPrefix] = useState<string | null>(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const [isAiTurn, setIsAiTurn] = useState(false);
    
    // Scores
    const [aiScore, setAiScore] = useState(0);
    const [chatScore, setChatScore] = useState(0);

    // Live Specific State
    const [serverIp, setServerIp] = useState('localhost'); // New state for IP
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false); // New state for loading
    const [liveAttempts, setLiveAttempts] = useState<LiveAttempt[]>([]);
    const [lastWinner, setLastWinner] = useState<{name: string, word: string} | null>(null);
    const [gameOverReason, setGameOverReason] = useState('');
    const [roastMessage, setRoastMessage] = useState('');
    
    // Use 'any' to avoid strict type issues with socket.io-client in this environment, 
    // though conceptually it is Socket
    const socketRef = useRef<any>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // --- State Refs to solve Stale Closures ---
    const stateRef = useRef({
        gameState,
        isAiTurn,
        requiredPrefix,
        usedWords,
        dictionary,
        history
    });

    useEffect(() => {
        stateRef.current = { gameState, isAiTurn, requiredPrefix, usedWords, dictionary, history };
    }, [gameState, isAiTurn, requiredPrefix, usedWords, dictionary, history]);

    // --- Handlers ---

    const executeMove = useCallback((word: string, player: 'chat' | 'ai', definition: string, winnerName?: string, winnerProfilePic?: string) => {
        const w = word.toUpperCase();
        
        setHistory(prev => [{ word: w, player, definition, timestamp: Date.now(), winnerName, winnerProfilePic }, ...prev]);
        
        setUsedWords(prev => {
            const newSet = new Set(prev);
            newSet.add(w);
            return newSet;
        });

        const suffix = getSyllableSuffix(w);
        setRequiredPrefix(suffix);

        // Timer setting (give chat more time than usual mode)
        setTimeLeft(player === 'ai' ? 30 : 15); 
        
        if (player === 'ai') {
             setIsAiTurn(false);
             // AI only gets points for responses, not the starting word
             if (stateRef.current.history.length > 0) {
                setAiScore(s => s + 1);
             }
        } else {
             setChatScore(s => s + 1);
             setIsAiTurn(true);
        }
    }, []);

    const endGame = useCallback((state: GameState, reason: string) => {
        setGameState(state);
        setGameOverReason(reason);
        setIsAiTurn(false);
        
        if (state === GameState.VICTORY) {
            setRoastMessage(getRandomRoast('win'));
        } else {
            setRoastMessage(getRandomRoast('lose'));
        }
    }, []);

    // --- Socket.IO Connection ---
    const connectSocket = useCallback(() => {
        if (socketRef.current?.connected) return;
        
        setIsConnecting(true); 

        try {
            // Socket IO Endpoint according to documentation (and manual input)
            // Default port is 62025
            const connectionString = `http://${serverIp}:62025`;
            console.log("Connecting to:", connectionString);

            const socket = io(connectionString, {
                transports: ['websocket', 'polling']
            });

            socket.on('connect', () => {
                console.log('Terhubung ke IndoFinity Socket IO');
                setIsConnected(true);
                setIsConnecting(false);
            });

            socket.on('message', (rawData: any) => {
                try {
                    // Handle potential string data (parsing safety)
                    let message = rawData;
                    if (typeof rawData === 'string') {
                        try {
                            message = JSON.parse(rawData);
                        } catch (e) {
                            console.warn("Received non-JSON string message", rawData);
                            return;
                        }
                    }

                    // Destructure expected format: { event: "chat", data: { ... } }
                    const { event, data: eventData } = message;

                    if (event === 'chat' && eventData) {
                        const current = stateRef.current;
                        
                        const username = eventData.uniqueId;
                        const nickname = eventData.nickname || username;
                        const profilePic = eventData.profilePictureUrl;
                        const comment = eventData.comment || '';

                        // Clean input
                        const cleanWord = comment.toUpperCase().replace(/[^A-Z]/g, '').trim();
                        
                        // Skip empty comments but allow incorrect lengths to show up as errors
                        if (!cleanWord) return;

                        // Validation Logic
                        let isValid = false;
                        let reason = '';
                        let entry: DictionaryEntry | undefined;

                        if (current.gameState !== GameState.PLAYING) {
                            reason = "Game belum mulai";
                        } else if (current.isAiTurn) {
                            reason = "Giliran AI";
                        } else if (cleanWord.length !== 5) {
                            reason = "Harus 5 huruf";
                        } else {
                             // Only strictly validate word logic if it's actually the player's turn
                             const result = validateUserWord(cleanWord, current.dictionary, current.requiredPrefix, current.usedWords);
                             isValid = result.valid;
                             reason = result.error || '';
                             entry = result.entry;
                        }
                        
                        const attempt: LiveAttempt = {
                            uniqueId: username,
                            nickname: nickname,
                            profilePictureUrl: profilePic,
                            word: cleanWord,
                            isValid: isValid,
                            reason: reason,
                            timestamp: Date.now()
                        };

                        // Add to live feed (keep last 20)
                        setLiveAttempts(prev => [...prev.slice(-19), attempt]);

                        // Only execute move if VALID and GAME IS PLAYING and IT IS CHAT TURN
                        if (isValid && entry && current.gameState === GameState.PLAYING && !current.isAiTurn) {
                            setLastWinner({ name: nickname, word: cleanWord });
                            executeMove(entry.word, 'chat', entry.arti, nickname, profilePic);
                        }
                    }
                } catch (e) {
                    console.error("Error processing socket message", e);
                }
            });

            socket.on('disconnect', () => {
                setIsConnected(false);
                setIsConnecting(false);
            });

            socket.on('connect_error', (err: any) => {
                console.error("Socket Connection Error", err);
                setIsConnected(false);
                setIsConnecting(false);
                alert(`Gagal konek ke ${serverIp}:62025. Cek IP/koneksi.`);
            });

            socketRef.current = socket;
        } catch (e) {
            console.error("Socket Init Failed", e);
            setIsConnecting(false);
        }
    }, [executeMove, serverIp]); 

    // Clean up on unmount
    useEffect(() => {
        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, []);

    // Scroll chat to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [liveAttempts]);

    // --- Game Logic ---

    // Timer
    useEffect(() => {
        let interval: number;
        if (gameState === GameState.PLAYING && timeLeft > 0) {
            interval = window.setInterval(() => {
                setTimeLeft((prev) => prev - 1);
            }, 1000);
        } else if (timeLeft === 0 && gameState === GameState.PLAYING) {
            if (isAiTurn) {
                endGame(GameState.VICTORY, "AI Kehabisan Waktu! Netizen Menang!");
            } else {
                endGame(GameState.GAME_OVER, "Waktu Habis! Netizen Gagal Menjawab!");
            }
        }
        return () => clearInterval(interval);
    }, [timeLeft, gameState, isAiTurn, endGame]);

    // AI Turn
    useEffect(() => {
        if (gameState === GameState.PLAYING && isAiTurn) {
            const thinkingTime = Math.random() * 2000 + 1500; 
            
            const timerId = setTimeout(() => {
                const prefix = requiredPrefix || '';
                const aiMove = findAIWord(dictionary, prefix, usedWords);

                if (aiMove) {
                    executeMove(aiMove.word, 'ai', aiMove.arti);
                } else {
                    endGame(GameState.VICTORY, `AI Nyerah! Netizen terlalu jago!`);
                }
            }, thinkingTime);

            return () => clearTimeout(timerId);
        }
    }, [isAiTurn, gameState, requiredPrefix, dictionary, usedWords, executeMove, endGame]);

    // --- Start Handler ---

    const startGame = () => {
        if (!isConnected) return;
        setGameState(GameState.PLAYING);
        setHistory([]);
        setUsedWords(new Set());
        setAiScore(0);
        setChatScore(0);
        setLastWinner(null);
        setLiveAttempts([]);
        setRoastMessage('');
        
        const randomStart = dictionary[Math.floor(Math.random() * dictionary.length)];
        executeMove(randomStart.word, 'ai', randomStart.arti);
    };

    // --- Render ---

    const lastWord = history.length > 0 ? history[0] : null;
    const previousWord = history.length > 1 ? history[1] : null;

    return (
        <div className="h-[100dvh] flex flex-col bg-slate-900 text-white overflow-hidden font-mono">
            {/* Top Bar for Stream Info */}
            <div className="bg-indigo-900/50 border-b border-indigo-500/30 p-2 flex justify-between items-center z-20 shrink-0">
                <div className="flex items-center gap-2">
                    <button onClick={onBack} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-3 py-1 rounded text-xs font-bold uppercase tracking-wider text-slate-300 transition-colors">
                        <Home size={14} />
                        <span>MENU</span>
                    </button>
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${isConnected ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-rose-500/10 border-rose-500/30'}`}>
                        {isConnecting ? (
                            <Loader2 size={14} className="text-yellow-400 animate-spin" />
                        ) : isConnected ? (
                            <Wifi size={14} className="text-emerald-400" />
                        ) : (
                            <WifiOff size={14} className="text-rose-500" />
                        )}
                        <span className={`text-[10px] font-bold ${isConnected ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isConnecting ? "CONNECTING..." : (isConnected ? "CONNECTED" : "DISCONNECTED")}
                        </span>
                    </div>
                </div>
                <div className="text-xs text-indigo-300 font-bold tracking-widest hidden md:block">
                    MODE: VS NETIZEN
                </div>
            </div>

            <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden relative">
                {/* Background Effects */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/40 via-slate-900 to-black z-0" />

                {/* Left Panel: Game Arena */}
                <div className="flex-1 flex flex-col items-center justify-center relative z-10 p-4 overflow-y-auto scrollbar-hide">
                    
                    {/* Score Board */}
                    <div className="absolute top-4 w-full px-4 flex justify-between max-w-2xl z-20 pointer-events-none">
                        <div className="flex flex-col items-center">
                            <span className="text-4xl font-black text-rose-400 drop-shadow-[0_0_10px_rgba(244,63,94,0.5)]">{aiScore}</span>
                            <span className="text-xs font-bold bg-rose-500/20 px-2 py-0.5 rounded text-rose-200">AI BOT</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-4xl font-black text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]">{chatScore}</span>
                            <span className="text-xs font-bold bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-200">NETIZEN</span>
                        </div>
                    </div>

                    {/* Game State Displays */}
                    {gameState === GameState.IDLE ? (
                        <div className="text-center space-y-6 animate-pop-in relative z-20">
                            <div className="w-24 h-24 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-indigo-500/50">
                                <Users size={48} className="text-indigo-400" />
                            </div>
                            <h1 className="text-4xl md:text-6xl font-black bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400">
                                VS NETIZEN
                            </h1>
                            
                            {!isConnected ? (
                                <div className="flex flex-col items-center gap-4 w-full max-w-sm mx-auto">
                                    <p className="text-slate-400 text-sm">
                                        Sambungkan ke server TikTok Live (IndoFinity) untuk mulai.
                                    </p>
                                    
                                    {/* IP Input */}
                                    <div className="w-full bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider flex items-center gap-1">
                                                <Globe size={10} /> IP Server IndoFinity
                                            </label>
                                            <span className="text-[10px] text-slate-500 font-mono">:62025</span>
                                        </div>
                                        <input 
                                            type="text" 
                                            value={serverIp}
                                            onChange={(e) => setServerIp(e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-center focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-600"
                                            placeholder="localhost"
                                        />
                                        <p className="text-[10px] text-slate-500 mt-1 italic text-center">
                                            *Gunakan IP PC (misal: 192.168.1.5) jika main di HP
                                        </p>
                                    </div>

                                    <button 
                                        onClick={connectSocket}
                                        disabled={isConnecting}
                                        className={`w-full px-8 py-4 rounded-xl font-bold text-xl shadow-lg transition-all transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3 ${isConnecting ? 'bg-slate-600 text-slate-300 cursor-wait' : 'bg-sky-600 hover:bg-sky-500 text-white shadow-sky-900/50'}`}
                                    >
                                        {isConnecting ? <Loader2 className="animate-spin" /> : <Server />} 
                                        {isConnecting ? 'MENGHUBUNGKAN...' : 'SAMBUNGKAN'}
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-6 animate-fade-in">
                                    <div className="bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-lg inline-flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-emerald-400 font-bold text-sm">Server Terhubung ({serverIp})</span>
                                    </div>
                                    <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700 max-w-sm mx-auto text-sm text-left space-y-2">
                                        <div className="flex gap-2">
                                            <span className="text-indigo-400 font-bold">1.</span>
                                            <span>AI memberi kata awal.</span>
                                        </div>
                                        <div className="flex gap-2">
                                            <span className="text-indigo-400 font-bold">2.</span>
                                            <span>Netizen ketik kata 5 huruf di komentar.</span>
                                        </div>
                                        <div className="flex gap-2">
                                            <span className="text-indigo-400 font-bold">3.</span>
                                            <span>Jawaban tercepat & benar dapat poin!</span>
                                        </div>
                                    </div>

                                    <button 
                                        onClick={startGame}
                                        className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xl shadow-lg shadow-emerald-900/50 transition-all transform hover:scale-105 active:scale-95 flex items-center gap-3 mx-auto"
                                    >
                                        <Play fill="currentColor" /> MULAI GAME
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : gameState === GameState.PLAYING ? (
                        <div className="w-full max-w-xl flex flex-col items-center">
                            {/* Word Cards */}
                            <div className="w-full flex flex-col items-center gap-4 mb-8 h-[200px] justify-end">
                                {previousWord && (
                                    <div className="scale-75 opacity-50 absolute top-20 blur-[1px] transition-all duration-500">
                                        <WordCard data={previousWord} isLatest={false} />
                                    </div>
                                )}
                                {lastWord && (
                                    <div className="z-20 w-full flex justify-center animate-slide-up-entry">
                                        <div className="relative">
                                            <WordCard data={lastWord} isLatest={true} />
                                            {lastWord.player === 'chat' && lastWord.winnerName && (
                                                 <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-xs font-bold px-1.5 py-1 rounded-full shadow-lg whitespace-nowrap animate-pop-in flex items-center gap-2 pr-3">
                                                    {lastWord.winnerProfilePic ? (
                                                        <img src={lastWord.winnerProfilePic} alt={lastWord.winnerName} className="w-5 h-5 rounded-full border border-white/30" />
                                                    ) : (
                                                        <div className="w-5 h-5 rounded-full bg-black/20 flex items-center justify-center">
                                                            <User size={10} />
                                                        </div>
                                                    )}
                                                    <span className="flex items-center gap-1">
                                                        <Trophy size={12} className="text-yellow-300" /> 
                                                        {lastWord.winnerName}
                                                    </span>
                                                 </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Target & Timer */}
                            <div className="w-full text-center space-y-4">
                                <div className="text-sm uppercase tracking-[0.3em] text-slate-500 font-bold">
                                    {isAiTurn ? "Giliran AI" : "Giliran Netizen"}
                                </div>
                                
                                {requiredPrefix && (
                                    <div className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-emerald-400 drop-shadow-2xl">
                                        {requiredPrefix}...
                                    </div>
                                )}

                                <div className="w-full max-w-md mx-auto">
                                    <Timer timeLeft={timeLeft} totalTime={isAiTurn ? 30 : 15} />
                                </div>
                                
                                {!isAiTurn && (
                                    <div className="animate-pulse text-indigo-300 text-sm font-bold mt-4">
                                        Ketik di komentar sekarang!
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        // Game Over / Result
                        <div className="text-center animate-pop-in glass p-8 rounded-3xl max-w-md mx-auto border border-white/10 relative z-30">
                            <div className="mb-4 flex justify-center">
                                {gameState === GameState.VICTORY ? 
                                    <Trophy size={80} className="text-yellow-400 animate-bounce" /> : 
                                    <Skull size={80} className="text-rose-500 animate-pulse" />
                                }
                            </div>
                            <h2 className="text-4xl font-black mb-4 uppercase">
                                {gameState === GameState.VICTORY ? 'NETIZEN MENANG!' : 'AI MENANG!'}
                            </h2>
                            <div className="bg-black/30 p-4 rounded-xl mb-6 border border-white/5">
                                <p className="text-white font-bold text-lg mb-1 italic">"{roastMessage}"</p>
                                <p className="text-slate-400 text-xs mt-2 border-t border-white/10 pt-2">{gameOverReason}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4 mb-8">
                                <div className="bg-slate-800 p-4 rounded-xl">
                                    <div className="text-xs text-slate-500 uppercase">Skor AI</div>
                                    <div className="text-3xl font-black text-white">{aiScore}</div>
                                </div>
                                <div className="bg-slate-800 p-4 rounded-xl">
                                    <div className="text-xs text-slate-500 uppercase">Skor Netizen</div>
                                    <div className="text-3xl font-black text-white">{chatScore}</div>
                                </div>
                            </div>
                            <button 
                                onClick={startGame}
                                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold text-lg transition-colors shadow-lg"
                            >
                                MAIN LAGI
                            </button>
                        </div>
                    )}
                </div>

                {/* Right Panel: Live Feed (Desktop) or Bottom (Mobile) */}
                <div className="w-full md:w-80 border-l border-white/5 bg-black/20 backdrop-blur-md flex flex-col z-20 h-[30vh] md:h-auto border-t md:border-t-0 shrink-0">
                    <div className="p-3 bg-slate-900/80 border-b border-white/5 flex items-center justify-between">
                        <span className="font-bold text-xs uppercase tracking-wider flex items-center gap-2">
                            <MessageSquare size={14} /> Live Responses
                        </span>
                        <span className="text-[10px] bg-slate-700 px-2 py-0.5 rounded text-slate-300">
                            io:2025
                        </span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2 no-scrollbar" ref={scrollRef}>
                        {liveAttempts.length === 0 && (
                            <div className="text-center text-slate-600 text-xs italic mt-10">
                                {isConnected ? "Menunggu komentar..." : "Server belum terhubung"}
                            </div>
                        )}
                        {liveAttempts.map((attempt, idx) => (
                            <div key={`${attempt.uniqueId}-${idx}`} className={`text-xs p-2 rounded-lg border ${attempt.isValid ? 'bg-emerald-500/20 border-emerald-500/50' : 'bg-rose-500/10 border-rose-500/20'} animate-slide-up-entry`}>
                                <div className="flex justify-between items-start mb-1">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        {attempt.profilePictureUrl ? (
                                            <img src={attempt.profilePictureUrl} alt={attempt.nickname} className="w-6 h-6 rounded-full border border-white/10 shrink-0" />
                                        ) : (
                                            <div className="w-6 h-6 rounded-full bg-slate-700 border border-white/10 flex items-center justify-center shrink-0">
                                                <User size={12} className="text-slate-400" />
                                            </div>
                                        )}
                                        <span className="font-bold text-slate-200 truncate">{attempt.nickname || attempt.uniqueId}</span>
                                    </div>
                                    <span className="text-[10px] opacity-50 shrink-0">{new Date(attempt.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}</span>
                                </div>
                                <div className="flex items-center gap-2 mt-1 pl-8">
                                    <span className={`font-mono text-sm ${attempt.isValid ? 'text-emerald-300 font-bold' : 'text-rose-300'}`}>
                                        {attempt.word}
                                    </span>
                                    {!attempt.isValid && (
                                        <span className="text-[10px] text-rose-400 bg-rose-950/30 px-1.5 py-0.5 rounded">
                                            {attempt.reason}
                                        </span>
                                    )}
                                    {attempt.isValid && (
                                        <span className="text-[10px] text-emerald-400 bg-emerald-950/30 px-1.5 py-0.5 rounded font-bold uppercase">
                                            Valid
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};