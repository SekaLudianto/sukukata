import { DictionaryEntry } from "../types";

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

    // Safety: jika tidak ada vokal (sangat jarang/singkatan), kembalikan kata utuh
    if (lastVowelIndex === -1) return w;

    // Cek karakter sebelum vokal terakhir
    const prevIndex = lastVowelIndex - 1;
    
    // Jika vokal ada di huruf pertama (misal: UBI), kembalikan kata utuh
    if (prevIndex < 0) return w;

    const prevChar = w[prevIndex];

    if (!isVowel(prevChar)) {
        // KASUS 1: Didahului Konsonan (Pola Standar)
        // Contoh: BA-TUK (Vokal U, didahului T). Suffix: TUK
        // Contoh: MA-KAN (Vokal A, didahului K). Suffix: KAN
        return w.slice(prevIndex);
    } else {
        // KASUS 2: Didahului Vokal (Urutan Vokal-Vokal / V-V)
        
        // Cek apakah ada huruf mati (koda) setelah vokal terakhir?
        const hasCoda = lastVowelIndex < len - 1;

        if (hasCoda) {
            // Pola: ...VVC(C) (Ada huruf mati di belakang)
            // Ini biasanya memisahkan vokal tersebut. Kita potong di antara vokal.
            // Contoh: SA-ING. (Akhiran NG). Vokal terakhir I. Sebelumnya A. 
            // Karena ada NG, kita ambil mulai dari I. -> ING.
            // Contoh: DA-UN. -> UN.
            // Contoh: BA-UNG. -> UNG.
            // Contoh: KA-IL. -> IL.
            return w.slice(lastVowelIndex);
        } else {
            // Pola: ...VV (Berakhiran Vokal Ganda)
            // Ini biasanya dianggap satu kesatuan bunyi (diftong) dalam permainan kata.
            // Kita ambil konsonan sebelum pasangan vokal ini.
            
            const prePrevIndex = prevIndex - 1;
            if (prePrevIndex >= 0) {
                // Contoh: PAN-TAI. Vokal terakhir I. Sebelumnya A. Tidak ada ekor.
                // Ambil T sebelumnya. -> TAI.
                // Contoh: PU-LAU. -> LAU.
                // Contoh: SE-POI. -> POI.
                return w.slice(prePrevIndex);
            } else {
                // Kata dimulai dengan Vokal ganda (jarang untuk 5 huruf).
                return w;
            }
        }
    }
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
    // Kita cari persis word-nya
    const entry = dictionary.find(d => d.word.toUpperCase() === w);
    if (!entry) {
        return { valid: false, error: "Gak ada di kamus!" };
    }

    return { valid: true, entry };
};