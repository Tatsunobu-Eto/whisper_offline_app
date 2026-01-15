import React, { useState, useEffect, useRef } from 'react';
import { Mic, Loader2, Play, Square, Volume2, Settings, Wifi, WifiOff, AlertCircle, Clock, MessageSquareText, AlignLeft, Users } from 'lucide-react';
import { clsx } from 'clsx';
import { AudioProcessor } from '../utils/audio';

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
  let hash = 0;
  for (let i = 0; i < speaker.length; i++) {
    hash = speaker.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export const RealtimeView: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcripts, setTranscripts] = useState<{ text: string, type: 'final', id: string, timestamp?: number }[]>([]);
  const [partialTranscript, setPartialTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [viewMode, setViewMode] = useState<'speaker' | 'text'>('speaker');
  
  const socketRef = useRef<WebSocket | null>(null);
  const audioProcessorRef = useRef<AudioProcessor | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  
  // Waveform
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveformDataRef = useRef<number[]>(new Array(100).fill(0));

  // Load devices
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(devs => {
      const audioInputs = devs.filter(d => d.kind === 'audioinput');
      setDevices(audioInputs);
      if (audioInputs.length > 0 && !selectedDevice) {
        setSelectedDevice(audioInputs[0].deviceId);
      }
    }).catch(err => console.error("Error fetching devices:", err));
  }, []);

  // Smart Auto-scroll logic
  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
      shouldAutoScrollRef.current = isNearBottom;
    }
  };

  useEffect(() => {
    if (scrollRef.current && shouldAutoScrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcripts, partialTranscript, viewMode]);

  // Waveform Animation
  useEffect(() => {
    let animationFrameId: number;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    const draw = () => {
      if (canvas && ctx) {
        const width = canvas.width;
        const height = canvas.height;
        const data = waveformDataRef.current;
        
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#f3f4f6'; 
        ctx.fillRect(0, 0, width, height);
        
        const barWidth = width / data.length;
        
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        
        for (let i = 0; i < data.length; i++) {
            const x = i * barWidth;
            const value = data[i]; 
            const barHeight = Math.max(2, value * height);
            
            ctx.fillStyle = isRecording ? '#3b82f6' : '#d1d5db'; 
            ctx.fillRect(x, (height - barHeight) / 2, barWidth - 1, barHeight);
        }
      }
      animationFrameId = requestAnimationFrame(draw);
    };
    
    draw();
    return () => cancelAnimationFrame(animationFrameId);
  }, [isRecording]);

  const startRecording = async () => {
    try {
      setError(null);
      setTranscripts([]);
      setPartialTranscript(null);
      setConnectionStatus("connecting");
      
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = 'localhost:8000'; 
      socketRef.current = new WebSocket(`${protocol}//${host}/api/v1/transcribe/stream`);
      
      socketRef.current.onopen = () => {
        console.log("WebSocket connected");
        setConnectionStatus("connected");
      };
      
      socketRef.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'final') {
          setTranscripts(prev => [...prev, { 
              text: data.text, 
              type: 'final', 
              id: Math.random().toString(),
              timestamp: data.timestamp 
          }]);
          setPartialTranscript(null);
        } else if (data.type === 'partial') {
          setPartialTranscript(data.text);
        }
      };
      
      socketRef.current.onerror = (err) => {
        console.error("WebSocket error", err);
        setError("接続エラー。バックエンドを確認してください。");
        setConnectionStatus("disconnected");
        stopRecording();
      };
      
      socketRef.current.onclose = () => {
        setConnectionStatus("disconnected");
      };

      // Initialize Audio
      audioProcessorRef.current = new AudioProcessor((audioData) => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(audioData.buffer);
          
          let sum = 0;
          for (let i = 0; i < audioData.length; i++) {
            sum += audioData[i] * audioData[i];
          }
          const rms = Math.sqrt(sum / audioData.length);
          
          waveformDataRef.current.shift();
          waveformDataRef.current.push(rms * 5); 
        }
      });
      
      await audioProcessorRef.current.start(selectedDevice);
      setIsRecording(true);
      
    } catch (err: any) {
      setError(err.message || "録音の開始に失敗しました");
      setConnectionStatus("disconnected");
      stopRecording();
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (audioProcessorRef.current) {
      audioProcessorRef.current.stop();
      audioProcessorRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    setConnectionStatus("disconnected");
    waveformDataRef.current = new Array(100).fill(0);
  };

  // Render Helpers
  const formatTime = (timestamp?: number) => {
    if (!timestamp) return "";
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex items-center justify-between shrink-0">
        <div>
            <h2 className="text-2xl font-bold text-gray-800">リアルタイム文字起こし</h2>
            <p className="text-gray-500 text-sm">AI VAD搭載・高精度音声認識システム</p>
        </div>
        
        <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 bg-white px-3 py-1 rounded-full border shadow-sm">
                <Settings className="w-4 h-4 text-gray-400" />
                <select 
                    value={selectedDevice} 
                    onChange={(e) => setSelectedDevice(e.target.value)}
                    disabled={isRecording}
                    className="text-sm bg-transparent border-none focus:ring-0 text-gray-600 max-w-[150px] truncate"
                >
                    {devices.map(d => (
                        <option key={d.deviceId} value={d.deviceId}>
                            {d.label || `Microphone ${d.deviceId.slice(0,5)}...`}
                        </option>
                    ))}
                    {devices.length === 0 && <option>マイクが見つかりません</option>}
                </select>
            </div>

            <button
            onClick={isRecording ? stopRecording : startRecording}
            className={clsx(
                "flex items-center px-6 py-3 rounded-full font-bold transition-all shadow-md",
                isRecording 
                    ? "bg-red-500 hover:bg-red-600 text-white animate-pulse" 
                    : "bg-blue-600 hover:bg-blue-700 text-white"
            )}
            >
            {isRecording ? (
                <><Square className="w-5 h-5 mr-2 fill-current" /> 停止</>
            ) : (
                <><Play className="w-5 h-5 mr-2 fill-current" /> 開始</>
            )}
            </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 shrink-0 flex items-center">
            <AlertCircle className="w-5 h-5 mr-2" />
            {error}
        </div>
      )}

      {/* Visualizer */}
      <div className="bg-white p-4 rounded-xl border shadow-sm flex items-center space-x-4 shrink-0 h-24">
        <div className="flex flex-col justify-center items-center w-24 border-r pr-4 text-xs text-gray-400 space-y-2">
            <div className="flex items-center">
                {connectionStatus === "connected" ? (
                    <Wifi className="w-4 h-4 text-green-500 mr-1" />
                ) : (
                    <WifiOff className="w-4 h-4 text-gray-400 mr-1" />
                )}
                <span className={connectionStatus === "connected" ? "text-green-600" : ""}>
                    {connectionStatus === "connected" ? "接続中" : "未接続"}
                </span>
            </div>
            <div>
                16kHz
            </div>
        </div>
        
        <div className="flex-1 h-full relative overflow-hidden">
            <canvas 
                ref={canvasRef} 
                width={600} 
                height={64} 
                className="w-full h-full"
            />
        </div>
      </div>

      {/* Transcription Area */}
      <div className="flex-1 bg-white rounded-xl border shadow-sm flex flex-col overflow-hidden min-h-0">
        <div className="p-4 border-b bg-gray-50 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-4">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">ライブトランスクリプト</span>
                
                {/* View Toggle */}
                <div className="flex bg-gray-100 rounded-lg p-1">
                    <button 
                        onClick={() => setViewMode('speaker')}
                        className={clsx(
                            "px-3 py-1 text-xs font-medium rounded-md flex items-center transition-all",
                            viewMode === 'speaker' ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"
                        )}
                    >
                        <Users className="w-3 h-3 mr-1" /> 話者表示
                    </button>
                    <button 
                        onClick={() => setViewMode('text')}
                        className={clsx(
                            "px-3 py-1 text-xs font-medium rounded-md flex items-center transition-all",
                            viewMode === 'text' ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"
                        )}
                    >
                        <AlignLeft className="w-3 h-3 mr-1" /> テキストのみ
                    </button>
                </div>
            </div>

            {isRecording && (
                <div className="flex items-center text-blue-500 text-xs font-medium">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" /> リッスン中...
                </div>
            )}
        </div>
        
        <div 
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 p-6 overflow-y-auto font-sans leading-relaxed text-gray-700 bg-gray-50/50"
        >
          {transcripts.length === 0 && !isRecording && (
            <div className="h-full flex flex-col items-center justify-center text-gray-300">
                <Mic className="w-12 h-12 mb-2 opacity-20" />
                <p>文字起こしはここに表示されます...</p>
            </div>
          )}
          
          {viewMode === 'speaker' ? (
              <div className="space-y-6">
                {transcripts.map((t) => (
                    <div key={t.id} className="flex flex-col space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="flex items-center space-x-2 mb-1">
                            <div className={clsx("px-2 py-0.5 rounded text-xs font-bold border", getSpeakerColor("User"))}>
                                Speaker
                            </div>
                            <span className="text-xs text-gray-400 font-mono flex items-center">
                                <Clock className="w-3 h-3 mr-1" />
                                {formatTime(t.timestamp)}
                            </span>
                        </div>
                        <div className="bg-white p-3 rounded-lg border shadow-sm text-gray-800 leading-relaxed max-w-4xl">
                            {t.text}
                        </div>
                    </div>
                ))}
                
                {partialTranscript && (
                    <div className="flex flex-col space-y-1 opacity-70">
                         <div className="flex items-center space-x-2 mb-1">
                            <div className={clsx("px-2 py-0.5 rounded text-xs font-bold border", getSpeakerColor("User"))}>
                                Speaker
                            </div>
                            <span className="text-xs text-gray-400 font-mono">
                                ...
                            </span>
                        </div>
                        <div className="bg-white p-3 rounded-lg border border-dashed shadow-sm text-gray-800 leading-relaxed max-w-4xl">
                            {partialTranscript}
                        </div>
                    </div>
                )}
              </div>
          ) : (
              <div className="bg-white p-6 rounded-lg border shadow-sm text-gray-800 whitespace-pre-wrap font-mono leading-relaxed min-h-[200px]">
                  {transcripts.map(t => t.text).join('')}
                  {partialTranscript}
                  {partialTranscript && <span className="animate-pulse">|</span>}
              </div>
          )}
        </div>
      </div>
    </div>
  );
};
