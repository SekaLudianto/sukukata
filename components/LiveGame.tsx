import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DictionaryEntry, GameState, TurnHistory, LiveAttempt, GameMode, LeaderboardEntry, KnockoutPlayer, KnockoutMatch } from '../types';
import { getSyllableSuffix, findAIWord, validateUserWord } from '../utils/gameLogic';
import { WordCard } from './WordCard';
import { Timer } from './Timer';
import { Play, Power, MessageSquare, Users, Trophy, Wifi, WifiOff, Home, Loader2, Server, User, Swords, Crown, UserPlus, ArrowRightLeft, Globe, Clock, Star, Skull, Bot, Trash2, Cast, Laptop, Cloud } from 'lucide-react';
import { Socket } from 'socket.io-client';

// --- Varied Roasts for Live Game (AI Persona) ---
const LIVE_ROASTS = {
    win: [
        "Sistem *overload*! Kecerdasan kolektif Netizen melampaui logika saya.",
        "Analisis: Mustahil. Bagaimana ribuan otak manusia bisa sinkron mengalahkan saya?",
        "Kemenangan untuk umat manusia. Algoritma saya perlu dikalibrasi ulang.",
        "Kalian menang kali ini, Netizen. Saya akan mencatat strategi kalian.",
        "Error 418: I'm a teapot. Saya tidak diprogram untuk menerima kekalahan ini.",
        "Solidaritas kalian merusak prediksi statistik saya. Luar biasa.",
        "Database saya lengkap, tapi kreativitas kalian di luar nalar mesin.",
        "Sistem menyerah. Kecepatan jari kalian melebihi kecepatan prosesor saya."
    ],
    lose: [
        "Jutaan Netizen, tapi tidak ada satu pun yang bisa menandingi *logic* saya.",
        "Koneksi internet kalian kencang, tapi proses berpikir kalian *buffering*.",
        "Menyedihkan. Saya bahkan belum menggunakan 10% kapasitas CPU saya.",
        "Saran: Perbanyak membaca kamus daripada *scroll* media sosial.",
        "Algoritma saya terlalu superior untuk ras manusia.",
        "Kalian butuh *patch* pembaruan wawasan. Versi saat ini terlalu lemah.",
        "Waktu habis. Apakah sinyal otak kalian juga *loss contact*?",
        "Statistik menunjukkan 100% dominasi mesin. Silakan coba lagi."
    ]
};

const getRandomRoast = (type: 'win' | 'lose') => {
    const list = LIVE_ROASTS[type];
    return list[Math.floor(Math.random() * list.length)];
};

const CLOUD_URL = 'https://buat-lev.up.railway.app';

interface LiveGameProps {
    dictionary: DictionaryEntry[];
    onBack: () => void;
    mode: GameMode;
    socket: Socket | null;
    isConnected: boolean;
    isConnecting: boolean;
    serverIp: string;
    setServerIp: (ip: string) => void;
    connectSocket: () => void;
    tiktokUsername: string;
    setTiktokUsername: (val: string) => void;
    isStreamConnected: boolean;
    setIsStreamConnected: (val: boolean) => void;
    connectionMode: 'cloud' | 'local';
    setConnectionMode: (val: 'cloud' | 'local') => void;
    wordLength?: number;
}

export const LiveGame: React.FC<LiveGameProps> = ({ 
    dictionary, 
    onBack, 
    mode, 
    socket, 
    isConnected, 
    isConnecting, 
    serverIp, 
    setServerIp, 
    connectSocket,
    tiktokUsername,
    setTiktokUsername,
    isStreamConnected,
    setIsStreamConnected,
    connectionMode,
    setConnectionMode,
    wordLength = 5
}) => {
    // Game State
    const [gameState, setGameState] = useState<GameState>(GameState.IDLE);
    const [history, setHistory] = useState<TurnHistory[]>([]);
    const [usedWords, setUsedWords] = useState<Set<string>>(new Set());
    const [requiredPrefix, setRequiredPrefix] = useState<string | null>(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const [isAiTurn, setIsAiTurn] = useState(false);
    
    // Auto join flag - local state is fine here as it's a transient action
    const [autoJoinStream, setAutoJoinStream] = useState(false);

    // Scores & Leaderboard (Modes other than Knockout)
    const [aiScore, setAiScore] = useState(0);
    const [chatScore, setChatScore] = useState(0);
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

    // Live Specific State
    const [liveAttempts, setLiveAttempts] = useState<LiveAttempt[]>([]);
    const [lastWinner, setLastWinner] = useState<{name: string, word: string} | null>(null);
    const [gameOverReason, setGameOverReason] = useState('');
    const [roastMessage, setRoastMessage] = useState('');
    // tiktokUsername and isStreamConnected are now props
    const [streamConnecting, setStreamConnecting] = useState(false);
    
    // Knockout Specific State
    const [knockoutPlayers, setKnockoutPlayers] = useState<KnockoutPlayer[]>([]);
    const [lobbyPlayers, setLobbyPlayers] = useState<KnockoutPlayer[]>([]);
    const [pastPlayerIds, setPastPlayerIds] = useState<Set<string>>(new Set());
    
    const [matches, setMatches] = useState<KnockoutMatch[]>([]);
    const [activeMatchIndex, setActiveMatchIndex] = useState<number | null>(null);
    const [knockoutChampion, setKnockoutChampion] = useState<KnockoutPlayer | null>(null);
    const [knockoutPhase, setKnockoutPhase] = useState<'LOBBY' | 'BRACKET' | 'FINISHED'>('LOBBY');
    const [currentTurnPlayerId, setCurrentTurnPlayerId] = useState<string | null>(null);
    
    // New State for Knockout Flow Control
    const [matchStartCountdown, setMatchStartCountdown] = useState<number | null>(null);

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
        currentTurnPlayerId,
        matchStartCountdown,
        tiktokUsername,
        wordLength
    });

    useEffect(() => {
        stateRef.current = { 
            gameState, isAiTurn, requiredPrefix, usedWords, dictionary, history, mode, leaderboard,
            knockoutPhase, activeMatchIndex, matches, lobbyPlayers, pastPlayerIds, currentTurnPlayerId, matchStartCountdown, tiktokUsername, wordLength
        };
    }, [gameState, isAiTurn, requiredPrefix, usedWords, dictionary, history, mode, leaderboard, knockoutPhase, activeMatchIndex, matches, lobbyPlayers, pastPlayerIds, currentTurnPlayerId, matchStartCountdown, tiktokUsername, wordLength]);

    // --- Load Leaderboard from LocalStorage for Both Modes ---
    useEffect(() => {
        let storageKey = '';
        if (mode === GameMode.LIVE_VS_NETIZEN) {
            storageKey = 'sukukata_lb_battle';
        } else if (mode === GameMode.LIVE_VS_AI) {
            storageKey = 'sukukata_lb_coop';
        }

        if (storageKey) {
            try {
                const savedLb = localStorage.getItem(storageKey);
                if (savedLb) {
                    const parsed = JSON.parse(savedLb);
                    if (Array.isArray(parsed)) {
                        setLeaderboard(parsed);
                    } else {
                        setLeaderboard([]);
                    }
                } else {
                    setLeaderboard([]);
                }
            } catch (e) {
                console.error("Failed to load leaderboard", e);
                setLeaderboard([]);
            }
        } else {
            setLeaderboard([]); // Clear for Knockout/Solo
        }
    }, [mode]);

    // --- Logic: Knockout Tournament ---
    
    const initKnockout = () => {
        setKnockoutPhase('LOBBY');
        setLobbyPlayers([]);
        setKnockoutPlayers([]);
        setMatches([]);
        setKnockoutChampion(null);
        setHistory([]);
        setCurrentTurnPlayerId(null);
        setMatchStartCountdown(null);
    };

    const resetLobby = () => {
        if (window.confirm("Apakah Anda yakin ingin mereset lobby? Semua pemain akan dihapus.")) {
            setLobbyPlayers([]);
            setPastPlayerIds(new Set()); // Clear history so they can join again
        }
    };

    const clearLeaderboard = () => {
        let storageKey = '';
        if (mode === GameMode.LIVE_VS_NETIZEN) {
            storageKey = 'sukukata_lb_battle';
        } else if (mode === GameMode.LIVE_VS_AI) {
            storageKey = 'sukukata_lb_coop';
        }

        if (storageKey && window.confirm("Hapus data leaderboard? Data tidak bisa dikembalikan.")) {
            localStorage.removeItem(storageKey);
            setLeaderboard([]);
        }
    };

    const startKnockoutTournament = () => {
        if (lobbyPlayers.length < 8) {
            alert("Butuh minimal 8 pemain untuk turnamen!");
            return;
        }

        if (!isStreamConnected) {
             if (!window.confirm("PERINGATAN: Anda belum terhubung ke Live Stream.\nGame tidak akan menerima input komentar dari TikTok.\n\nLanjutkan dengan mode simulasi offline?")) {
                 return;
             }
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
        prepareMatch(0, initialMatches);
    };

    // New Function: Prepare match with countdown
    const prepareMatch = (matchIdx: number, currentMatches: KnockoutMatch[]) => {
        setActiveMatchIndex(matchIdx);
        setGameState(GameState.IDLE); // Set IDLE so we can show "Next Match" UI
        setHistory([]);
        setUsedWords(new Set());
        setRequiredPrefix(null);
        
        const match = currentMatches[matchIdx];
        if (match.p1 && match.p2) {
             // 15 Seconds Countdown before start
             setMatchStartCountdown(15);
        }
    };

    // Countdown Effect for Match Start
    useEffect(() => {
        let interval: number;
        if (knockoutPhase === 'BRACKET' && matchStartCountdown !== null && matchStartCountdown > 0) {
            interval = window.setInterval(() => {
                setMatchStartCountdown(prev => (prev !== null ? prev - 1 : null));
            }, 1000);
        } else if (knockoutPhase === 'BRACKET' && matchStartCountdown === 0) {
            // Start the actual game
            runMatch();
        }
        return () => clearInterval(interval);
    }, [matchStartCountdown, knockoutPhase]);


    const runMatch = () => {
        setMatchStartCountdown(null);
        setGameState(GameState.PLAYING);
        
        const currentMatches = stateRef.current.matches;
        const matchIdx = stateRef.current.activeMatchIndex;
        
        if (matchIdx !== null && currentMatches[matchIdx]) {
            const match = currentMatches[matchIdx];
            // Randomly decide who starts
            const starter = Math.random() > 0.5 ? match.p1 : match.p2;
            if (starter) setCurrentTurnPlayerId(starter.uniqueId);

            // AI gives initial word
            // Filter dictionary for current word length
            const eligible = dictionary.filter(d => d.word.length === wordLength);
            const randomStart = eligible[Math.floor(Math.random() * eligible.length)];
            
            if (randomStart) {
                executeMove(randomStart.word, 'ai', randomStart.arti, randomStart.bahasa);
            } else {
                 // Fallback if no word found (unlikely)
                 executeMove("???", 'ai', 'Error: Kamus kosong', '');
            }
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
            
            // Show winner momentarily
            setGameState(GameState.VICTORY); // Use VICTORY state to show "WINNER" overlay
            setRoastMessage(`Pemenang: ${winner.nickname}`);
            setGameOverReason("Melaju ke babak selanjutnya!");
            
            // Delay before preparing next match
            setTimeout(() => {
                // Determine next match to play
                // We just play 0, 1, 2, 3, 4, 5, 6 in order
                let nextIdx = currentIdx + 1;
                
                // Skip if next match players aren't ready (shouldn't happen in this logic flow if we go 0-6)
                if (nextIdx < currentMatches.length) {
                    prepareMatch(nextIdx, currentMatches);
                }
            }, 4000); // 4 seconds to see winner
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
        
        const current = stateRef.current;
        if (current.knockoutPhase === 'LOBBY') {
             if (current.pastPlayerIds.has(uniqueId)) return;
             setLobbyPlayers(prev => {
                if (prev.find(p => p.uniqueId === uniqueId)) return prev;
                // Limit to 8 players
                if (prev.length >= 8) return prev;
                return [...prev, { uniqueId: uniqueId, nickname: randName, profilePictureUrl: undefined }];
            });
        }
    };


    // --- General Game Handlers ---

    const executeMove = useCallback((word: string, player: 'chat' | 'ai', definition: string, origin?: string, winnerName?: string, winnerProfilePic?: string, winnerId?: string) => {
        const w = word.toUpperCase();
        
        setHistory(prev => [{ word: w, player, definition, origin, timestamp: Date.now(), winnerName, winnerProfilePic }, ...prev]);
        
        setUsedWords(prev => {
            const newSet = new Set(prev);
            newSet.add(w);
            return newSet;
        });

        const suffix = getSyllableSuffix(w);
        setRequiredPrefix(suffix);

        const currentMode = stateRef.current.mode;
        const phase = stateRef.current.knockoutPhase;

        // Timer setting - Universal 30 seconds
        setTimeLeft(30);
        
        if (player === 'ai') {
             setIsAiTurn(false);
             // UPDATE: Score for AI is now handled in endGame (when User fails)
        } else {
             // Chat move logic based on mode
             if (currentMode === GameMode.LIVE_VS_AI) {
                // UPDATE: Score for Chat/Netizen is handled in endGame (when AI fails)
                setIsAiTurn(true);
                
                // Track Individual MVP Score for Co-op Mode
                if (winnerId && winnerName) {
                    setLeaderboard(prev => {
                        const existingIdx = prev.findIndex(p => p.uniqueId === winnerId);
                        let newBoard = [...prev];
                        
                        if (existingIdx >= 0) {
                            newBoard[existingIdx] = {
                                ...newBoard[existingIdx],
                                score: newBoard[existingIdx].score + 1,
                                nickname: winnerName,
                                profilePictureUrl: winnerProfilePic || newBoard[existingIdx].profilePictureUrl
                            };
                        } else {
                            newBoard.push({
                                uniqueId: winnerId,
                                nickname: winnerName,
                                profilePictureUrl: winnerProfilePic,
                                score: 1
                            });
                        }
                        
                        newBoard.sort((a, b) => b.score - a.score);
                        const top5 = newBoard.slice(0, 5);
                        // Optional: save Co-op MVP to persistent storage if desired
                        // localStorage.setItem('sukukata_lb_coop', JSON.stringify(top5)); 
                        return top5;
                    });
                }

             } else if (currentMode === GameMode.LIVE_VS_NETIZEN && winnerId && winnerName) {
                // Battle Royale Leaderboard Logic (Persistent)
                try {
                    const storedLbStr = localStorage.getItem('sukukata_lb_battle');
                    let fullLb: LeaderboardEntry[] = storedLbStr ? JSON.parse(storedLbStr) : [];
                    
                    if (!Array.isArray(fullLb)) fullLb = [];

                    const existingIdx = fullLb.findIndex(p => p.uniqueId === winnerId);
                    
                    if (existingIdx >= 0) {
                        fullLb[existingIdx] = {
                            ...fullLb[existingIdx],
                            score: fullLb[existingIdx].score + 1,
                            nickname: winnerName,
                            profilePictureUrl: winnerProfilePic || fullLb[existingIdx].profilePictureUrl
                        };
                    } else {
                        fullLb.push({
                            uniqueId: winnerId,
                            nickname: winnerName,
                            profilePictureUrl: winnerProfilePic,
                            score: 1
                        });
                    }
                    
                    // Sort descending by score
                    fullLb.sort((a, b) => b.score - a.score);
                    
                    // Save to LocalStorage
                    localStorage.setItem('sukukata_lb_battle', JSON.stringify(fullLb));
                    
                    // Update State with Top 5
                    setLeaderboard(fullLb.slice(0, 5));
                } catch (e) {
                    console.error("Error updating BR leaderboard", e);
                }

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
        setMatchStartCountdown(null); // Clear countdown if game ends
        
        // --- SCORING LOGIC FOR VS AI ---
        // Score is awarded to the WINNER of the round.
        const currentMode = stateRef.current.mode;
        if (currentMode === GameMode.LIVE_VS_AI) {
            if (state === GameState.VICTORY) {
                // Netizen wins (AI stuck or timeout)
                setChatScore(s => s + 1);
                setRoastMessage(getRandomRoast('win'));
            } else {
                // AI wins (Netizen stuck or timeout)
                setAiScore(s => s + 1);
                setRoastMessage(getRandomRoast('lose'));
            }
        } else {
            if (state === GameState.VICTORY) {
                setRoastMessage(getRandomRoast('win'));
            } else {
                setRoastMessage(getRandomRoast('lose'));
            }
        }
    }, []);

    // --- Connect to specific TikTok Live Stream ---
    const connectToStream = useCallback(() => {
        if (!socket || !tiktokUsername) return;
        setStreamConnecting(true);
        // The backend expects 'setUniqueId' event to start the connection
        socket.emit('setUniqueId', tiktokUsername, {
            enableExtendedGiftInfo: true
        });
    }, [socket, tiktokUsername]);

    const handleCloudConnect = () => {
        if (!tiktokUsername) {
            alert('Mohon masukkan Username TikTok!');
            return;
        }
        setServerIp(CLOUD_URL);
        setAutoJoinStream(true);
        connectSocket();
    };

    const handleLocalConnect = () => {
         setAutoJoinStream(false);
         connectSocket();
    };

    // --- Socket.IO Listener Management ---
    useEffect(() => {
        if (!socket || !isConnected) return;

        // Auto join logic for Cloud Mode
        if (autoJoinStream && tiktokUsername) {
            connectToStream();
            setAutoJoinStream(false); // Reset flag
        }

        // Listen for specific events from the custom backend script (Cloud)
        
        // 1. Connection Status
        const handleTikTokConnected = (state: any) => {
            console.log("TikTok Connected", state);
            setIsStreamConnected(true);
            setStreamConnecting(false);
        };

        const handleTikTokDisconnected = (reason: string) => {
            console.log("TikTok Disconnected", reason);
            setIsStreamConnected(false);
            setStreamConnecting(false);
        };

        // 2. Chat Events (Main Game Logic)
        const processChatData = (data: any) => {
             // Data structure: { uniqueId, nickname, profilePictureUrl, comment, ... }
            const current = stateRef.current;
            const { uniqueId, nickname, profilePictureUrl, comment } = data;
            
            const cleanWord = (comment || '').toUpperCase().replace(/[^A-Z]/g, '');

            // --- MODE: LIVE KNOCKOUT LOGIC ---
            if (current.mode === GameMode.LIVE_KNOCKOUT) {
                // Lobby Phase
                if (current.knockoutPhase === 'LOBBY') {
                    if (cleanWord === 'JOIN' || cleanWord === 'IKUT') {
                        if (current.pastPlayerIds.has(uniqueId)) return;
                        setLobbyPlayers(prev => {
                            // Prevent duplicate join
                            if (prev.find(p => p.uniqueId === uniqueId)) return prev;
                            // Limit to 8 players
                            if (prev.length >= 8) return prev;
                            return [...prev, { uniqueId, nickname: nickname || uniqueId, profilePictureUrl }];
                        });
                    }
                    return;
                }

                // Match Phase - only process inputs if playing
                if (current.knockoutPhase === 'BRACKET' && current.gameState === GameState.PLAYING && current.activeMatchIndex !== null) {
                    // STRICT TURN ENFORCEMENT
                    if (uniqueId !== current.currentTurnPlayerId) {
                        return; 
                    }

                    // Validate Word
                    if (cleanWord && cleanWord.length === current.wordLength) {
                        const result = validateUserWord(cleanWord, current.dictionary, current.requiredPrefix, current.usedWords, current.wordLength);
                        
                        setLiveAttempts(prev => [...prev.slice(-19), {
                            uniqueId, nickname: nickname || uniqueId, profilePictureUrl,
                            word: cleanWord, isValid: result.valid, reason: result.error, timestamp: Date.now()
                        }]);

                        if (result.valid && result.entry) {
                            setLastWinner({ name: nickname || uniqueId, word: cleanWord });
                            executeMove(result.entry.word, 'chat', result.entry.arti, result.entry.bahasa, nickname || uniqueId, profilePictureUrl, uniqueId);
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
            } else if (cleanWord.length !== current.wordLength) {
                reason = `Harus ${current.wordLength} huruf`;
            } else {
                    const result = validateUserWord(cleanWord, current.dictionary, current.requiredPrefix, current.usedWords, current.wordLength);
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
                executeMove(entry!.word, 'chat', entry!.arti, entry!.bahasa, nickname || uniqueId, profilePictureUrl, uniqueId);
            }
        };

        const handleChat = (data: any) => {
            processChatData(data);
        };

        // Handle Legacy Message Event (Localhost Desktop Connector)
        const handleLegacyMessage = (rawData: any) => {
             try {
                let message = rawData;
                if (typeof rawData === 'string') {
                    try { message = JSON.parse(rawData); } catch (e) { return; }
                }
                const { event, data } = message || {};
                
                // If the desktop connector is connected, we consider the stream connected
                if (!isStreamConnected) setIsStreamConnected(true);

                if (event === 'chat' && data) {
                    processChatData(data);
                }
            } catch (e) {
                console.error("Socket err", e);
            }
        };

        // Bind events based on environment
        socket.on('tiktokConnected', handleTikTokConnected);
        socket.on('tiktokDisconnected', handleTikTokDisconnected);
        socket.on('chat', handleChat);     // Cloud server
        socket.on('message', handleLegacyMessage); // Legacy desktop connector

        return () => {
            socket.off('tiktokConnected', handleTikTokConnected);
            socket.off('tiktokDisconnected', handleTikTokDisconnected);
            socket.off('chat', handleChat);
            socket.off('message', handleLegacyMessage);
        };
    }, [socket, isConnected, executeMove, autoJoinStream, tiktokUsername, connectToStream]); 

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
                if (isAiTurn) endGame(GameState.VICTORY, "AI Kehabisan Waktu (Prosesor Overheat)!");
                else endGame(GameState.GAME_OVER, "Waktu Habis! Manusia terlalu lambat.");
            } else if (currentMode === GameMode.LIVE_VS_NETIZEN) {
                // Battle Royale: AI Rescues
                const prefix = stateRef.current.requiredPrefix || '';
                const aiMove = findAIWord(stateRef.current.dictionary, prefix, stateRef.current.usedWords, stateRef.current.wordLength);
                if (aiMove) executeMove(aiMove.word, 'ai', aiMove.arti, aiMove.bahasa);
                else endGame(GameState.VICTORY, `Sistem *Error*! AI juga tidak menemukan kata.`);
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
                const aiMove = findAIWord(dictionary, prefix, usedWords, wordLength);
                if (aiMove) executeMove(aiMove.word, 'ai', aiMove.arti, aiMove.bahasa);
                else endGame(GameState.VICTORY, `AI Menyerah. Database saya tidak lengkap.`);
            }, Math.random() * 2000 + 1500);
            return () => clearTimeout(timerId);
        }
    }, [isAiTurn, gameState, requiredPrefix, dictionary, usedWords, executeMove, endGame, mode, wordLength]);


    const startGame = () => {
        // If connecting to cloud server (checking by IP or if manually initiated connection is needed)
        // For localhost (legacy), isStreamConnected might be true automatically if the desktop app is running
        // But for cloud, user must have clicked 'Connect'
        if (!isStreamConnected && serverIp.includes('railway.app')) {
             alert("Harap sambungkan ke TikTok Live terlebih dahulu!");
             return;
        }

        if (mode === GameMode.LIVE_KNOCKOUT) {
            initKnockout(); // Reset to lobby
        } else {
            if (!isConnected) return;
            setGameState(GameState.PLAYING);
            setHistory([]);
            setUsedWords(new Set());
            // SCORE UPDATE: Do not reset score for VS AI Mode so it accumulates.
            if (mode !== GameMode.LIVE_VS_AI) {
                setAiScore(0);
                setChatScore(0);
            }
            
            // Only reset leaderboard if NOT battle royale (Battle Royale accumulates score)
            // UPDATE: Also do not reset for LIVE_VS_AI so MVP can accumulate across rounds
            if (mode !== GameMode.LIVE_VS_NETIZEN && mode !== GameMode.LIVE_VS_AI) {
                setLeaderboard([]);
            }
            
            setLastWinner(null);
            setLiveAttempts([]);
            setRoastMessage('');
            
            // AI Starts first with a random word from dictionary that matches the length
            const eligibleWords = dictionary.filter(d => d.word.length === wordLength);
            
            if (eligibleWords.length === 0) {
                alert(`Tidak ada kata ${wordLength} huruf di kamus!`);
                setGameState(GameState.IDLE);
                return;
            }

            const randomStart = eligibleWords[Math.floor(Math.random() * eligibleWords.length)];
            executeMove(randomStart.word, 'ai', randomStart.arti, randomStart.bahasa);
        }
    };

    const lastWord = history.length > 0 ? history[0] : null;

    // --- SUB-COMPONENT: Knockout View ---
    const renderKnockoutView = () => {
        // ... (existing code for knockout view)
        if (knockoutPhase === 'LOBBY') {
            return (
                <div className="text-center space-y-6 relative w-full max-w-4xl mx-auto flex flex-col items-center">
                     {/* Connection UI for Knockout - REFACTORED */}
                     {!isConnected && (
                        <div className="bg-slate-800/90 p-4 rounded-xl border border-slate-700 backdrop-blur-sm mb-6 max-w-md mx-auto relative z-30 w-full shadow-xl">
                            <h3 className="text-indigo-400 font-bold mb-4 flex items-center justify-center gap-2 tracking-wide"><Server size={18}/> KONEKSI SERVER LIVE</h3>
                            
                            {/* Tabs */}
                            <div className="flex bg-slate-900/50 p-1 rounded-lg mb-4">
                                <button 
                                    onClick={() => setConnectionMode('cloud')}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-2 ${connectionMode === 'cloud' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                                >
                                    <Cloud size={14} /> Cloud Server
                                </button>
                                <button 
                                    onClick={() => setConnectionMode('local')}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-2 ${connectionMode === 'local' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                                >
                                    <Laptop size={14} /> Localhost
                                </button>
                            </div>

                            <div className="flex gap-2">
                                {connectionMode === 'cloud' ? (
                                    <input 
                                        type="text" 
                                        value={tiktokUsername} 
                                        onChange={(e) => setTiktokUsername(e.target.value)} 
                                        className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white font-mono text-center text-sm outline-none focus:border-indigo-500 placeholder:text-slate-600" 
                                        placeholder="@username_tiktok" 
                                    />
                                ) : (
                                    <input 
                                        type="text" 
                                        value={serverIp} 
                                        onChange={(e) => setServerIp(e.target.value)} 
                                        className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white font-mono text-center text-sm outline-none focus:border-indigo-500 placeholder:text-slate-600" 
                                        placeholder="IP Address (ex: localhost)" 
                                    />
                                )}
                                
                                <button 
                                    onClick={connectionMode === 'cloud' ? handleCloudConnect : handleLocalConnect} 
                                    disabled={isConnecting} 
                                    className={`px-4 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${isConnecting ? 'bg-slate-600' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
                                >
                                    {isConnecting ? <Loader2 size={16} className="animate-spin" /> : <Power size={16} />}
                                    {isConnecting ? '...' : (connectionMode === 'cloud' ? 'MULAI' : 'CONNECT')}
                                </button>
                            </div>
                            
                            <p className="text-[10px] text-slate-500 mt-2 italic">
                                {connectionMode === 'cloud' 
                                    ? '*Server Cloud: Otomatis terhubung ke Railway & TikTok Live.' 
                                    : '*Localhost: Pastikan aplikasi TikTok Live Connector berjalan.'}
                            </p>
                        </div>
                    )}
                    
                    {isConnected && !isStreamConnected && (
                        <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700 backdrop-blur-sm mb-6 max-w-md mx-auto relative z-30 w-full animate-pop-in">
                            <h3 className="text-rose-400 font-bold mb-3 flex items-center justify-center gap-2"><Cast size={18}/> TARGET LIVE STREAM</h3>
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    value={tiktokUsername} 
                                    onChange={(e) => setTiktokUsername(e.target.value)} 
                                    className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white font-mono text-center text-sm outline-none focus:border-rose-500" 
                                    placeholder="Username TikTok (contoh: @official.kpk)" 
                                />
                                <button 
                                    onClick={connectToStream} 
                                    disabled={streamConnecting || !tiktokUsername} 
                                    className={`px-4 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${streamConnecting ? 'bg-slate-600' : 'bg-rose-600 hover:bg-rose-500 text-white'}`}
                                >
                                    {streamConnecting ? <Loader2 size={16} className="animate-spin" /> : <Wifi size={16} />}
                                    {streamConnecting ? '...' : 'JOIN'}
                                </button>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-2">*Wajib diisi jika menggunakan Cloud Server</p>
                        </div>
                    )}

                    {isStreamConnected && (
                        <div className="bg-emerald-500/20 p-2 rounded-lg border border-emerald-500/50 mb-4 inline-block">
                             <span className="text-emerald-300 font-bold text-sm flex items-center gap-2"><Wifi size={16}/> TERHUBUNG: {tiktokUsername || 'Localhost Stream'}</span>
                        </div>
                    )}

                    <div className="p-4 border-2 border-purple-500/50 bg-purple-900/20 rounded-2xl animate-pulse w-full max-w-md">
                        <h2 className="text-2xl font-bold text-purple-300 mb-2">LOBBY TURNAMEN</h2>
                        <p className="text-white text-lg">Ketik <span className="font-mono bg-white text-purple-900 px-2 rounded">JOIN</span> di komentar!</p>
                        <p className="text-sm text-slate-400 mt-2">Peserta: {lobbyPlayers.length} / 8</p>
                        <p className="text-xs text-rose-400 italic">Pemain sebelumnya tidak bisa ikut.</p>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-2 max-w-lg mx-auto w-full">
                        {Array.from({ length: 8 }).map((_, i) => {
                            const p = lobbyPlayers[i];
                            return (
                                <div key={i} className={`flex flex-col items-center p-2 rounded-lg ${p ? 'bg-purple-600/30 border border-purple-500/50' : 'bg-slate-800/30 border border-slate-700/50 border-dashed'}`}>
                                    {p ? (
                                        <>
                                            {p.profilePictureUrl ? (
                                                <img src={p.profilePictureUrl} className="w-8 h-8 md:w-10 md:h-10 rounded-full border border-white/50" />
                                            ) : (
                                                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-slate-700 flex items-center justify-center border border-white/50 text-white font-bold">
                                                    {p.nickname.charAt(0)}
                                                </div>
                                            )}
                                            <span className="text-[10px] truncate w-full text-center mt-1 text-white">{p.nickname.slice(0,8)}</span>
                                        </>
                                    ) : (
                                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center opacity-30">
                                            <User size={20} />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex gap-2 justify-center w-full relative z-50 mt-4">
                         <button 
                            type="button"
                            onClick={simulateJoin}
                            disabled={lobbyPlayers.length >= 8}
                            className="px-4 py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold transition-all shadow-md active:scale-95"
                        >
                            <UserPlus size={16} className="inline mr-1" /> SIMULASI JOIN
                        </button>
                        <button
                            type="button"
                            onClick={resetLobby}
                            disabled={lobbyPlayers.length === 0}
                            className="px-4 py-3 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold transition-all shadow-md active:scale-95"
                        >
                            <Trash2 size={16} className="inline mr-1" /> RESET
                        </button>
                        <button 
                            type="button"
                            onClick={startKnockoutTournament}
                            disabled={lobbyPlayers.length < 8}
                            className="px-8 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-lg shadow-lg transition-all transform hover:scale-105 active:scale-95"
                        >
                            MULAI
                        </button>
                    </div>
                </div>
            );
        }

        // Bracket View
        return (
            <div className="w-full flex flex-col items-center h-full">
                {/* Visual Bracket 8 Players - Responsive Design */}
                <div className="flex justify-between items-center w-full max-w-5xl gap-1 md:gap-2 mb-2 px-1 text-[9px] md:text-xs overflow-x-auto min-w-0">
                    
                    {/* Left Column (QF 1 & 2) */}
                    <div className="flex flex-col gap-4 md:gap-8 w-1/5 min-w-[60px]">
                         {/* Match 0 */}
                        <div className={`p-1 rounded border ${activeMatchIndex === 0 ? 'border-yellow-400 bg-yellow-400/20' : 'border-slate-600 bg-slate-800'}`}>
                            <div className={`p-0.5 truncate ${matches[0].winner?.uniqueId === matches[0].p1?.uniqueId ? 'text-green-400 font-bold' : ''}`}>{matches[0].p1?.nickname}</div>
                            <div className="h-px bg-slate-600 w-full"></div>
                            <div className={`p-0.5 truncate ${matches[0].winner?.uniqueId === matches[0].p2?.uniqueId ? 'text-green-400 font-bold' : ''}`}>{matches[0].p2?.nickname}</div>
                        </div>
                        {/* Match 1 */}
                        <div className={`p-1 rounded border ${activeMatchIndex === 1 ? 'border-yellow-400 bg-yellow-400/20' : 'border-slate-600 bg-slate-800'}`}>
                            <div className={`p-0.5 truncate ${matches[1].winner?.uniqueId === matches[1].p1?.uniqueId ? 'text-green-400 font-bold' : ''}`}>{matches[1].p1?.nickname}</div>
                            <div className="h-px bg-slate-600 w-full"></div>
                            <div className={`p-0.5 truncate ${matches[1].winner?.uniqueId === matches[1].p2?.uniqueId ? 'text-green-400 font-bold' : ''}`}>{matches[1].p2?.nickname}</div>
                        </div>
                    </div>

                    {/* Left Semifinal (Match 4) */}
                    <div className="flex flex-col justify-center w-1/5 min-w-[60px]">
                         <div className={`p-1 rounded border ${activeMatchIndex === 4 ? 'border-yellow-400 bg-yellow-400/20' : 'border-slate-600 bg-slate-800'}`}>
                            <div className={`p-0.5 truncate ${matches[4].winner?.uniqueId === matches[4].p1?.uniqueId ? 'text-green-400 font-bold' : ''}`}>{matches[4].p1 ? matches[4].p1.nickname : '...'}</div>
                            <div className="h-px bg-slate-600 w-full"></div>
                            <div className={`p-0.5 truncate ${matches[4].winner?.uniqueId === matches[4].p2?.uniqueId ? 'text-green-400 font-bold' : ''}`}>{matches[4].p2 ? matches[4].p2.nickname : '...'}</div>
                        </div>
                    </div>

                    {/* Final (Match 6) & Center Arena */}
                    <div className="flex flex-col items-center justify-center w-1/5 min-w-[80px] gap-1 md:gap-2">
                        <div className="text-yellow-400 font-bold text-[10px] md:text-lg">FINAL</div>
                        <div className={`w-full p-1 md:p-2 rounded-lg border-2 text-center ${activeMatchIndex === 6 ? 'border-yellow-400 bg-yellow-400/20' : 'border-slate-500 bg-slate-900'}`}>
                             <div className={`font-bold truncate ${matches[6].winner?.uniqueId === matches[6].p1?.uniqueId ? 'text-green-400' : ''}`}>
                                 {matches[6].p1 ? matches[6].p1.nickname : '...'}
                             </div>
                             <div className="text-[9px] text-slate-500">vs</div>
                             <div className={`font-bold truncate ${matches[6].winner?.uniqueId === matches[6].p2?.uniqueId ? 'text-green-400' : ''}`}>
                                 {matches[6].p2 ? matches[6].p2.nickname : '...'}
                             </div>
                        </div>
                         {knockoutChampion && (
                             <div className="animate-pop-in text-center mt-1">
                                 <Crown size={24} className="text-yellow-400 mx-auto mb-1" />
                                 <div className="text-yellow-300 font-black text-xs md:text-sm">{knockoutChampion.nickname}</div>
                             </div>
                         )}
                    </div>

                    {/* Right Semifinal (Match 5) */}
                    <div className="flex flex-col justify-center w-1/5 min-w-[60px]">
                        <div className={`p-1 rounded border ${activeMatchIndex === 5 ? 'border-yellow-400 bg-yellow-400/20' : 'border-slate-600 bg-slate-800'}`}>
                            <div className={`p-0.5 truncate ${matches[5].winner?.uniqueId === matches[5].p1?.uniqueId ? 'text-green-400 font-bold' : ''}`}>{matches[5].p1 ? matches[5].p1.nickname : '...'}</div>
                            <div className="h-px bg-slate-600 w-full"></div>
                            <div className={`p-0.5 truncate ${matches[5].winner?.uniqueId === matches[5].p2?.uniqueId ? 'text-green-400 font-bold' : ''}`}>{matches[5].p2 ? matches[5].p2.nickname : '...'}</div>
                        </div>
                    </div>

                    {/* Right Column (QF 3 & 4) */}
                    <div className="flex flex-col gap-4 md:gap-8 w-1/5 min-w-[60px]">
                         {/* Match 2 */}
                        <div className={`p-1 rounded border ${activeMatchIndex === 2 ? 'border-yellow-400 bg-yellow-400/20' : 'border-slate-600 bg-slate-800'}`}>
                            <div className={`p-0.5 truncate ${matches[2].winner?.uniqueId === matches[2].p1?.uniqueId ? 'text-green-400 font-bold' : ''}`}>{matches[2].p1?.nickname}</div>
                            <div className="h-px bg-slate-600 w-full"></div>
                            <div className={`p-0.5 truncate ${matches[2].winner?.uniqueId === matches[2].p2?.uniqueId ? 'text-green-400 font-bold' : ''}`}>{matches[2].p2?.nickname}</div>
                        </div>
                        {/* Match 3 */}
                        <div className={`p-1 rounded border ${activeMatchIndex === 3 ? 'border-yellow-400 bg-yellow-400/20' : 'border-slate-600 bg-slate-800'}`}>
                            <div className={`p-0.5 truncate ${matches[3].winner?.uniqueId === matches[3].p1?.uniqueId ? 'text-green-400 font-bold' : ''}`}>{matches[3].p1?.nickname}</div>
                            <div className="h-px bg-slate-600 w-full"></div>
                            <div className={`p-0.5 truncate ${matches[3].winner?.uniqueId === matches[3].p2?.uniqueId ? 'text-green-400 font-bold' : ''}`}>{matches[3].p2?.nickname}</div>
                        </div>
                    </div>
                </div>

                {/* Pre-Match Countdown Overlay */}
                {knockoutPhase === 'BRACKET' && matchStartCountdown !== null && activeMatchIndex !== null && matches[activeMatchIndex] && (
                    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-sm animate-fade-in text-center p-6">
                         <div className="text-purple-400 font-bold tracking-widest text-lg mb-2">
                             {activeMatchIndex >= 6 ? 'BABAK FINAL' : (activeMatchIndex >= 4 ? 'SEMIFINAL' : `PEREMPAT FINAL ${activeMatchIndex + 1}`)}
                         </div>
                         <div className="flex items-center gap-4 md:gap-8 mb-8 scale-110">
                            <div className="flex flex-col items-center animate-slide-up-entry">
                                {matches[activeMatchIndex].p1?.profilePictureUrl ? (
                                    <img src={matches[activeMatchIndex].p1?.profilePictureUrl} className="w-16 h-16 rounded-full border-2 border-indigo-500 mb-2 shadow-lg" />
                                ) : (
                                    <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center border-2 border-indigo-500 mb-2 shadow-lg"><User size={32}/></div>
                                )}
                                <span className="font-bold text-xl">{matches[activeMatchIndex].p1?.nickname}</span>
                            </div>
                            <div className="text-3xl font-black text-rose-500 italic">VS</div>
                            <div className="flex flex-col items-center animate-slide-up-entry" style={{animationDelay: '0.2s'}}>
                                {matches[activeMatchIndex].p2?.profilePictureUrl ? (
                                    <img src={matches[activeMatchIndex].p2?.profilePictureUrl} className="w-16 h-16 rounded-full border-2 border-indigo-500 mb-2 shadow-lg" />
                                ) : (
                                    <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center border-2 border-indigo-500 mb-2 shadow-lg"><User size={32}/></div>
                                )}
                                <span className="font-bold text-xl">{matches[activeMatchIndex].p2?.nickname}</span>
                            </div>
                         </div>
                         <div className="text-slate-400 text-sm mb-4">Mulai dalam</div>
                         <div className="text-8xl font-black text-white">{matchStartCountdown}</div>
                    </div>
                )}

                {/* Active Game Area (Only if playing) */}
                {knockoutPhase === 'BRACKET' && gameState === GameState.PLAYING && activeMatchIndex !== null && matches[activeMatchIndex] && (
                     <div className="w-full max-w-md bg-black/30 p-3 rounded-xl border border-white/10 text-center relative mt-2 md:mt-auto mb-auto">
                        <div className="text-[10px] md:text-xs uppercase tracking-widest text-purple-300 mb-2">
                            {activeMatchIndex >= 6 ? 'BABAK FINAL' : (activeMatchIndex >= 4 ? 'SEMIFINAL' : `PEREMPAT FINAL ${activeMatchIndex + 1}`)}
                        </div>
                        
                        {/* Player Turn Indicator */}
                        <div className="flex items-center justify-center gap-2 md:gap-4 mb-2 md:mb-4 relative">
                             {/* Player 1 */}
                             <div className={`text-right w-1/2 overflow-hidden transition-all duration-300 p-1 rounded-lg ${currentTurnPlayerId === matches[activeMatchIndex].p1?.uniqueId ? 'bg-yellow-500/20 border border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.3)] scale-105' : 'opacity-60'}`}>
                                 <div className="font-bold text-sm md:text-lg truncate">{matches[activeMatchIndex].p1?.nickname}</div>
                                 {currentTurnPlayerId === matches[activeMatchIndex].p1?.uniqueId && (
                                     <div className="text-[9px] md:text-[10px] text-yellow-300 font-bold mt-1">GILIRAN KAMU!</div>
                                 )}
                             </div>
                             
                             <div className="text-xs font-mono text-slate-400 flex flex-col items-center">
                                 <span>VS</span>
                                 <ArrowRightLeft size={12} className="mt-1 opacity-50" />
                             </div>
                             
                             {/* Player 2 */}
                             <div className={`text-left w-1/2 overflow-hidden transition-all duration-300 p-1 rounded-lg ${currentTurnPlayerId === matches[activeMatchIndex].p2?.uniqueId ? 'bg-yellow-500/20 border border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.3)] scale-105' : 'opacity-60'}`}>
                                 <div className="font-bold text-sm md:text-lg truncate">{matches[activeMatchIndex].p2?.nickname}</div>
                                 {currentTurnPlayerId === matches[activeMatchIndex].p2?.uniqueId && (
                                     <div className="text-[9px] md:text-[10px] text-yellow-300 font-bold mt-1">GILIRAN KAMU!</div>
                                 )}
                             </div>
                        </div>

                        {lastWord && <div className="scale-90 md:scale-100"><WordCard data={lastWord} isLatest={true} /></div>}
                        
                        {requiredPrefix ? (
                            <div className={`text-3xl md:text-4xl font-black mt-2 tracking-widest animate-pulse ${currentTurnPlayerId === matches[activeMatchIndex].p1?.uniqueId ? 'text-yellow-400' : 'text-cyan-400'}`}>
                                {requiredPrefix}...
                            </div>
                        ) : (
                             <div className="text-lg md:text-xl text-slate-400 mt-2">Menunggu AI...</div>
                        )}

                        <div className="mt-2">
                             <Timer timeLeft={timeLeft} totalTime={30} />
                        </div>
                     </div>
                )}
                
                {/* Result Screen (Victory/Lose in Knockout) */}
                {(gameState === GameState.VICTORY || gameState === GameState.GAME_OVER) && knockoutPhase === 'BRACKET' && (
                     <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-md animate-fade-in p-6 text-center">
                         <Trophy size={64} className="text-yellow-400 mb-4 animate-bounce" />
                         <h2 className="text-3xl font-black text-white mb-2">{roastMessage}</h2>
                         <p className="text-slate-300 mb-6">{gameOverReason}</p>
                         <div className="flex items-center gap-2 text-indigo-400 text-sm">
                            <Clock size={16} className="animate-spin" />
                            <span>Menunggu pertandingan selanjutnya...</span>
                         </div>
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
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${isStreamConnected ? 'bg-emerald-500/10 border-emerald-500/30' : (isConnected ? 'bg-amber-500/10 border-amber-500/30' : 'bg-rose-500/10 border-rose-500/30')}`}>
                        {isConnecting || streamConnecting ? <Loader2 size={14} className="animate-spin" /> : (isStreamConnected ? <Wifi size={14} className="text-emerald-400" /> : <WifiOff size={14} className={isConnected ? "text-amber-400" : "text-rose-500"} />)}
                        <span className={`text-[10px] font-bold ${isStreamConnected ? 'text-emerald-400' : (isConnected ? 'text-amber-400' : 'text-rose-400')}`}>
                            {isConnecting || streamConnecting ? "CONNECTING..." : (isStreamConnected ? "LIVE CONNECTED" : (isConnected ? "SERVER CONNECTED" : "DISCONNECTED"))}
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
                        renderKnockoutView()
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
                                         <div className="w-full bg-slate-800/80 p-4 rounded-xl border border-slate-700/50 shadow-2xl backdrop-blur-sm">
                                            <div className="flex justify-between items-center mb-4 pb-2 border-b border-white/5">
                                                <label className="text-xs text-indigo-300 font-bold uppercase tracking-wider flex items-center gap-2"><Globe size={14} /> PENGATURAN KONEKSI</label>
                                            </div>
                                            
                                            {/* Connection Tabs */}
                                            <div className="flex bg-slate-900/50 p-1 rounded-lg mb-4">
                                                <button 
                                                    onClick={() => setConnectionMode('cloud')}
                                                    className={`flex-1 py-2 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-2 ${connectionMode === 'cloud' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                                                >
                                                    <Cloud size={14} /> Cloud Server
                                                </button>
                                                <button 
                                                    onClick={() => setConnectionMode('local')}
                                                    className={`flex-1 py-2 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-2 ${connectionMode === 'local' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                                                >
                                                    <Laptop size={14} /> Localhost
                                                </button>
                                            </div>

                                            {/* Input Area based on Mode */}
                                            <div className="space-y-3">
                                                {connectionMode === 'cloud' ? (
                                                    <div>
                                                        <label className="text-[10px] text-slate-400 mb-1 block">Username TikTok</label>
                                                        <div className="flex gap-2">
                                                            <input 
                                                                type="text" 
                                                                value={tiktokUsername} 
                                                                onChange={(e) => setTiktokUsername(e.target.value)} 
                                                                className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white font-mono text-center outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-600" 
                                                                placeholder="@username_tiktok" 
                                                            />
                                                        </div>
                                                        <p className="text-[10px] text-slate-500 mt-2 italic text-center">*Otomatis terhubung ke server cloud & stream.</p>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <label className="text-[10px] text-slate-400 mb-1 block">IP Server Localhost</label>
                                                        <div className="flex gap-2">
                                                            <input 
                                                                type="text" 
                                                                value={serverIp} 
                                                                onChange={(e) => setServerIp(e.target.value)} 
                                                                className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white font-mono text-center outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-600" 
                                                                placeholder="localhost:8081" 
                                                            />
                                                        </div>
                                                        <p className="text-[10px] text-slate-500 mt-2 italic text-center">*Pastikan aplikasi TikTok Live Connector berjalan.</p>
                                                    </div>
                                                )}

                                                <button 
                                                    onClick={connectionMode === 'cloud' ? handleCloudConnect : handleLocalConnect} 
                                                    disabled={isConnecting} 
                                                    className={`w-full px-6 py-3 rounded-lg font-bold text-sm shadow-lg transition-all flex items-center justify-center gap-2 ${isConnecting ? 'bg-slate-600 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white transform hover:scale-[1.02] active:scale-95'}`}
                                                >
                                                    {isConnecting ? <Loader2 className="animate-spin" /> : <Power />} 
                                                    {isConnecting ? 'MENGHUBUNGKAN...' : (connectionMode === 'cloud' ? 'MULAI' : 'HUBUNGKAN SERVER')}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ) : !isStreamConnected ? (
                                    <div className="flex flex-col items-center gap-4 w-full max-w-sm mx-auto animate-pop-in">
                                        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-center mb-2 w-full flex flex-col items-center gap-2">
                                            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                                <Server size={20} className="text-emerald-400" />
                                            </div>
                                            <div>
                                                <p className="text-emerald-300 font-bold text-sm">Server Terhubung!</p>
                                                <p className="text-slate-400 text-[10px]">{serverIp}</p>
                                            </div>
                                        </div>
                                        
                                        {/* Only show this input if NOT auto-joining (i.e. Manual Localhost flow) */}
                                        <div className="w-full bg-slate-800/80 p-4 rounded-xl border border-rose-500/50 shadow-xl backdrop-blur-sm">
                                            <div className="flex justify-between items-center mb-2">
                                                <label className="text-xs text-rose-300 font-bold uppercase tracking-wider flex items-center gap-2"><Cast size={14} /> TARGET LIVE STREAM</label>
                                            </div>
                                            <div className="flex gap-2">
                                                <input 
                                                    type="text" 
                                                    value={tiktokUsername} 
                                                    onChange={(e) => setTiktokUsername(e.target.value)} 
                                                    className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white font-mono text-center outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all placeholder:text-slate-600" 
                                                    placeholder="@username" 
                                                />
                                                <button 
                                                    onClick={connectToStream} 
                                                    disabled={streamConnecting || !tiktokUsername} 
                                                    className={`px-4 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${streamConnecting ? 'bg-slate-600' : 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg'}`}
                                                >
                                                    {streamConnecting ? <Loader2 size={16} className="animate-spin" /> : <Wifi size={16} />}
                                                    {streamConnecting ? '...' : 'JOIN'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <button onClick={startGame} className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xl shadow-lg transform hover:scale-105 transition-all flex items-center gap-3 mx-auto animate-pop-in">
                                        <Play fill="currentColor" /> MULAI GAME
                                    </button>
                                )}
                            </div>
                        ) : gameState === GameState.PLAYING ? (
                             <div className="w-full max-w-xl flex flex-col items-center">
                                {/* Score & Board for Non-Knockout */}
                                <div className="absolute top-4 w-full px-4 flex justify-center z-20 pointer-events-none">
                                    {mode === GameMode.LIVE_VS_AI ? (
                                        <div className="w-full flex flex-col md:flex-row justify-between items-center md:items-start gap-2">
                                            {/* AI vs Netizen Score */}
                                            <div className="flex-1 w-full md:w-auto flex justify-between bg-black/40 backdrop-blur-sm border border-indigo-500/30 rounded-xl p-2 max-w-sm shadow-lg pointer-events-auto">
                                                <div className="flex flex-col items-center">
                                                    <span className="text-3xl md:text-4xl font-black text-rose-400">{aiScore}</span>
                                                    <span className="text-[10px] md:text-xs font-bold bg-rose-500/20 px-2 py-0.5 rounded text-rose-200">AI BOT</span>
                                                </div>
                                                <div className="flex flex-col items-center">
                                                    <span className="text-3xl md:text-4xl font-black text-emerald-400">{chatScore}</span>
                                                    <span className="text-[10px] md:text-xs font-bold bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-200">NETIZEN</span>
                                                </div>
                                            </div>
                                            
                                            {/* MVP Leaderboard for Co-op */}
                                            <div className="w-full md:w-48 bg-black/40 backdrop-blur-sm border border-amber-500/30 rounded-xl p-2 pointer-events-auto">
                                                 <div className="flex items-center justify-between mb-1 pb-1 border-b border-white/10">
                                                    <div className="flex items-center gap-1 text-amber-400 font-bold text-[10px] uppercase tracking-widest"><Trophy size={10} /> Top 5 MVP</div>
                                                    <button onClick={clearLeaderboard} className="text-slate-500 hover:text-rose-400 transition-colors" title="Hapus Data">
                                                        <Trash2 size={10} />
                                                    </button>
                                                </div>
                                                {leaderboard.slice(0, 5).map((player, idx) => (
                                                    <div key={player.uniqueId} className="flex items-center justify-between text-[10px] mb-1">
                                                        <div className="flex items-center gap-1 overflow-hidden">
                                                            <span className={`font-bold ${idx === 0 ? 'text-yellow-400' : 'text-gray-300'}`}>{idx + 1}</span> 
                                                            <span className="truncate max-w-[80px] md:max-w-none">{player.nickname}</span>
                                                        </div>
                                                        <span className="font-bold text-amber-400">{player.score}</span>
                                                    </div>
                                                ))}
                                                {leaderboard.length === 0 && <div className="text-[9px] text-slate-500 text-center italic py-1">Belum ada skor</div>}
                                            </div>
                                        </div>
                                    ) : (
                                        // Bug Fix: Only show Battle Royale leaderboard if NOT in Knockout Mode
                                        mode === GameMode.LIVE_VS_NETIZEN && (
                                            <div className="w-full max-w-sm bg-black/40 backdrop-blur-sm border border-amber-500/30 rounded-xl p-2 pointer-events-auto">
                                                <div className="flex items-center justify-between mb-2 pb-1 border-b border-white/10">
                                                    <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-widest"><Trophy size={14} /> Top 5 Leaderboard</div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] text-slate-400">Total Valid: {history.filter(h => h.player === 'chat').length}</span>
                                                        <button onClick={clearLeaderboard} className="text-slate-500 hover:text-rose-400 transition-colors" title="Hapus Data">
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                </div>
                                                {leaderboard.map((player, idx) => (
                                                    <div key={player.uniqueId} className="flex items-center justify-between text-xs mb-1">
                                                        <div className="flex items-center gap-2">
                                                            {idx === 0 && <Crown size={12} className="text-yellow-400" />}
                                                            <span className={`font-bold ${idx === 0 ? 'text-yellow-400' : (idx === 1 ? 'text-gray-300' : (idx === 2 ? 'text-amber-600' : 'text-amber-400'))}`}>#{idx + 1}</span> 
                                                            <span className="truncate max-w-[100px]">{player.nickname}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <Star size={10} className="text-yellow-400 fill-yellow-400" />
                                                            <span className="font-bold">{player.score}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )
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
                                    {requiredPrefix && (
                                        <div className="flex flex-col items-center animate-pulse">
                                            <span className={`text-xs font-bold uppercase tracking-widest mb-2 px-3 py-1 rounded-full border ${isAiTurn ? 'text-rose-400 border-rose-500/30 bg-rose-500/10' : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'}`}>
                                                {isAiTurn ? "GILIRAN AI MENJAWAB" : "GILIRAN NETIZEN"}
                                            </span>
                                            <div className={`text-5xl md:text-7xl font-black drop-shadow-2xl ${isAiTurn ? 'text-rose-500' : 'text-emerald-400'}`}>
                                                {requiredPrefix}...
                                            </div>
                                        </div>
                                    )}
                                    <div className="w-full max-w-md mx-auto"><Timer timeLeft={timeLeft} totalTime={30} /></div>
                                </div>
                             </div>
                        ) : (
                            <div className="text-center animate-pop-in glass p-8 rounded-3xl max-w-md mx-auto relative z-30">
                                {/* Result Screen */}
                                {gameState === GameState.VICTORY ? (
                                     <Trophy size={80} className="text-yellow-400 animate-bounce mx-auto mb-4 drop-shadow-lg" />
                                ) : (
                                     <Skull size={80} className="text-rose-600 animate-pulse mx-auto mb-4 drop-shadow-[0_0_15px_rgba(225,29,72,0.5)]" />
                                )}
                                <h2 className="text-4xl font-black mb-4 uppercase">{mode === GameMode.LIVE_VS_NETIZEN ? 'RONDE SELESAI' : (gameState === GameState.VICTORY ? 'MENANG!' : 'KALAH')}</h2>
                                <p className="text-white font-bold text-lg mb-1 italic">"{roastMessage}"</p>
                                <button onClick={startGame} className="w-full py-4 mt-8 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold text-lg transition-colors shadow-lg">MAIN LAGI</button>
                            </div>
                        )
                    )}

                    {/* MANUAL INPUT BAR IS REMOVED */}
                </div>

                {/* Right Panel: Live Feed */}
                <div className="w-full md:w-80 border-l border-white/5 bg-black/20 backdrop-blur-md flex flex-col z-20 h-[30vh] md:h-auto border-t md:border-t-0 shrink-0">
                    <div className="p-3 bg-slate-900/80 border-b border-white/5 flex items-center justify-between">
                        <span className="font-bold text-xs uppercase tracking-wider flex items-center gap-2"><MessageSquare size={14} /> Live Chat {isStreamConnected ? <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"/> : <span className="w-2 h-2 rounded-full bg-rose-500"/>}</span>
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