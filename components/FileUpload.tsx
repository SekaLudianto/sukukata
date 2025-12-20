import React, { useCallback, useState } from 'react';
import { Upload, FileJson, AlertCircle } from 'lucide-react';
import { DictionaryEntry } from '../types';
import { isValidDictionaryItem } from '../utils/gameLogic';

interface FileUploadProps {
    onLoaded: (data: DictionaryEntry[]) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onLoaded }) => {
    const [error, setError] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);

    const validateAndParse = (text: string) => {
        try {
            const json = JSON.parse(text);
            if (!Array.isArray(json)) throw new Error("Format JSON harus berupa Array.");
            if (json.length === 0) throw new Error("File JSON kosong.");
            
            // Filter only valid entries (correct format, 5 letters, and not abbreviations)
            const validWords = json.filter(isValidDictionaryItem);

            if (validWords.length < 50) {
                throw new Error(`Data valid (5 huruf & playable) < 50 kata. Pastikan format benar dan bukan singkatan.`);
            }

            onLoaded(validWords);
        } catch (err: any) {
            setError(err.message || "Gagal membaca JSON.");
        }
    };

    const handleFile = (file: File) => {
        setError(null);
        if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
            setError("Harap upload file .json");
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            validateAndParse(text);
        };
        reader.readAsText(file);
    };

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    }, []);

    return (
        <div className="w-full">
            <div 
                className={`
                    border border-dashed rounded-xl p-4 md:p-6 text-center transition-all cursor-pointer
                    ${dragging ? 'border-sky-500 bg-sky-500/10' : 'border-slate-600 hover:border-slate-500 hover:bg-slate-800/50'}
                    ${error ? 'border-rose-500/50 bg-rose-900/10' : ''}
                `}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
            >
                <input 
                    type="file" 
                    id="jsonUpload" 
                    className="hidden" 
                    accept=".json"
                    onChange={(e) => e.target.files && handleFile(e.target.files[0])}
                />
                
                <label htmlFor="jsonUpload" className="cursor-pointer flex flex-col items-center gap-2">
                    <div className={`p-2 rounded-full ${error ? 'bg-rose-500/20' : 'bg-slate-700'}`}>
                        {error ? <AlertCircle className="text-rose-400" size={20} /> : <FileJson className="text-sky-400" size={20} />}
                    </div>
                    <div className="space-y-0.5">
                        <p className="font-bold text-sm text-slate-200">
                            {error ? 'Error' : 'Upload JSON'}
                        </p>
                        <p className="text-[10px] md:text-xs text-slate-400 max-w-[200px] mx-auto leading-tight">
                            {error || 'Drag & drop atau klik. Format: [{ "word": "BATUK", "arti": "..." }]'}
                        </p>
                    </div>
                    {error && (
                         <div className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs font-medium transition-colors mt-2">
                            Coba Lagi
                        </div>
                    )}
                </label>
            </div>
        </div>
    );
};