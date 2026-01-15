import React, { useEffect, useState, useRef } from 'react';
import { getSessionDetail } from '../api/client';
import { ArrowLeft, Download, Clock, MessageSquareText } from 'lucide-react';
import { clsx } from 'clsx';

interface TranscriptionViewProps {
  sessionId: string;
  onBack: () => void;
}

// Generate consistent colors for speakers
const getSpeakerColor = (speaker: string) => {
  if (!speaker) return 'bg-gray-100 text-gray-800 border-gray-200';
  const colors = [
    'bg-blue-100 text-blue-800 border-blue-200',
    'bg-green-100 text-green-800 border-green-200',
    'bg-purple-100 text-purple-800 border-purple-200',
    'bg-orange-100 text-orange-800 border-orange-200',
    'bg-pink-100 text-pink-800 border-pink-200',
    'bg-indigo-100 text-indigo-800 border-indigo-200',
  ];
  // Simple hash to pick color
  let hash = 0;
  for (let i = 0; i < speaker.length; i++) {
    hash = speaker.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export const TranscriptionView: React.FC<TranscriptionViewProps> = ({ sessionId, onBack }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await getSessionDetail(sessionId);
        setData(result);
      } catch (err: any) {
        setError(err.message || "詳細の読み込みに失敗しました");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [sessionId]);

  if (loading) return <div className="p-8 text-center">詳細を読み込み中...</div>;
  if (error) return <div className="p-8 text-center text-red-500">エラー: {error}</div>;
  if (!data) return null;

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-gray-50 flex justify-between items-center shrink-0">
        <div className="flex items-center space-x-4">
          <button 
            onClick={onBack}
            className="p-2 rounded-full hover:bg-gray-200 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h2 className="font-bold text-gray-800">{data.filename}</h2>
            <div className="flex items-center text-xs text-gray-500 space-x-2">
                <span>{new Date(data.created_at).toLocaleString()}</span>
                <span>•</span>
                <span>{data.segments.length} セグメント</span>
            </div>
          </div>
        </div>
        <button className="flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border rounded-md hover:bg-gray-50 shadow-sm">
            <Download className="w-4 h-4 mr-2" />
            エクスポート
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50" ref={scrollRef}>
        {data.diarization ? (
          <div className="space-y-6">
            {data.segments.map((seg: any, idx: number) => {
                const speakerColorClass = getSpeakerColor(seg.speaker);
                
                return (
                    <div key={idx} className="flex flex-col space-y-1">
                        <div className="flex items-center space-x-2 mb-1">
                            <div className={clsx("px-2 py-0.5 rounded text-xs font-bold border", speakerColorClass)}>
                                {seg.speaker || "不明"}
                            </div>
                            <span className="text-xs text-gray-400 font-mono flex items-center">
                                <Clock className="w-3 h-3 mr-1" />
                                {seg.start.toFixed(1)}s - {seg.end.toFixed(1)}s
                            </span>
                        </div>
                        <div className="bg-white p-3 rounded-lg border shadow-sm text-gray-800 leading-relaxed max-w-4xl">
                            {seg.text}
                        </div>
                    </div>
                );
            })}
          </div>
        ) : (
          <div className="max-w-none">
            <div className="flex items-center space-x-2 mb-4">
              <MessageSquareText className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">テキスト表示</h3>
            </div>
            <div className="bg-white p-6 rounded-lg border shadow-sm text-gray-800 whitespace-pre-wrap font-mono leading-relaxed min-h-[200px]">
              {data.segments.map((seg: any) => seg.text).join('')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
