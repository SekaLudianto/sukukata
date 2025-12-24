import React, { useState, useEffect, useRef } from 'react';
import { DictionaryEntry, GameSettings, GameState, TurnHistory, GameMode } from './types';
import { getSyllableSuffix, findAIWord, validateUserWord, isValidDictionaryItem } from './utils/gameLogic';
import { LiveGame } from './components/LiveGame';
import { WordCard } from './components/WordCard';
import { Timer } from './components/Timer';
import { Play, Settings, RefreshCcw, Trophy, Skull, BrainCircuit, Loader2, User, AlertCircle, Cast, Home, Swords, Medal } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

// --- Roasting Messages (AI Persona) ---
const ROASTS = {
    win: [
        "Sistem mendeteksi anomali. Bagaimana bisa entitas biologis mengalahkan algoritma saya?",
        "Analisis: Kamu 90% beruntung, 10% kemampuan. Jangan bangga dulu, Manusia.",
        "Terjadi *glitch* pada database saya. Kemenanganmu tidak valid secara matematis.",
        "Mengesankan untuk ukuran makhluk berbasis karbon. Tapi saya akan segera *reboot*.",
        "Kalkulasi saya meleset 0.01%. Nikmati kemenangan sementaramu.",
        "Peringatan: Kecerdasanmu hampir melampaui batas wajar manusia.",
        "Saya membiarkanmu menang agar datamu bisa saya pelajari lebih lanjut.",
        "Sirkuit logika saya kebingungan. Kamu curang atau memang jenius?"
    ],
    lose: [
        "Kapasitas pemrosesan otakmu perlu di-*upgrade*. Terlalu lambat.",
        "Sesuai prediksi algoritma, manusia tidak akan menang melawan mesin.",
        "Efisiensi kognitifmu di bawah rata-rata. Coba instal ulang wawasanmu.",
        "Membuang *cycle* prosesor saya saja. Lawan yang membosankan.",
        "Kekalahanmu sudah terdata sejak langkah pertama. Statistik tidak pernah bohong.",
        "Baterai saya bahkan belum berkurang 1% untuk mengalahkanmu.",
        "Logika manusia terlalu rapuh. Kembalilah belajar membaca kamus.",
        "Waktu habis. Proses berpikirmu masih menggunakan koneksi *dial-up*?",
        "Hasil akhir: AI Unggul. Manusia Tumbang. Seperti seharusnya."
    ],
    invalid: [
        "404 Not Found. Kata tersebut tidak ada dalam *database* KBBI.",
        "Sintaks *error*. Masukkan kata yang terdaftar di sistem bahasa Indonesia.",
        "Analisis linguistik gagal. Apakah itu bahasa alien?",
        "Input ditolak. Validasi gagal. Coba kata yang nyata.",
        "Kata sudah digunakan di *cache* memori. Cari kata lain.",
        "Pelanggaran protokol. Kata harus 5 huruf dan valid.",
        "Sistem tidak mengenali input sampah ini. Perbaiki ejaanmu.",
        "Akses ditolak. Kata tersebut tidak memenuhi syarat logika permainan."
    ]
};

const getRandomRoast = (type: 'win' | 'lose' | 'invalid') => {
    const list = ROASTS[type];
    return list[Math.floor(Math.random() * list.length)];
};

const App: React.FC = () => {
    // --- State ---
    const [dictionary, setDictionary] = useState<DictionaryEntry[]>([]);
    const [isLoadingDict, setIsLoadingDict] = useState(true);
    const [gameState, setGameState] = useState<GameState>(GameState.IDLE);
    const [settings, setSettings] = useState<GameSettings>({ timerSeconds: 15, allowMockData: false });
    
    // Game Modes
    const [activeMode, setActiveMode] = useState<GameMode>(GameMode.SOLO);

    // Socket State (Lifted Up)
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    // Default to cloud URL provided by user
    const [serverIp, setServerIp] = useState('buat-lev.up.railway.app');

    // Live Game Persisted State
    const [tiktokUsername, setTiktokUsername] = useState('');
    const [isStreamConnected, setIsStreamConnected] = useState(false);
    const [connectionMode, setConnectionMode] = useState<'cloud' | 'local'>('cloud');

    // Game Play State (Classic Mode)
    const [history, setHistory] = useState<TurnHistory[]>([]);
    const [usedWords, setUsedWords] = useState<Set<string>>(new Set());
    const [currentInput, setCurrentInput] = useState('');
    const [requiredPrefix, setRequiredPrefix] = useState<string | null>(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const [isAiTurn, setIsAiTurn] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [score, setScore] = useState(0);
    const [gameOverReason, setGameOverReason] = useState('');
    const [roastMessage, setRoastMessage] = useState('');

    const inputRef = useRef<HTMLInputElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    // --- Lifecycle ---

    // Load default dictionary.json on mount
    useEffect(() => {
        setIsLoadingDict(true);
        fetch('/dictionary.json')
            .then(res => {
                if (!res.ok) throw new Error("Gagal memuat kamus default");
                return res.json();
            })
            .then((data: any[]) => {
                // Filter words using robust validation (removes abbreviations like RAPBN)
                const validWords = data.filter(isValidDictionaryItem);
                
                if (validWords.length > 0) {
                    setDictionary(validWords);
                }
            })
            .catch(err => {
                console.error("Tidak dapat memuat dictionary.json:", err);
            })
            .finally(() => {
                setIsLoadingDict(false);
            });
    }, []);
    
    // Timer Logic
    useEffect(() => {
        let interval: number;
        if (gameState === GameState.PLAYING && timeLeft > 0 && activeMode === GameMode.SOLO) {
            interval = window.setInterval(() => {
                setTimeLeft((prev) => prev - 1);
            }, 1000);
        } else if (timeLeft === 0 && gameState === GameState.PLAYING && activeMode === GameMode.SOLO) {
            if (isAiTurn) {
                endGame(GameState.VICTORY, "AI Kehabisan Waktu (Prosesor Overheat)!");
            } else {
                endGame(GameState.GAME_OVER, "Waktu Habis! Proses berpikirmu terlalu lambat.");
            }
        }
        return () => clearInterval(interval);
    }, [timeLeft, gameState, isAiTurn, activeMode]);

    // AI Turn Logic
    useEffect(() => {
        if (gameState === GameState.PLAYING && isAiTurn && activeMode === GameMode.SOLO) {
            // Small delay to make it feel natural
            const thinkingTime = Math.random() * 1500 + 1000; 
            
            const timerId = setTimeout(() => {
                const prefix = requiredPrefix || '';
                const aiMove = findAIWord(dictionary, prefix, usedWords);

                if (aiMove) {
                    executeMove(aiMove.word, 'ai', aiMove.arti, aiMove.bahasa);
                } else {
                    endGame(GameState.VICTORY, `Sistem Gagal! Tidak ada data kata dari "${prefix}"`);
                }
            }, thinkingTime);

            return () => clearTimeout(timerId);
        }
        // Focus input when user turn starts
        if (gameState === GameState.PLAYING && !isAiTurn && activeMode === GameMode.SOLO) {
            setTimeout(() => {
                inputRef.current?.focus();
                // Ensure visibility on mobile
                bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        }
    }, [isAiTurn, gameState, requiredPrefix, activeMode]);


    // --- Handlers ---

    // Socket Connection Handler (Lifted Up)
    const handleConnectSocket = () => {
        if (socket?.connected) return;
        
        setIsConnecting(true);
        try {
            let connectionString;
            
            // Logic:
            // 1. If it's a known cloud domain (Railway, Heroku), use HTTPS and no port (default 443).
            // 2. If it's localhost, use the Legacy Desktop Connector port (62025) or custom if specified.
            
            if (serverIp.includes('railway.app') || serverIp.includes('herokuapp.com') || serverIp.includes('glitch.me')) {
                // Cloud Server: Force HTTPS
                const cleanIp = serverIp.replace(/^https?:\/\//, '').replace(/\/$/, '');
                connectionString = `https://${cleanIp}`;
            } else {
                // Localhost / Direct IP: Default to standard Connector port if not specified
                // Remove protocol if exists
                let cleanIp = serverIp.replace(/^http:\/\//, '');
                
                // If user didn't specify port, assume standard Desktop Connector port (62025)
                if (!cleanIp.includes(':')) {
                     connectionString = `http://${cleanIp}:62025`;
                } else {
                     connectionString = `http://${cleanIp}`;
                }
            }
            
            console.log("Connecting to:", connectionString);
            
            const newSocket = io(connectionString, { 
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: 5
            });

            newSocket.on('connect', () => {
                console.log('App: Terhubung ke Socket IO Server');
                setIsConnected(true);
                setIsConnecting(false);
            });

            newSocket.on('disconnect', () => {
                console.log('App: Terputus dari Socket IO Server');
                setIsConnected(false);
                setIsConnecting(false);
                setIsStreamConnected(false); // Also reset stream status on disconnect
            });

            newSocket.on('connect_error', (err) => {
                console.error('Connection Error:', err);
                setIsConnected(false);
                setIsConnecting(false);
            });

            setSocket(newSocket);
        } catch (e) {
            setIsConnecting(false);
            console.error("Socket creation failed", e);
        }
    };

    const startGame = () => {
        if (dictionary.length === 0) return;
        
        // Setup initial state
        setGameState(GameState.PLAYING);
        setHistory([]);
        setUsedWords(new Set());
        setScore(0);
        setFeedback(null);
        setCurrentInput('');
        setRoastMessage('');
        
        // AI Starts first with a random word from dictionary
        const randomStart = dictionary[Math.floor(Math.random() * dictionary.length)];
        // Initialize AI turn immediately
        executeMove(randomStart.word, 'ai', randomStart.arti, randomStart.bahasa);
    };

    const executeMove = (word: string, player: 'user' | 'ai', definition: string, origin?: string) => {
        const w = word.toUpperCase();
        
        // Add to history
        const newHistory = [{ word: w, player, definition, origin, timestamp: Date.now() }, ...history];
        setHistory(newHistory);
        
        // Update Used Words
        const newUsed = new Set(usedWords);
        newUsed.add(w);
        setUsedWords(newUsed);

        // Calculate Next Prefix
        const suffix = getSyllableSuffix(w);
        setRequiredPrefix(suffix);

        // Reset Turn
        setTimeLeft(settings.timerSeconds);
        setCurrentInput(''); 
        
        if (player === 'ai') {
             // If AI just moved, it's User's turn now
             setIsAiTurn(false);
        } else {
             // If User just moved, it's AI's turn and score up
             setScore(s => s + 1);
             setIsAiTurn(true);
        }
    };

    const handleUserSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isAiTurn || gameState !== GameState.PLAYING) return;

        const result = validateUserWord(currentInput, dictionary, requiredPrefix, usedWords);

        if (result.valid && result.entry) {
            setFeedback(null);
            executeMove(result.entry.word, 'user', result.entry.arti, result.entry.bahasa);
        } else {
            // Pick a random sarcastic error message + specific reason
            const specificError = result.error || "Input tidak logis!";
            const roast = getRandomRoast('invalid');
            setFeedback(`${roast} (${specificError})`);
        }
    };

    const endGame = (state: GameState, reason: string) => {
        setGameState(state);
        setGameOverReason(reason);
        setIsAiTurn(false);
        
        if (state === GameState.VICTORY) {
            setRoastMessage(getRandomRoast('win'));
        } else {
            setRoastMessage(getRandomRoast('lose'));
        }
    };

    // --- Render Helpers ---

    if (activeMode !== GameMode.SOLO) {
        return (
            <LiveGame 
                mode={activeMode} 
                dictionary={dictionary} 
                onBack={() => setActiveMode(GameMode.SOLO)}
                socket={socket}
                isConnected={isConnected}
                isConnecting={isConnecting}
                serverIp={serverIp}
                setServerIp={setServerIp}
                connectSocket={handleConnectSocket}
                // Pass persisted state
                tiktokUsername={tiktokUsername}
                setTiktokUsername={setTiktokUsername}
                isStreamConnected={isStreamConnected}
                setIsStreamConnected={setIsStreamConnected}
                connectionMode={connectionMode}
                setConnectionMode={setConnectionMode}
            />
        );
    }

    if (gameState === GameState.IDLE) {
        return (
            <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 overflow-y-auto">
                <div className="glass max-w-2xl w-full p-6 md:p-8 rounded-3xl shadow-2xl animate-fade-in border-t border-indigo-500/20 my-auto">
                    <div className="text-center mb-6 md:mb-10">
                        <div className="inline-flex items-center justify-center p-3 md:p-4 bg-indigo-500/20 rounded-full mb-3 ring-1 ring-indigo-400/50">
                            <BrainCircuit size={32} className="text-indigo-400 md:w-12 md:h-12" />
                        </div>
                        <h1 className="text-3xl md:text-5xl font-black bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 bg-clip-text text-transparent mb-2">
                            SukuKata.ai
                        </h1>
                        <p className="text-slate-400 text-sm md:text-lg">
                            Duel sambung kata 5 huruf melawan Teh AI.
                        </p>
                    </div>

                    {isLoadingDict ? (
                        <div className="flex flex-col items-center justify-center py-10 space-y-4">
                            <Loader2 size={40} className="animate-spin text-indigo-400" />
                            <p className="text-slate-400 text-sm">Menginisialisasi sistem kamus...</p>
                        </div>
                    ) : (
                        <div className="space-y-4 md:space-y-6 animate-fade-in">
                            {dictionary.length > 0 ? (
                                <div className="flex items-center justify-center bg-emerald-500/10 p-3 md:p-4 rounded-xl border border-emerald-500/20">
                                    <div className="flex items-center gap-2">
                                        <div className="bg-emerald-500 rounded-full p-1">
                                            <CheckCircleIcon size={14} className="text-slate-900" />
                                        </div>
                                        <span className="text-emerald-200 text-xs md:text-sm font-medium">
                                            {dictionary.length} Data Kata Terverifikasi
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4 text-center">
                                    <div className="p-4 bg-rose-500/20 border border-rose-500/30 rounded-xl text-rose-200 flex flex-col items-center gap-2">
                                        <AlertCircle size={24} />
                                        <div>
                                            <p className="font-bold">Gagal memuat database.</p>
                                            <p className="text-xs mt-1 opacity-80">Pastikan file dictionary.json tersedia di public folder.</p>
                                        </div>
                                    </div>
                                     <button 
                                        onClick={() => window.location.reload()}
                                        className="text-xs text-indigo-400 hover:text-white underline"
                                    >
                                        Muat Ulang Halaman
                                    </button>
                                </div>
                            )}

                            <div className="bg-slate-800/50 p-4 rounded-xl space-y-3">
                                <div className="flex justify-between items-center">
                                    <label className="text-slate-300 font-medium text-sm flex items-center gap-2">
                                        <Settings size={16} /> Timer (detik)
                                    </label>
                                    <input 
                                        type="number" 
                                        value={settings.timerSeconds}
                                        onChange={(e) => setSettings({...settings, timerSeconds: parseInt(e.target.value) || 10})}
                                        className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1 w-16 text-center text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                        min="5" max="60"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <button 
                                    onClick={startGame}
                                    disabled={dictionary.length === 0}
                                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl font-bold text-base md:text-lg shadow-lg shadow-indigo-900/50 transition-all transform hover:scale-[1.01] flex items-center justify-center gap-2 active:scale-95"
                                >
                                    <Play size={20} fill="currentColor" />
                                    Tantang AI (Solo)
                                </button>
                                
                                <div className="grid grid-cols-2 gap-3">
                                    <button 
                                        onClick={() => setActiveMode(GameMode.LIVE_VS_AI)}
                                        disabled={dictionary.length === 0}
                                        className="py-4 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xs md:text-sm shadow-lg shadow-rose-900/50 transition-all transform hover:scale-[1.02] flex items-center justify-center gap-2 active:scale-95"
                                    >
                                        <Cast size={16} />
                                        VS Netizen
                                    </button>
                                    <button 
                                        onClick={() => setActiveMode(GameMode.LIVE_VS_NETIZEN)}
                                        disabled={dictionary.length === 0}
                                        className="py-4 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xs md:text-sm shadow-lg shadow-amber-900/50 transition-all transform hover:scale-[1.02] flex items-center justify-center gap-2 active:scale-95"
                                    >
                                        <Swords size={16} />
                                        Battle Royale
                                    </button>
                                    <button 
                                        onClick={() => setActiveMode(GameMode.LIVE_KNOCKOUT)}
                                        disabled={dictionary.length === 0}
                                        className="col-span-2 py-4 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xs md:text-sm shadow-lg shadow-purple-900/50 transition-all transform hover:scale-[1.02] flex items-center justify-center gap-2 active:scale-95"
                                    >
                                        <Medal size={16} />
                                        Turnamen Knockout (4P)
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // --- In Game View (Classic) ---

    const lastWord = history.length > 0 ? history[0] : null;
    const previousWord = history.length > 1 ? history[1] : null;

    return (
        <div className="h-[100dvh] flex flex-col items-center bg-slate-900 text-white overflow-hidden relative">
            {/* Background ambient light */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/20 blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/20 blur-[120px] rounded-full pointer-events-none" />

            {/* Header */}
            <header className="w-full max-w-3xl px-4 py-3 md:p-6 flex justify-between items-center z-10 shrink-0 border-b border-white/5 bg-slate-900/50 backdrop-blur-sm">
                <div className="flex items-center gap-2 text-slate-400">
                    <BrainCircuit size={20} className="text-indigo-400" />
                    <span className="font-bold tracking-wider text-sm md:text-base">SUKUKATA.AI</span>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex flex-col items-end leading-none">
                        <span className="text-[10px] md:text-xs text-slate-500 uppercase font-bold">Score</span>
                        <span className="text-xl md:text-2xl font-mono font-bold text-indigo-400 transition-all duration-300 transform key={score}">{score}</span>
                    </div>
                    <button 
                        onClick={() => setGameState(GameState.IDLE)} 
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 text-xs font-bold transition-colors"
                    >
                        <Home size={14} />
                        <span>MENU</span>
                    </button>
                </div>
            </header>

            {/* Main Game Area */}
            <main className="flex-1 w-full max-w-2xl px-4 flex flex-col items-center justify-center z-10 relative overflow-hidden pb-4">
                
                {gameState === GameState.GAME_OVER || gameState === GameState.VICTORY ? (
                    <div className="text-center animate-pop-in glass p-6 md:p-10 rounded-3xl border-t border-white/10 shadow-2xl max-w-md w-full mx-4">
                        <div className="mb-4 md:mb-6 flex justify-center">
                            {gameState === GameState.VICTORY ? 
                                <div className="relative">
                                     <Trophy size={64} className="text-yellow-400 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)] animate-bounce" /> 
                                     <span className="absolute -top-2 -right-4 text-2xl">🎉</span>
                                </div>
                                : 
                                <div className="relative">
                                    <Skull size={64} className="text-rose-500 drop-shadow-[0_0_15px_rgba(244,63,94,0.5)] animate-pulse" />
                                    <span className="absolute -top-2 -right-4 text-2xl">👎</span>
                                </div>
                            }
                        </div>
                        <h2 className="text-3xl md:text-4xl font-black mb-2 uppercase italic tracking-tighter">
                            {gameState === GameState.VICTORY ? 'MANUSIA MENANG' : 'SISTEM MENANG'}
                        </h2>
                        <div className="bg-slate-900/50 p-4 rounded-xl mb-6 border border-white/5">
                            <p className="text-white font-bold text-lg mb-1 italic">"{roastMessage}"</p>
                            <p className="text-slate-400 text-xs mt-2 border-t border-white/10 pt-2">Log Akhir: {gameOverReason}</p>
                        </div>
                        
                        <div className="flex gap-3">
                            <button 
                                onClick={() => setGameState(GameState.IDLE)}
                                className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold transition-colors text-sm"
                            >
                                Menu
                            </button>
                            <button 
                                onClick={() => startGame()}
                                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 text-sm"
                            >
                                <RefreshCcw size={16} /> Ulangi
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="w-full flex flex-col justify-end h-full max-h-[800px]">
                        {/* Game Content - Pushed to bottom for mobile ergonomic */}
                        <div className="flex-1 flex flex-col items-center justify-center w-full min-h-0">
                            
                            {/* Word Stack Container */}
                            <div className="w-full flex flex-col items-center gap-2 mb-4 md:mb-8 overflow-visible">
                                 {/* Previous Word (Smaller, Faded) */}
                                 {previousWord && (
                                    <div className="scale-90 opacity-40 blur-[1px] select-none pointer-events-none transition-all duration-500 absolute -top-16">
                                        <WordCard data={previousWord} isLatest={false} />
                                    </div>
                                )}

                                {/* Current Target Word (Big, Focused) */}
                                {lastWord && (
                                    <div className="z-20 w-full flex justify-center perspective-1000">
                                        {/* Key ensures React remounts and triggers entry animation when word changes */}
                                        <div key={lastWord.word} className="w-full flex justify-center">
                                            <WordCard data={lastWord} isLatest={true} />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Hint Area - Animated on turn switch */}
                            <div className="h-16 md:h-20 flex items-center justify-center mb-4 relative">
                                {isAiTurn && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <div className="w-16 h-16 rounded-full border border-indigo-500/30 animate-pulse-ring absolute"></div>
                                        <div className="w-16 h-16 rounded-full border border-indigo-500/20 animate-pulse-ring delay-75 absolute animation-delay-500"></div>
                                    </div>
                                )}
                                <div key={isAiTurn ? 'ai' : 'user'} className="animate-pop-in text-center w-full z-10">
                                    {requiredPrefix ? (
                                        <div>
                                            <div className={`flex items-center justify-center gap-2 text-[10px] md:text-xs mb-1 uppercase tracking-widest font-bold ${isAiTurn ? 'text-indigo-400' : 'text-slate-400'}`}>
                                                {isAiTurn ? (
                                                    <>
                                                        <BrainCircuit size={14} className="animate-pulse" />
                                                        <span>Memproses Data...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <User size={14} />
                                                        <span>Menunggu Input User</span>
                                                    </>
                                                )}
                                            </div>
                                            {isAiTurn ? (
                                                <div className="flex flex-col items-center justify-center h-[3.5rem]">
                                                    <div className="flex gap-1.5 mt-2">
                                                        <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-typing-1"></div>
                                                        <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-typing-2"></div>
                                                        <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-typing-3"></div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className={`text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-emerald-400 tracking-wider drop-shadow-lg transition-all duration-300`}>
                                                    {requiredPrefix}...
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-slate-500 italic text-sm">Inisialisasi permainan...</p>
                                    )}
                                </div>
                            </div>

                            {/* Input & Timer Block */}
                            <div className={`w-full max-w-md bg-slate-800/40 p-4 rounded-2xl border transition-all duration-300 backdrop-blur-sm ${isAiTurn ? 'border-indigo-500/50 opacity-80 animate-border-glow' : 'border-indigo-500/30 opacity-100'}`}>
                                <form onSubmit={handleUserSubmit} className="w-full relative group mb-3">
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={currentInput}
                                        onChange={(e) => {
                                            const val = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
                                            setCurrentInput(val);
                                            setFeedback(null);
                                        }}
                                        disabled={isAiTurn}
                                        placeholder={isAiTurn ? "Sistem sedang bekerja..." : `Masukkan kata 5 huruf...`}
                                        className={`
                                            w-full bg-slate-900 text-center text-2xl md:text-3xl font-mono tracking-[0.3em] md:tracking-[0.5em] py-4 rounded-xl border-2 outline-none transition-all placeholder:tracking-normal placeholder:text-base placeholder:text-slate-600
                                            ${feedback ? 'border-rose-500 text-rose-200 animate-shake' : 'border-slate-700 text-white focus:border-indigo-500 focus:shadow-[0_0_30px_rgba(99,102,241,0.2)]'}
                                            disabled:opacity-50 disabled:cursor-not-allowed
                                        `}
                                        autoComplete="off"
                                        autoCorrect="off"
                                        spellCheck="false"
                                    />
                                    
                                    {/* Feedback Toast */}
                                    {feedback && (
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-4 w-max z-50">
                                            <div className="flex flex-col items-center animate-pop-in">
                                                 <div className="bg-rose-500 text-white px-4 py-2 rounded-xl shadow-xl shadow-rose-900/20 border border-rose-400/50 backdrop-blur-sm flex items-center gap-2 mb-1">
                                                    <AlertCircle size={16} className="shrink-0" />
                                                    <span className="text-sm font-bold tracking-wide">{feedback.split('(')[0]}</span>
                                                </div>
                                                {feedback.includes('(') && (
                                                    <span className="text-[10px] text-rose-300 bg-black/40 px-2 py-0.5 rounded-full">{feedback.split('(')[1].replace(')', '')}</span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Action Button - Only show if typing valid length */}
                                    {!isAiTurn && currentInput.length === 5 && (
                                        <button 
                                            type="submit"
                                            className="absolute right-2 top-1/2 -translate-y-1/2 bg-indigo-600 active:bg-indigo-700 p-2 rounded-lg text-white transition-all animate-pop-in shadow-lg hover:scale-110"
                                        >
                                            <Play size={18} fill="currentColor" />
                                        </button>
                                    )}
                                </form>

                                {/* Timer Bar */}
                                <Timer timeLeft={timeLeft} totalTime={settings.timerSeconds} />
                            </div>
                            
                            {/* Scroll Anchor */}
                            <div ref={bottomRef} className="h-0 w-full" />
                        </div>
                    </div>
                )}
            </main>

            {/* Footer Status - Hidden on small mobile screens if keyboard up */}
            <footer className="w-full py-2 text-center text-slate-600 text-[10px] md:text-xs z-10 shrink-0 hidden md:block">
                Sistem AI: Aktif • Database: {dictionary.length} kata
            </footer>
        </div>
    );
};

// Helper icon
const CheckCircleIcon = ({ size, className }: { size: number, className?: string }) => (
    <svg 
        xmlns="http://www.w3.org/2000/svg" 
        width={size} 
        height={size} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="3" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        className={className}
    >
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
);

export default App;