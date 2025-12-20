import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DictionaryEntry, GameState, TurnHistory, LiveAttempt, GameMode, LeaderboardEntry, KnockoutPlayer, KnockoutMatch } from '../types';
import { getSyllableSuffix, findAIWord, validateUserWord } from '../utils/gameLogic';
import { WordCard } from './WordCard';
import { Timer } from './Timer';
import { Play, Power, MessageSquare, Users, Trophy, Skull, BrainCircuit, Wifi, WifiOff, Home, Loader2, Server, User, Globe, Swords, Zap, Crown, Medal, UserPlus, PlayCircle, ArrowRightLeft, Clock } from 'lucide-react';
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
    mode: GameMode;
}

export const LiveGame: React.FC<LiveGameProps> = ({ dictionary, onBack, mode }) => {
    // Game State
    const [gameState, setGameState] = useState<GameState>(GameState.IDLE);
    const [history, setHistory] = useState<TurnHistory[]>([]);
    const [usedWords, setUsedWords] = useState<Set<string>>(new Set());
    const [requiredPrefix, setRequiredPrefix] = useState<string | null>(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const [isAiTurn, setIsAiTurn] = useState(false);
    
    // Scores & Leaderboard (Modes other than Knockout)
    const [aiScore, setAiScore] = useState(0);
    const [chatScore, setChatScore] = useState(0);
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

    // Live Specific State
    const [serverIp, setServerIp] = useState('localhost');
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [liveAttempts, setLiveAttempts] = useState<LiveAttempt[]>([]);
    const [lastWinner, setLastWinner] = useState<{name: string, word: string} | null>(null);
    const [gameOverReason, setGameOverReason] = useState('');
    const [roastMessage, setRoastMessage] = useState('');
    
    // Knockout Specific State
    const [knockoutPlayers, setKnockoutPlayers] = useState<KnockoutPlayer[]>([]);
    const [lobbyPlayers, setLobbyPlayers] = useState<KnockoutPlayer[]>([]);
    const [pastPlayerIds, setPastPlayerIds] = useState<Set<string>>(new Set());
    
    const [matches, setMatches] = useState<KnockoutMatch[]>([]);
    const [activeMatchIndex, setActiveMatchIndex] = useState<number | null>(null);
    const [knockoutChampion, setKnockoutChampion] = useState<KnockoutPlayer | null>(null);
    const [knockoutPhase, setKnockoutPhase] = useState<'LOBBY' | 'BRACKET' | 'FINISHED'>('LOBBY');
    const [currentTurnPlayerId, setCurrentTurnPlayerId] = useState<string | null>(null); // Who's turn is it?

    const socketRef = useRef<any>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // --- State Refs to solve Stale Closures ---
    const stateRef = useRef({
        gameState,
        isAiTurn,
        requiredPrefix,
        usedWords,
        dictionary,
        history,
        mode,
        leaderboard,
        knockoutPhase,
        activeMatchIndex,
        matches,
        lobbyPlayers,
        pastPlayerIds,
        currentTurnPlayerId
    });

    useEffect(() => {
        stateRef.current = { 
            gameState, isAiTurn, requiredPrefix, usedWords, dictionary, history, mode, leaderboard,
            knockoutPhase, activeMatchIndex, matches, lobbyPlayers, pastPlayerIds, currentTurnPlayerId
        };
    }, [gameState, isAiTurn, requiredPrefix, usedWords, dictionary, history, mode, leaderboard, knockoutPhase, activeMatchIndex, matches, lobbyPlayers, pastPlayerIds, currentTurnPlayerId]);

    // --- Logic: Knockout Tournament ---
    
    const initKnockout = () => {
        setKnockoutPhase('LOBBY');
        setLobbyPlayers([]);
        setKnockoutPlayers([]);
        setMatches([]);
        setKnockoutChampion(null);
        setHistory([]);
        setCurrentTurnPlayerId(null);
    };

    const startKnockoutTournament = () => {
        if (lobbyPlayers.length < 8) {
            alert("Butuh minimal 8 pemain untuk turnamen!");
            return;
        }

        // 1. Pick 8 random players
        const shuffled = [...lobbyPlayers].sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, 8);
        setKnockoutPlayers(selected);

        // 2. Mark them as 'played' so they can't join next session
        setPastPlayerIds(prev => {
            const newSet = new Set(prev);
            selected.forEach(p => newSet.add(p.uniqueId));
            return newSet;
        });

        // 3. Create Bracket Structure
        const initialMatches: KnockoutMatch[] = [
            // Quarter Finals (Left Side)
            { id: 0, p1: selected[0], p2: selected[1], winner: null, nextMatchId: 4 },
            { id: 1, p1: selected[2], p2: selected[3], winner: null, nextMatchId: 4 },
            // Quarter Finals (Right Side)
            { id: 2, p1: selected[4], p2: selected[5], winner: null, nextMatchId: 5 },
            { id: 3, p1: selected[6], p2: selected[7], winner: null, nextMatchId: 5 },
            // Semi Finals
            { id: 4, p1: null, p2: null, winner: null, nextMatchId: 6 },
            { id: 5, p1: null, p2: null, winner: null, nextMatchId: 6 },
            // Final
            { id: 6, p1: null, p2: null, winner: null, nextMatchId: null }
        ];

        setMatches(initialMatches);
        setKnockoutPhase('BRACKET');
        setActiveMatchIndex(0);
        
        // Start first match
        startMatch(0, initialMatches);
    };

    const startMatch = (matchIdx: number, currentMatches?: KnockoutMatch[]) => {
        setGameState(GameState.PLAYING);
        setHistory([]);
        setUsedWords(new Set());
        setRequiredPrefix(null);
        setActiveMatchIndex(matchIdx);
        
        const matchList = currentMatches || matches;
        const match = matchList[matchIdx];

        if (match.p1 && match.p2) {
            // Randomly decide who starts
            const starter = Math.random() > 0.5 ? match.p1 : match.p2;
            setCurrentTurnPlayerId(starter.uniqueId);

            // AI gives initial word to start the duel
            const randomStart = dictionary[Math.floor(Math.random() * dictionary.length)];
            executeMove(randomStart.word, 'ai', randomStart.arti);
        } else {
             // Should not happen if logic is correct, but safe fallback
             console.error("Match started without players");
        }
    };

    const advanceKnockout = (winner: KnockoutPlayer) => {
        const currentIdx = stateRef.current.activeMatchIndex;
        if (currentIdx === null) return;
        
        const currentMatches = [...stateRef.current.matches];
        const currentMatch = currentMatches[currentIdx];

        // Set winner for current match
        currentMatch.winner = winner;

        // If there is a next match, place winner there
        if (currentMatch.nextMatchId !== null) {
            const nextMatch = currentMatches[currentMatch.nextMatchId];
            if (!nextMatch.p1) nextMatch.p1 = winner;
            else nextMatch.p2 = winner;
            
            setMatches(currentMatches);
            
            // Determine next match to play
            // Simple logic: 0->1->2->3 (QFs) -> 4->5 (SFs) -> 6 (Final)
            const nextIdx = currentIdx + 1;
            
            if (nextIdx < currentMatches.length) {
                // Small delay before next match
                setGameState(GameState.IDLE); // Temporary pause
                setTimeout(() => startMatch(nextIdx, currentMatches), 3000);
            }
        } else {
            // This was the final match (Match 6)
            setMatches(currentMatches);
            setKnockoutChampion(winner);
            setKnockoutPhase('FINISHED');
            endGame(GameState.VICTORY, `JUARA TURNAMEN: ${winner.nickname}`);
        }
    };

    // --- Simulation Tools ---
    const simulateJoin = () => {
        const fakeNames = ["Budi", "Siti", "Agus", "Dewi", "Eko", "Fajar", "Gita", "Hadi", "Indah", "Joko"];
        const randName = fakeNames[Math.floor(Math.random() * fakeNames.length)] + Math.floor(Math.random()*100);
        const uniqueId = randName.toLowerCase().replace(/\s/g, '');
        
        // Inject into logic manually
        const current = stateRef.current;
        if (current.knockoutPhase === 'LOBBY') {
             if (current.pastPlayerIds.has(uniqueId)) return;
             setLobbyPlayers(prev => {
                if (prev.find(p => p.uniqueId === uniqueId)) return prev;
                return [...prev, { uniqueId: uniqueId, nickname: randName, profilePictureUrl: undefined }];
            });
        }
    };

    const simulateCorrectAnswer = () => {
        const current = stateRef.current;
        if (current.mode === GameMode.LIVE_KNOCKOUT && current.knockoutPhase === 'BRACKET' && current.activeMatchIndex !== null) {
            const match = current.matches[current.activeMatchIndex];
            const currentTurnId = current.currentTurnPlayerId;
            
            if (match.p1 && match.p2 && currentTurnId) {
                // Find the player object
                const player = match.p1.uniqueId === currentTurnId ? match.p1 : match.p2;
                
                // Find a valid word starting with prefix
                const prefix = current.requiredPrefix || '';
                const word = findAIWord(current.dictionary, prefix, current.usedWords);
                
                if (word) {
                    executeMove(word.word, 'chat', word.arti, player.nickname, player.profilePictureUrl, player.uniqueId);
                }
            }
        }
    };


    // --- General Game Handlers ---

    const executeMove = useCallback((word: string, player: 'chat' | 'ai', definition: string, winnerName?: string, winnerProfilePic?: string, winnerId?: string) => {
        const w = word.toUpperCase();
        
        setHistory(prev => [{ word: w, player, definition, timestamp: Date.now(), winnerName, winnerProfilePic }, ...prev]);
        
        setUsedWords(prev => {
            const newSet = new Set(prev);
            newSet.add(w);
            return newSet;
        });

        const suffix = getSyllableSuffix(w);
        setRequiredPrefix(suffix);

        const currentMode = stateRef.current.mode;
        const phase = stateRef.current.knockoutPhase;

        // Timer setting
        if (currentMode === GameMode.LIVE_KNOCKOUT) {
             setTimeLeft(10); // Fast pace for duel
        } else if (currentMode === GameMode.LIVE_VS_NETIZEN) {
             setTimeLeft(20); 
        } else {
             setTimeLeft(player === 'ai' ? 30 : 15); 
        }
        
        if (player === 'ai') {
             setIsAiTurn(false);
             if (stateRef.current.history.length > 0 && currentMode === GameMode.LIVE_VS_AI) {
                setAiScore(s => s + 1);
             }
        } else {
             // Chat move logic based on mode
             if (currentMode === GameMode.LIVE_VS_AI) {
                setChatScore(s => s + 1);
                setIsAiTurn(true);
             } else if (currentMode === GameMode.LIVE_VS_NETIZEN && winnerId && winnerName) {
                // Battle Royale Leaderboard Logic
                setLeaderboard(prev => {
                    const existingIdx = prev.findIndex(p => p.uniqueId === winnerId);
                    let newBoard = [...prev];
                    if (existingIdx >= 0) {
                        newBoard[existingIdx] = {
                            ...newBoard[existingIdx],
                            score: newBoard[existingIdx].score + 1,
                            nickname: winnerName,
                            profilePictureUrl: winnerProfilePic
                        };
                    } else {
                        newBoard.push({
                            uniqueId: winnerId,
                            nickname: winnerName,
                            profilePictureUrl: winnerProfilePic,
                            score: 1
                        });
                    }
                    return newBoard.sort((a, b) => b.score - a.score).slice(0, 5);
                });
                setIsAiTurn(false); 
             } else if (currentMode === GameMode.LIVE_KNOCKOUT && phase === 'BRACKET') {
                 // Knockout Logic: Turn Switching
                 const matchIdx = stateRef.current.activeMatchIndex;
                 if (matchIdx !== null) {
                     const match = stateRef.current.matches[matchIdx];
                     // If current player answered, switch to opponent
                     if (match.p1 && match.p2) {
                        const nextPlayerId = winnerId === match.p1.uniqueId ? match.p2.uniqueId : match.p1.uniqueId;
                        setCurrentTurnPlayerId(nextPlayerId);
                     }
                 }
             }
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
            const connectionString = `http://${serverIp}:62025`;
            const socket = io(connectionString, { transports: ['websocket', 'polling'] });

            socket.on('connect', () => {
                console.log('Terhubung ke IndoFinity Socket IO');
                setIsConnected(true);
                setIsConnecting(false);
            });

            socket.on('message', (rawData: any) => {
                try {
                    let message = rawData;
                    if (typeof rawData === 'string') {
                        try { message = JSON.parse(rawData); } catch (e) { return; }
                    }

                    const { event, data: eventData } = message;

                    if (event === 'chat' && eventData) {
                        const current = stateRef.current;
                        const { uniqueId, nickname, profilePictureUrl, comment } = eventData;
                        const cleanWord = (comment || '').toUpperCase().replace(/[^A-Z]/g, '').trim();

                        // --- MODE: LIVE KNOCKOUT LOGIC ---
                        if (current.mode === GameMode.LIVE_KNOCKOUT) {
                            // Lobby Phase
                            if (current.knockoutPhase === 'LOBBY') {
                                if (cleanWord === 'JOIN' || cleanWord === 'IKUT') {
                                    if (current.pastPlayerIds.has(uniqueId)) return;
                                    setLobbyPlayers(prev => {
                                        if (prev.find(p => p.uniqueId === uniqueId)) return prev;
                                        return [...prev, { uniqueId, nickname: nickname || uniqueId, profilePictureUrl }];
                                    });
                                }
                                return;
                            }

                            // Match Phase
                            if (current.knockoutPhase === 'BRACKET' && current.gameState === GameState.PLAYING && current.activeMatchIndex !== null) {
                                // STRICT TURN ENFORCEMENT
                                // Check if the message is from the player whose turn it is
                                if (uniqueId !== current.currentTurnPlayerId) {
                                    return; // Ignore answers from non-active player or spectators
                                }

                                // Validate Word
                                if (cleanWord && cleanWord.length === 5) {
                                    const result = validateUserWord(cleanWord, current.dictionary, current.requiredPrefix, current.usedWords);
                                    
                                    // Log attempt (only valid player attempts)
                                    setLiveAttempts(prev => [...prev.slice(-19), {
                                        uniqueId, nickname: nickname || uniqueId, profilePictureUrl,
                                        word: cleanWord, isValid: result.valid, reason: result.error, timestamp: Date.now()
                                    }]);

                                    if (result.valid && result.entry) {
                                        setLastWinner({ name: nickname || uniqueId, word: cleanWord });
                                        executeMove(result.entry.word, 'chat', result.entry.arti, nickname || uniqueId, profilePictureUrl, uniqueId);
                                    }
                                }
                                return;
                            }
                        }

                        // --- MODE: STANDARD LOGIC (VS AI / Battle Royale) ---
                        if (!cleanWord || current.mode === GameMode.LIVE_KNOCKOUT) return;

                        let isValid = false;
                        let reason = '';
                        let entry: DictionaryEntry | undefined;

                        if (current.gameState !== GameState.PLAYING) {
                            reason = "Game belum mulai";
                        } else if (current.isAiTurn && current.mode === GameMode.LIVE_VS_AI) {
                            reason = "Giliran AI";
                        } else if (cleanWord.length !== 5) {
                            reason = "Harus 5 huruf";
                        } else {
                             const result = validateUserWord(cleanWord, current.dictionary, current.requiredPrefix, current.usedWords);
                             isValid = result.valid;
                             reason = result.error || '';
                             entry = result.entry;
                        }
                        
                        setLiveAttempts(prev => [...prev.slice(-19), {
                            uniqueId, nickname: nickname || uniqueId, profilePictureUrl,
                            word: cleanWord, isValid, reason, timestamp: Date.now()
                        }]);

                        const canExecute = isValid && entry && current.gameState === GameState.PLAYING && 
                            (!current.isAiTurn || current.mode === GameMode.LIVE_VS_NETIZEN);

                        if (canExecute) {
                            setLastWinner({ name: nickname || uniqueId, word: cleanWord });
                            executeMove(entry!.word, 'chat', entry!.arti, nickname || uniqueId, profilePictureUrl, uniqueId);
                        }
                    }
                } catch (e) {
                    console.error("Socket err", e);
                }
            });

            socket.on('disconnect', () => { setIsConnected(false); setIsConnecting(false); });
            socket.on('connect_error', () => { setIsConnected(false); setIsConnecting(false); });

            socketRef.current = socket;
        } catch (e) { setIsConnecting(false); }
    }, [executeMove, serverIp]); 

    useEffect(() => {
        return () => { if (socketRef.current) socketRef.current.disconnect(); };
    }, []);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [liveAttempts]);

    // --- Game Timer & AI Logic ---
    useEffect(() => {
        let interval: number;
        if (gameState === GameState.PLAYING && timeLeft > 0) {
            interval = window.setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
        } else if (timeLeft === 0 && gameState === GameState.PLAYING) {
            const currentMode = stateRef.current.mode;
            
            if (currentMode === GameMode.LIVE_VS_AI) {
                if (isAiTurn) endGame(GameState.VICTORY, "AI Kehabisan Waktu! Netizen Menang!");
                else endGame(GameState.GAME_OVER, "Waktu Habis! Netizen Gagal Menjawab!");
            } else if (currentMode === GameMode.LIVE_VS_NETIZEN) {
                // Battle Royale: AI Rescues
                const prefix = stateRef.current.requiredPrefix || '';
                const aiMove = findAIWord(stateRef.current.dictionary, prefix, stateRef.current.usedWords);
                if (aiMove) executeMove(aiMove.word, 'ai', aiMove.arti);
                else endGame(GameState.VICTORY, `Waduh! AI juga mentok. Netizen GG!`);
            } else if (currentMode === GameMode.LIVE_KNOCKOUT) {
                // Knockout Logic: Time Out = Loss for current turn player
                const matchIdx = stateRef.current.activeMatchIndex;
                const turnId = stateRef.current.currentTurnPlayerId;
                
                if(matchIdx !== null && turnId) {
                     const match = stateRef.current.matches[matchIdx];
                     // Identify winner (the one who is NOT the current turn player)
                     const winner = (match.p1?.uniqueId === turnId) ? match.p2 : match.p1;
                     if(winner) advanceKnockout(winner);
                }
            }
        }
        return () => clearInterval(interval);
    }, [timeLeft, gameState, isAiTurn, endGame, executeMove]);

    // AI Turn (Only for VS AI mode)
    useEffect(() => {
        if (gameState === GameState.PLAYING && isAiTurn && mode === GameMode.LIVE_VS_AI) {
            const timerId = setTimeout(() => {
                const prefix = requiredPrefix || '';
                const aiMove = findAIWord(dictionary, prefix, usedWords);
                if (aiMove) executeMove(aiMove.word, 'ai', aiMove.arti);
                else endGame(GameState.VICTORY, `AI Nyerah! Netizen terlalu jago!`);
            }, Math.random() * 2000 + 1500);
            return () => clearTimeout(timerId);
        }
    }, [isAiTurn, gameState, requiredPrefix, dictionary, usedWords, executeMove, endGame, mode]);


    const startGame = () => {
        if (mode === GameMode.LIVE_KNOCKOUT) {
            initKnockout(); // Reset to lobby
        } else {
            if (!isConnected) return;
            setGameState(GameState.PLAYING);
            setHistory([]);
            setUsedWords(new Set());
            setAiScore(0);
            setChatScore(0);
            setLeaderboard([]);
            setLastWinner(null);
            setLiveAttempts([]);
            setRoastMessage('');
            
            const randomStart = dictionary[Math.floor(Math.random() * dictionary.length)];
            executeMove(randomStart.word, 'ai', randomStart.arti);
        }
    };

    const lastWord = history.length > 0 ? history[0] : null;

    // --- SUB-COMPONENT: Knockout View ---
    const KnockoutView = () => {
        if (knockoutPhase === 'LOBBY') {
            return (
                <div className="text-center space-y-6 relative w-full max-w-4xl mx-auto">
                    {/* Connection UI for Knockout */}
                    {!isConnected && (
                        <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700 backdrop-blur-sm mb-6 max-w-md mx-auto relative z-30">
                            <h3 className="text-indigo-400 font-bold mb-3 flex items-center justify-center gap-2"><Server size={18}/> KONEKSI SERVER LIVE</h3>
                             <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    value={serverIp} 
                                    onChange={(e) => setServerIp(e.target.value)} 
                                    className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white font-mono text-center text-sm outline-none focus:border-indigo-500" 
                                    placeholder="IP Address (ex: localhost)" 
                                />
                                <button 
                                    onClick={connectSocket} 
                                    disabled={isConnecting} 
                                    className={`px-4 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${isConnecting ? 'bg-slate-600' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
                                >
                                    {isConnecting ? <Loader2 size={16} className="animate-spin" /> : <Power size={16} />}
                                    {isConnecting ? '...' : 'CONNECT'}
                                </button>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-2">Pastikan aplikasi TikTok Live Connector (IndoFinity) sudah berjalan.</p>
                        </div>
                    )}
                    
                    {isConnected && (
                        <div className="bg-emerald-500/20 p-2 rounded-lg border border-emerald-500/50 mb-4 inline-block">
                             <span className="text-emerald-300 font-bold text-sm flex items-center gap-2"><Wifi size={16}/> TERHUBUNG KE LIVE CHAT</span>
                        </div>
                    )}

                    <div className="p-4 border-2 border-purple-500/50 bg-purple-900/20 rounded-2xl animate-pulse">
                        <h2 className="text-2xl font-bold text-purple-300 mb-2">LOBBY TURNAMEN (8 SLOT)</h2>
                        <p className="text-white text-lg">Ketik <span className="font-mono bg-white text-purple-900 px-2 rounded">JOIN</span> di komentar!</p>
                        <p className="text-sm text-slate-400 mt-2">Peserta: {lobbyPlayers.length} / 8</p>
                        <p className="text-xs text-rose-400 italic">Pemain sebelumnya tidak bisa ikut.</p>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-2 max-w-lg mx-auto">
                        {Array.from({ length: 8 }).map((_, i) => {
                            const p = lobbyPlayers[i];
                            return (
                                <div key={i} className={`flex flex-col items-center p-2 rounded-lg ${p ? 'bg-purple-600/30 border border-purple-500/50' : 'bg-slate-800/30 border border-slate-700/50 border-dashed'}`}>
                                    {p ? (
                                        <>
                                            {p.profilePictureUrl ? (
                                                <img src={p.profilePictureUrl} className="w-10 h-10 rounded-full border border-white/50" />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center border border-white/50 text-white font-bold">
                                                    {p.nickname.charAt(0)}
                                                </div>
                                            )}
                                            <span className="text-[10px] truncate w-full text-center mt-1 text-white">{p.nickname.slice(0,8)}</span>
                                        </>
                                    ) : (
                                        <div className="w-10 h-10 rounded-full flex items-center justify-center opacity-30">
                                            <User size={20} />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex gap-2 justify-center">
                         <button 
                            onClick={simulateJoin}
                            disabled={lobbyPlayers.length >= 8}
                            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-bold"
                        >
                            <UserPlus size={16} className="inline mr-1" /> SIMULASI JOIN
                        </button>
                        <button 
                            onClick={startKnockoutTournament}
                            disabled={lobbyPlayers.length < 8}
                            className="px-8 py-4 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:opacity-50 text-white rounded-xl font-bold text-xl shadow-lg transition-all"
                        >
                            MULAI TURNAMEN
                        </button>
                    </div>
                </div>
            );
        }

        // Bracket View
        return (
            <div className="w-full flex flex-col items-center h-full">
                {/* Visual Bracket 8 Players */}
                <div className="flex justify-between items-center w-full max-w-5xl gap-2 mb-4 px-2 text-[10px] md:text-xs">
                    
                    {/* Left Column (QF 1 & 2) */}
                    <div className="flex flex-col gap-8 w-1/5">
                         {/* Match 0 */}
                        <div className={`p-1 rounded border ${activeMatchIndex === 0 ? 'border-yellow-400 bg-yellow-400/20 animate-pulse' : 'border-slate-600 bg-slate-800'}`}>
                            <div className={`p-1 truncate ${matches[0].winner?.uniqueId === matches[0].p1?.uniqueId ? 'text-green-400 font-bold' : ''}`}>{matches[0].p1?.nickname}</div>
                            <div className="h-px bg-slate-600 w-full"></div>
                            <div className={`p-1 truncate ${matches[0].winner?.uniqueId === matches[0].p2?.uniqueId ? 'text-green-400 font-bold' : ''}`}>{matches[0].p2?.nickname}</div>
                        </div>
                        {/* Match 1 */}
                        <div className={`p-1 rounded border ${activeMatchIndex === 1 ? 'border-yellow-400 bg-yellow-400/20 animate-pulse' : 'border-slate-600 bg-slate-800'}`}>
                            <div className={`p-1 truncate ${matches[1].winner?.uniqueId === matches[1].p1?.uniqueId ? 'text-green-400 font-bold' : ''}`}>{matches[1].p1?.nickname}</div>
                            <div className="h-px bg-slate-600 w-full"></div>
                            <div className={`p-1 truncate ${matches[1].winner?.uniqueId === matches[1].p2?.uniqueId ? 'text-green-400 font-bold' : ''}`}>{matches[1].p2?.nickname}</div>
                        </div>
                    </div>

                    {/* Left Semifinal (Match 4) */}
                    <div className="flex flex-col justify-center w-1/5">
                         <div className={`p-1 rounded border ${activeMatchIndex === 4 ? 'border-yellow-400 bg-yellow-400/20 animate-pulse' : 'border-slate-600 bg-slate-800'}`}>
                            <div className={`p-1 truncate ${matches[4].winner?.uniqueId === matches[4].p1?.uniqueId ? 'text-green-400 font-bold' : ''}`}>{matches[4].p1 ? matches[4].p1.nickname : '...'}</div>
                            <div className="h-px bg-slate-600 w-full"></div>
                            <div className={`p-1 truncate ${matches[4].winner?.uniqueId === matches[4].p2?.uniqueId ? 'text-green-400 font-bold' : ''}`}>{matches[4].p2 ? matches[4].p2.nickname : '...'}</div>
                        </div>
                    </div>

                    {/* Final (Match 6) & Center Arena */}
                    <div className="flex flex-col items-center justify-center w-1/5 gap-2">
                        <div className="text-yellow-400 font-bold text-lg">FINAL</div>
                        <div className={`w-full p-2 rounded-lg border-2 text-center ${activeMatchIndex === 6 ? 'border-yellow-400 bg-yellow-400/20 animate-pulse' : 'border-slate-500 bg-slate-900'}`}>
                             <div className={`font-bold truncate ${matches[6].winner?.uniqueId === matches[6].p1?.uniqueId ? 'text-green-400' : ''}`}>
                                 {matches[6].p1 ? matches[6].p1.nickname : '...'}
                             </div>
                             <div className="text-[10px] text-slate-500">vs</div>
                             <div className={`font-bold truncate ${matches[6].winner?.uniqueId === matches[6].p2?.uniqueId ? 'text-green-400' : ''}`}>
                                 {matches[6].p2 ? matches[6].p2.nickname : '...'}
                             </div>
                        </div>
                         {knockoutChampion && (
                             <div className="animate-pop-in text-center mt-2">
                                 <Crown size={32} className="text-yellow-400 mx-auto mb-1" />
                                 <div className="text-yellow-300 font-black text-sm">{knockoutChampion.nickname}</div>
                             </div>
                         )}
                    </div>

                    {/* Right Semifinal (Match 5) */}
                    <div className="flex flex-col justify-center w-1/5">
                        <div className={`p-1 rounded border ${activeMatchIndex === 5 ? 'border-yellow-400 bg-yellow-400/20 animate-pulse' : 'border-slate-600 bg-slate-800'}`}>
                            <div className={`p-1 truncate ${matches[5].winner?.uniqueId === matches[5].p1?.uniqueId ? 'text-green-400 font-bold' : ''}`}>{matches[5].p1 ? matches[5].p1.nickname : '...'}</div>
                            <div className="h-px bg-slate-600 w-full"></div>
                            <div className={`p-1 truncate ${matches[5].winner?.uniqueId === matches[5].p2?.uniqueId ? 'text-green-400 font-bold' : ''}`}>{matches[5].p2 ? matches[5].p2.nickname : '...'}</div>
                        </div>
                    </div>

                    {/* Right Column (QF 3 & 4) */}
                    <div className="flex flex-col gap-8 w-1/5">
                         {/* Match 2 */}
                        <div className={`p-1 rounded border ${activeMatchIndex === 2 ? 'border-yellow-400 bg-yellow-400/20 animate-pulse' : 'border-slate-600 bg-slate-800'}`}>
                            <div className={`p-1 truncate ${matches[2].winner?.uniqueId === matches[2].p1?.uniqueId ? 'text-green-400 font-bold' : ''}`}>{matches[2].p1?.nickname}</div>
                            <div className="h-px bg-slate-600 w-full"></div>
                            <div className={`p-1 truncate ${matches[2].winner?.uniqueId === matches[2].p2?.uniqueId ? 'text-green-400 font-bold' : ''}`}>{matches[2].p2?.nickname}</div>
                        </div>
                        {/* Match 3 */}
                        <div className={`p-1 rounded border ${activeMatchIndex === 3 ? 'border-yellow-400 bg-yellow-400/20 animate-pulse' : 'border-slate-600 bg-slate-800'}`}>
                            <div className={`p-1 truncate ${matches[3].winner?.uniqueId === matches[3].p1?.uniqueId ? 'text-green-400 font-bold' : ''}`}>{matches[3].p1?.nickname}</div>
                            <div className="h-px bg-slate-600 w-full"></div>
                            <div className={`p-1 truncate ${matches[3].winner?.uniqueId === matches[3].p2?.uniqueId ? 'text-green-400 font-bold' : ''}`}>{matches[3].p2?.nickname}</div>
                        </div>
                    </div>
                </div>

                {/* Active Game Area (Only if playing) */}
                {knockoutPhase === 'BRACKET' && activeMatchIndex !== null && matches[activeMatchIndex] && (
                     <div className="w-full max-w-md bg-black/30 p-4 rounded-xl border border-white/10 text-center relative mt-auto mb-auto">
                        <div className="text-xs uppercase tracking-widest text-purple-300 mb-2">
                            {activeMatchIndex >= 6 ? 'BABAK FINAL' : (activeMatchIndex >= 4 ? 'SEMIFINAL' : `PEREMPAT FINAL ${activeMatchIndex + 1}`)}
                        </div>
                        
                        {/* Player Turn Indicator */}
                        <div className="flex items-center justify-center gap-4 mb-4 relative">
                             {/* Player 1 */}
                             <div className={`text-right w-1/2 overflow-hidden transition-all duration-300 p-2 rounded-lg ${currentTurnPlayerId === matches[activeMatchIndex].p1?.uniqueId ? 'bg-yellow-500/20 border border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.3)] scale-105' : 'opacity-60'}`}>
                                 <div className="font-bold text-lg truncate">{matches[activeMatchIndex].p1?.nickname}</div>
                                 {currentTurnPlayerId === matches[activeMatchIndex].p1?.uniqueId && (
                                     <div className="text-[10px] text-yellow-300 animate-pulse font-bold mt-1">GILIRAN KAMU!</div>
                                 )}
                             </div>
                             
                             <div className="text-sm font-mono text-slate-400 flex flex-col items-center">
                                 <span>VS</span>
                                 <ArrowRightLeft size={14} className="mt-1 opacity-50" />
                             </div>
                             
                             {/* Player 2 */}
                             <div className={`text-left w-1/2 overflow-hidden transition-all duration-300 p-2 rounded-lg ${currentTurnPlayerId === matches[activeMatchIndex].p2?.uniqueId ? 'bg-yellow-500/20 border border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.3)] scale-105' : 'opacity-60'}`}>
                                 <div className="font-bold text-lg truncate">{matches[activeMatchIndex].p2?.nickname}</div>
                                 {currentTurnPlayerId === matches[activeMatchIndex].p2?.uniqueId && (
                                     <div className="text-[10px] text-yellow-300 animate-pulse font-bold mt-1">GILIRAN KAMU!</div>
                                 )}
                             </div>
                        </div>

                        {lastWord && <WordCard data={lastWord} isLatest={true} />}
                        
                        {requiredPrefix ? (
                            <div className="text-4xl font-black text-white mt-4 tracking-widest animate-pulse">
                                {requiredPrefix}...
                            </div>
                        ) : (
                             <div className="text-xl text-slate-400 mt-4 animate-pulse">Menunggu AI...</div>
                        )}

                        <div className="mt-4">
                             <Timer timeLeft={timeLeft} totalTime={10} />
                        </div>
                        
                        {/* Simulation Button */}
                        <button 
                            onClick={simulateCorrectAnswer} 
                            className="absolute -top-10 right-0 text-[10px] bg-white/10 px-2 py-1 rounded hover:bg-white/20"
                        >
                            <PlayCircle size={12} className="inline mr-1"/> Simulasi Pemain Aktif
                        </button>
                     </div>
                )}

                 {knockoutPhase === 'FINISHED' && (
                     <button onClick={initKnockout} className="mt-8 px-6 py-3 bg-indigo-600 rounded-lg font-bold">
                         Turnamen Baru
                     </button>
                 )}
            </div>
        );
    };

    return (
        <div className="h-[100dvh] flex flex-col bg-slate-900 text-white overflow-hidden font-mono">
            {/* Top Bar */}
            <div className="bg-indigo-900/50 border-b border-indigo-500/30 p-2 flex justify-between items-center z-20 shrink-0">
                <div className="flex items-center gap-2">
                    <button onClick={onBack} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-3 py-1 rounded text-xs font-bold uppercase tracking-wider text-slate-300 transition-colors">
                        <Home size={14} />
                        <span>MENU</span>
                    </button>
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${isConnected ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-rose-500/10 border-rose-500/30'}`}>
                        {isConnecting ? <Loader2 size={14} className="animate-spin" /> : (isConnected ? <Wifi size={14} className="text-emerald-400" /> : <WifiOff size={14} className="text-rose-500" />)}
                        <span className={`text-[10px] font-bold ${isConnected ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isConnecting ? "CONNECTING..." : (isConnected ? "CONNECTED" : "DISCONNECTED")}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                     <span className="text-[10px] font-bold bg-white/10 px-2 py-0.5 rounded uppercase">
                         {mode === GameMode.LIVE_KNOCKOUT ? 'KNOCKOUT' : (mode === GameMode.LIVE_VS_NETIZEN ? 'BATTLE ROYALE' : 'VS AI')}
                     </span>
                </div>
            </div>

            <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden relative">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/40 via-slate-900 to-black z-0" />

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col items-center justify-center relative z-10 p-4 overflow-y-auto scrollbar-hide">
                    {/* Render different views based on mode */}
                    {mode === GameMode.LIVE_KNOCKOUT ? (
                        <KnockoutView />
                    ) : (
                        /* Existing logic for VS AI / Battle Royale */
                        gameState === GameState.IDLE ? (
                            <div className="text-center space-y-6 animate-pop-in relative z-20">
                                <div className="w-24 h-24 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-indigo-500/50">
                                    {mode === GameMode.LIVE_VS_NETIZEN ? <Swords size={48} className="text-amber-400" /> : <Users size={48} className="text-indigo-400" />}
                                </div>
                                <h1 className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400">
                                    {mode === GameMode.LIVE_VS_NETIZEN ? "BATTLE ROYALE" : "VS AI BOT"}
                                </h1>
                                
                                {!isConnected ? (
                                    <div className="flex flex-col items-center gap-4 w-full max-w-sm mx-auto">
                                         <div className="w-full bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                                            <div className="flex justify-between items-center mb-1">
                                                <label className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider flex items-center gap-1"><Globe size={10} /> IP Server</label>
                                            </div>
                                            <input type="text" value={serverIp} onChange={(e) => setServerIp(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-center outline-none" placeholder="localhost" />
                                        </div>
                                        <button onClick={connectSocket} disabled={isConnecting} className={`w-full px-8 py-4 rounded-xl font-bold text-xl shadow-lg transition-all flex items-center justify-center gap-3 ${isConnecting ? 'bg-slate-600' : 'bg-sky-600 hover:bg-sky-500'}`}>
                                            {isConnecting ? <Loader2 className="animate-spin" /> : <Server />} 
                                            {isConnecting ? '...' : 'SAMBUNGKAN'}
                                        </button>
                                    </div>
                                ) : (
                                    <button onClick={startGame} className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xl shadow-lg transform hover:scale-105 transition-all flex items-center gap-3 mx-auto">
                                        <Play fill="currentColor" /> MULAI GAME
                                    </button>
                                )}
                            </div>
                        ) : gameState === GameState.PLAYING ? (
                             <div className="w-full max-w-xl flex flex-col items-center">
                                {/* Score & Board for Non-Knockout */}
                                <div className="absolute top-4 w-full px-4 flex justify-center z-20 pointer-events-none">
                                    {mode === GameMode.LIVE_VS_AI ? (
                                        <div className="flex justify-between w-full max-w-2xl">
                                            <div className="flex flex-col items-center"><span className="text-4xl font-black text-rose-400">{aiScore}</span><span className="text-xs font-bold bg-rose-500/20 px-2 py-0.5 rounded text-rose-200">AI BOT</span></div>
                                            <div className="flex flex-col items-center"><span className="text-4xl font-black text-emerald-400">{chatScore}</span><span className="text-xs font-bold bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-200">NETIZEN</span></div>
                                        </div>
                                    ) : (
                                        <div className="w-full max-w-sm bg-black/40 backdrop-blur-sm border border-amber-500/30 rounded-xl p-2">
                                            <div className="flex items-center justify-between mb-2 pb-1 border-b border-white/10">
                                                <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-widest"><Trophy size={14} /> Top Juara</div>
                                                <span className="text-[10px] text-slate-400">Total Valid: {history.filter(h => h.player === 'chat').length}</span>
                                            </div>
                                            {leaderboard.map((player, idx) => (
                                                <div key={player.uniqueId} className="flex items-center justify-between text-xs mb-1">
                                                    <div className="flex items-center gap-2"><span className="font-bold text-amber-400">#{idx + 1}</span> <span>{player.nickname}</span></div>
                                                    <span className="font-bold">{player.score}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                
                                {/* Word Display */}
                                <div className="w-full flex flex-col items-center gap-4 mb-8 h-[200px] justify-end">
                                    {history.length > 1 && <div className="scale-75 opacity-50 absolute top-20 blur-[1px]"><WordCard data={history[1]} isLatest={false} /></div>}
                                    {lastWord && <div className="z-20 w-full flex justify-center animate-slide-up-entry">
                                        <div className="relative">
                                            <WordCard data={lastWord} isLatest={true} />
                                            {lastWord.player === 'chat' && lastWord.winnerName && (
                                                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-xs font-bold px-1.5 py-1 rounded-full shadow-lg whitespace-nowrap animate-pop-in flex items-center gap-2 pr-3">
                                                    {lastWord.winnerProfilePic ? <img src={lastWord.winnerProfilePic} className="w-5 h-5 rounded-full border border-white/30" /> : <User size={10} />}
                                                    <span>{lastWord.winnerName}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>}
                                </div>
                                <div className="w-full text-center space-y-4">
                                    {requiredPrefix && <div className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-emerald-400 drop-shadow-2xl">{requiredPrefix}...</div>}
                                    <div className="w-full max-w-md mx-auto"><Timer timeLeft={timeLeft} totalTime={mode === GameMode.LIVE_VS_NETIZEN ? 20 : 15} /></div>
                                </div>
                             </div>
                        ) : (
                            <div className="text-center animate-pop-in glass p-8 rounded-3xl max-w-md mx-auto relative z-30">
                                {/* Result Screen */}
                                <Trophy size={80} className="text-yellow-400 animate-bounce mx-auto mb-4" />
                                <h2 className="text-4xl font-black mb-4 uppercase">{mode === GameMode.LIVE_VS_NETIZEN ? 'RONDE SELESAI' : (gameState === GameState.VICTORY ? 'MENANG!' : 'KALAH')}</h2>
                                <p className="text-white font-bold text-lg mb-1 italic">"{roastMessage}"</p>
                                <button onClick={startGame} className="w-full py-4 mt-8 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold text-lg transition-colors shadow-lg">MAIN LAGI</button>
                            </div>
                        )
                    )}
                </div>

                {/* Right Panel: Live Feed */}
                <div className="w-full md:w-80 border-l border-white/5 bg-black/20 backdrop-blur-md flex flex-col z-20 h-[30vh] md:h-auto border-t md:border-t-0 shrink-0">
                    <div className="p-3 bg-slate-900/80 border-b border-white/5 flex items-center justify-between">
                        <span className="font-bold text-xs uppercase tracking-wider flex items-center gap-2"><MessageSquare size={14} /> Live Chat</span>
                        <span className="text-[10px] bg-slate-700 px-2 py-0.5 rounded text-slate-300">io:2025</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2 no-scrollbar" ref={scrollRef}>
                        {liveAttempts.map((attempt, idx) => (
                            <div key={`${attempt.uniqueId}-${idx}`} className={`text-xs p-2 rounded-lg border ${attempt.isValid ? 'bg-emerald-500/20 border-emerald-500/50' : 'bg-rose-500/10 border-rose-500/20'} animate-slide-up-entry`}>
                                <div className="flex justify-between items-start mb-1">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <span className="font-bold text-slate-200 truncate">{attempt.nickname}</span>
                                    </div>
                                    <span className="text-[10px] opacity-50">{new Date(attempt.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}</span>
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={`font-mono text-sm ${attempt.isValid ? 'text-emerald-300 font-bold' : 'text-rose-300'}`}>{attempt.word}</span>
                                    {!attempt.isValid && <span className="text-[10px] text-rose-400 bg-rose-950/30 px-1.5 py-0.5 rounded">{attempt.reason}</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};