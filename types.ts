export interface DictionaryEntry {
    word: string;
    arti: string;
    contoh?: string;
    bahasa?: string;
}

export interface GameSettings {
    timerSeconds: number;
    allowMockData: boolean;
}

export interface TurnHistory {
    word: string;
    player: 'user' | 'ai' | 'chat';
    definition: string;
    timestamp: number;
    winnerName?: string; // For Chat winner
    winnerProfilePic?: string; // For Chat winner avatar
    winnerTeam?: 'cewek' | 'cowok'; // For Gender Battle
}

export enum GameState {
    IDLE = 'IDLE',
    PLAYING = 'PLAYING',
    GAME_OVER = 'GAME_OVER',
    VICTORY = 'VICTORY'
}

export enum GameMode {
    SOLO = 'SOLO',
    LIVE_VS_AI = 'LIVE_VS_AI',
    LIVE_VS_NETIZEN = 'LIVE_VS_NETIZEN',
    LIVE_KNOCKOUT = 'LIVE_KNOCKOUT',
    LIVE_BATTLE_GENDER = 'LIVE_BATTLE_GENDER'
}

export interface LeaderboardEntry {
    uniqueId: string;
    nickname: string;
    profilePictureUrl?: string;
    score: number;
    team?: 'cewek' | 'cowok';
}

// IndoFinity Types
export interface TikTokUserData {
    uniqueId: string;
    nickname?: string;
    profilePictureUrl?: string;
    comment?: string;
    giftName?: string;
}

export interface IndoFinityMessage {
    event: 'chat' | 'gift' | 'connected' | 'disconnected';
    data: TikTokUserData;
}

export interface LiveAttempt {
    uniqueId: string;
    nickname?: string;
    profilePictureUrl?: string;
    word: string;
    isValid: boolean;
    reason?: string;
    timestamp: number;
    team?: 'cewek' | 'cowok';
}

// Knockout Types
export interface KnockoutPlayer {
    uniqueId: string;
    nickname: string;
    profilePictureUrl?: string;
}

export interface KnockoutMatch {
    id: number;
    p1: KnockoutPlayer | null;
    p2: KnockoutPlayer | null;
    winner: KnockoutPlayer | null;
    nextMatchId: number | null; // ID of the match the winner goes to
}