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
}

export enum GameState {
    IDLE = 'IDLE',
    PLAYING = 'PLAYING',
    GAME_OVER = 'GAME_OVER',
    VICTORY = 'VICTORY'
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
}