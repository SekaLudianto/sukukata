import { DictionaryEntry } from "../types";

/**
 * Cek apakah kata layak dimainkan dalam game sambung kata secara struktural.
 * Kata dianggap layak jika memiliki vokal pada 3 huruf terakhirnya.
 * Ini untuk menghindari singkatan seperti RAPBN, PBB, dll yang mungkin lolos filter metadata.
 */
export const isPlayableWord = (word: string): boolean => {
    if (!word || word.length !== 5) return false;
    
    const w = word.toUpperCase();
    const vowels = ['A', 'E', 'I', 'O', 'U'];
    
    // Cek apakah ada vokal di indeks 2, 3, atau 4 (3 huruf terakhir)
    // Contoh: RAPBN -> P(2), B(3), N(4) -> Tidak ada vokal -> False
    // Contoh: BATUK -> T(2), U(3), K(4) -> Ada U -> True
    return vowels.some(v => w[2] === v || w[3] === v || w[4] === v);
};

/**
 * Validasi item kamus secara menyeluruh.
 * Memeriksa struktur kata dan metadata (bahasa/jenis kata).
 */
export const isValidDictionaryItem = (item: any): boolean => {
    // 1. Validasi bentuk data dasar
    if (!item || typeof item !== 'object') return false;
    if (typeof item.word !== 'string' || item.word.length !== 5) return false;
    if (!item.arti) return false;

    // 2. Filter berdasarkan metadata 'bahasa'
    // Jika ditandai sebagai singkatan, akronim, atau kependekan -> TOLAK
    if (item.bahasa) {
        const bahasa = item.bahasa.toLowerCase();
        if (bahasa.includes('singkatan') || 
            bahasa.includes('akronim') || 
            bahasa.includes('kependekan')) {
            return false;
        }
    }

    // 3. Filter berdasarkan struktur kata (Phonotactics)
    // Memastikan kata memiliki vokal yang cukup untuk dipotong menjadi suku kata
    return isPlayableWord(item.word);
};

/**
 * Logika Pengecekan Suffix (Akhiran) untuk Sambung Kata.
 * Aturan:
 * 1. Umum: Ambil Konsonan + Vokal Terakhir + Ekor. Contoh: BATUK -> TUK.
 * 2. Diftong Akhir (Vokal Ganda di ujung): Ambil Konsonan + Vokal Ganda. Contoh: PANTAI -> TAI, PULAU -> LAU.
 * 3. Hiatus (Vokal Ganda di tengah): Ambil Vokal Terakhir + Ekor. Contoh: SAING -> ING, DAUN -> UN, KAIL -> IL.
 */
export const getSyllableSuffix = (word: string): string => {
    const w = word.toUpperCase();
    const len = w.length;
    
    // Jika kata terlalu pendek, gunakan seluruh kata
    if (len < 3) return w; 

    const isVowel = (char: string) => ['A', 'E', 'I', 'O', 'U'].includes(char);
    
    // 1. Cari posisi vokal terakhir
    let lastVowelIndex = -1;
    for (let i = len - 1; i >= 0; i--) {
        if (isVowel(w[i])) {
            lastVowelIndex = i;
            break;
        }
    }

    // Fallback: jika tidak ada vokal, atau vokal terlalu di depan (seperti singkatan RAPBN),
    // Ambil 3 huruf terakhir.
    if (lastVowelIndex === -1 || lastVowelIndex < 2) {
        return w.slice(-3);
    }

    // Cek karakter sebelum vokal terakhir
    const prevIndex = lastVowelIndex - 1;
    const prevChar = w[prevIndex];

    let suffix = w;

    if (!isVowel(prevChar)) {
        // KASUS 1: Didahului Konsonan (Pola Standar)
        // Contoh: BA-TUK (Vokal U, didahului T). Suffix: TUK
        suffix = w.slice(prevIndex);
    } else {
        // KASUS 2: Didahului Vokal (Urutan Vokal-Vokal / V-V)
        
        // Cek apakah ada huruf mati (koda) setelah vokal terakhir?
        const hasCoda = lastVowelIndex < len - 1;

        if (hasCoda) {
            // Pola: ...VVC(C)
            // Contoh: SA-ING -> ING.
            suffix = w.slice(lastVowelIndex);
        } else {
            // Pola: ...VV (Berakhiran Vokal Ganda)
            const prePrevIndex = prevIndex - 1;
            if (prePrevIndex >= 0) {
                // Contoh: PAN-TAI -> TAI.
                suffix = w.slice(prePrevIndex);
            } else {
                suffix = w;
            }
        }
    }
    
    // Safety Net: Jika hasil suffix sama dengan kata utuh (untuk kata 5 huruf),
    // paksa ambil 3 huruf terakhir agar permainan tetap seru.
    if (suffix.length === w.length && w.length === 5) {
        return w.slice(-3);
    }

    return suffix;
};

export const findAIWord = (
    dictionary: DictionaryEntry[],
    requiredPrefix: string,
    usedWords: Set<string>
): DictionaryEntry | null => {
    const prefix = requiredPrefix.toUpperCase();
    
    // Filter kata yang valid:
    // 1. 5 Huruf
    // 2. Dimulai dengan prefix yang diminta
    // 3. Belum pernah dipakai
    const candidates = dictionary.filter(entry => {
        const w = entry.word.toUpperCase();
        return (
            w.length === 5 &&
            w.startsWith(prefix) &&
            !usedWords.has(w)
        );
    });

    if (candidates.length === 0) return null;

    // Strategi AI:
    // Prioritaskan kata yang akhiran suku katanya sulit, 
    // tapi untuk sekarang kita ambil acak agar permainan variatif.
    const randomIndex = Math.floor(Math.random() * candidates.length);
    return candidates[randomIndex];
};

export const validateUserWord = (
    word: string,
    dictionary: DictionaryEntry[],
    requiredPrefix: string | null,
    usedWords: Set<string>
): { valid: boolean; error?: string; entry?: DictionaryEntry } => {
    const w = word.toUpperCase();
    
    // Cek Panjang
    if (w.length !== 5) {
        return { valid: false, error: "Harus 5 huruf pas!" };
    }

    // Cek Prefix (jika bukan giliran pertama)
    if (requiredPrefix && !w.startsWith(requiredPrefix.toUpperCase())) {
        return { valid: false, error: `Harus diawali "${requiredPrefix}"` };
    }

    // Cek Duplikasi
    if (usedWords.has(w)) {
        return { valid: false, error: "Kata sudah dipakai!" };
    }

    // Cek Kamus
    const entry = dictionary.find(d => d.word.toUpperCase() === w);
    if (!entry) {
        return { valid: false, error: "Gak ada di kamus!" };
    }

    return { valid: true, entry };
};