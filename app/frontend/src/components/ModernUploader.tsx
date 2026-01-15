import React, { useState, useRef } from 'react';
import { Upload, FileAudio, Loader2, Users } from 'lucide-react';
import { clsx } from 'clsx';
import { transcribeFileStream } from '../api/client';

interface ModernUploaderProps {
  onTranscriptionComplete: () => void;
}

export const ModernUploader: React.FC<ModernUploaderProps> = ({ onTranscriptionComplete }) => {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [percent, setPercent] = useState(0);
  const [enableDiarization, setEnableDiarization] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcribedText, setTranscribedText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setTranscribedText("");
    setProgress("初期化中...");
    
    await transcribeFileStream(
        file,
        enableDiarization,
        (data) => {
            if (data.type === 'status') {
                if (data.status === 'completed') {
                    setLoading(false);
                    setPercent(100);
                    setProgress("完了しました！");
                    onTranscriptionComplete();
                } else if (data.status === 'diarizing') {
                    setProgress("話者分離を実行中...（時間がかかる場合があります）");
                    setPercent(99); // Cap at 99 during post-processing
                } else {
                    setProgress(`ステータス: ${data.status}`);
                }
            } else if (data.type === 'segment') {
                setTranscribedText(prev => prev + data.text);
                if (data.progress !== undefined) {
                    setPercent(data.progress);
                }
            } else if (data.type === 'error') {
                setError(data.message);
                setLoading(false);
            }
        },
        (errMsg) => {
            setError(errMsg);
            setLoading(false);
        }
    );
  };

  return (
    <div className="mx-auto space-y-6">
      
      {/* Top Section: Split Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left: Drop Area */}
          <div 
            className={clsx(
              "md:col-span-2 relative border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center transition-all duration-200 cursor-pointer bg-gray-50 min-h-[200px]",
              dragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400",
              loading && "opacity-50 pointer-events-none"
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input 
              ref={fileInputRef}
              type="file" 
              accept="audio/*" 
              className="hidden" 
              onChange={handleChange}
            />
            
            {file ? (
                <div className="flex flex-col items-center">
                    <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
                        <FileAudio className="w-8 h-8" />
                    </div>
                    <p className="font-medium text-lg text-gray-800">{file.name}</p>
                    <p className="text-sm text-gray-500 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    <button 
                        onClick={(e) => { e.stopPropagation(); setFile(null); }}
                        className="mt-4 text-sm text-red-500 hover:underline"
                    >
                        ファイルを削除
                    </button>
                </div>
            ) : (
                <>
                    <div className="w-16 h-16 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center mb-4">
                        <Upload className="w-8 h-8" />
                    </div>
                    <p className="font-medium text-lg text-gray-700 text-center">クリックしてアップロード<br/>またはドラッグ＆ドロップ</p>
                    <p className="text-sm text-gray-500 mt-2">WAV, MP3, M4A (最大2GB)</p>
                </>
            )}
          </div>

          {/* Right: Settings */}
          <div className="md:col-span-1">
              <div className="bg-white p-6 rounded-xl border shadow-sm h-full flex flex-col justify-center">
                  <div className="flex items-center space-x-2 mb-3">
                      <Users className="w-5 h-5 text-gray-600" />
                      <span className="font-medium text-gray-800">話者分離設定</span>
                  </div>
                  <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                      会議やインタビューなど、複数人が話している音声の話者を識別します。
                  </p>
                  
                  <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg border">
                      <span className="text-sm font-medium text-gray-700">有効にする</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                              type="checkbox" 
                              className="sr-only peer" 
                              checked={enableDiarization}
                              onChange={(e) => setEnableDiarization(e.target.checked)}
                              disabled={loading}
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                  </div>
              </div>
          </div>
      </div>

      <div className="space-y-2">
        <button
          onClick={handleUpload}
          disabled={!file || loading}
          className={clsx(
              "w-full py-4 px-4 rounded-lg font-bold text-white shadow-sm flex items-center justify-center transition-all text-lg",
              !file || loading 
                  ? "bg-gray-400 cursor-not-allowed" 
                  : "bg-blue-600 hover:bg-blue-700 active:transform active:scale-[0.99]"
          )}
        >
          {loading ? (
              <>
                  <Loader2 className="w-6 h-6 mr-2 animate-spin" />
                  {progress || "処理中..."}
              </>
          ) : (
              "文字起こしを開始"
          )}
        </button>

        {loading && (
          <div className="space-y-1 mt-4">
            <div className="flex justify-between text-xs font-medium text-gray-500">
                <span>全体の進捗</span>
                <span>{percent}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div 
                    className="bg-blue-600 h-full transition-all duration-500 ease-out"
                    style={{ width: `${percent}%` }}
                />
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
            {error}
        </div>
      )}

      {/* Live Preview */}
      {transcribedText && (
        <div className="mt-8 border-t pt-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">ライブプレビュー</h3>
            <div className="bg-gray-50 p-4 rounded-lg border text-sm text-gray-700 max-h-96 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed shadow-inner">
                {transcribedText}
            </div>
        </div>
      )}
    </div>
  );
};
