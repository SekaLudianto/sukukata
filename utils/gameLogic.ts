import { DictionaryEntry } from "../types";

/**
 * Cek apakah kata layak dimainkan dalam game sambung kata secara struktural.
 * Kata dianggap layak jika memiliki vokal pada 3 huruf terakhirnya.
 * Ini untuk menghindari singkatan seperti RAPBN, PBB, dll yang mungkin lolos filter metadata.
 */
export const isPlayableWord = (word: string, targetLength: number = 5): boolean => {
    if (!word || word.length !== targetLength) return false;
    
    const w = word.toUpperCase();
    const vowels = ['A', 'E', 'I', 'O', 'U'];
    
    // Cek apakah ada vokal di 3 huruf terakhir (atau menyesuaikan panjang kata)
    // Untuk kata pendek (<4), cek semua huruf. Untuk kata panjang, cek 3 terakhir.
    const checkLimit = Math.min(3, targetLength);
    let hasVowel = false;
    
    for (let i = 1; i <= checkLimit; i++) {
        if (vowels.includes(w[targetLength - i])) {
            hasVowel = true;
            break;
        }
    }
    
    return hasVowel;
};

/**
 * Validasi item kamus secara menyeluruh.
 * Memeriksa struktur kata dan metadata (bahasa/jenis kata).
 * Diubah agar menerima rentang panjang kata yang lebih luas (4-8 huruf) saat loading awal.
 */
export const isValidDictionaryItem = (item: any): boolean => {
    // 1. Validasi bentuk data dasar
    if (!item || typeof item !== 'object') return false;
    if (typeof item.word !== 'string') return false;
    
    // Allow words between 4 and 8 characters for general dictionary loading
    if (item.word.length < 4 || item.word.length > 8) return false;
    
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
    // Gunakan panjang kata itu sendiri untuk validasi struktural
    return isPlayableWord(item.word, item.word.length);
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
    
    // Safety Net: Jika hasil suffix sama dengan kata utuh,
    // paksa ambil 3 huruf terakhir agar permainan tetap seru.
    if (suffix.length === w.length && w.length >= 3) {
        return w.slice(-3);
    }

    return suffix;
};

export const findAIWord = (
    dictionary: DictionaryEntry[],
    requiredPrefix: string,
    usedWords: Set<string>,
    targetLength: number = 5
): DictionaryEntry | null => {
    const prefix = requiredPrefix.toUpperCase();
    
    // Filter kata yang valid:
    // 1. Sesuai Panjang Target
    // 2. Dimulai dengan prefix yang diminta
    // 3. Belum pernah dipakai
    const candidates = dictionary.filter(entry => {
        const w = entry.word.toUpperCase();
        return (
            w.length === targetLength &&
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
    usedWords: Set<string>,
    targetLength: number = 5
): { valid: boolean; error?: string; entry?: DictionaryEntry } => {
    const w = word.toUpperCase();
    
    // Cek Panjang
    if (w.length !== targetLength) {
        return { valid: false, error: `Harus ${targetLength} huruf pas!` };
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