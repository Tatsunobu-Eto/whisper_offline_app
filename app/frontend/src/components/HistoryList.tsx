import React, { useEffect, useState } from 'react';
import { getSessions, deleteSession, getSessionDetail } from '../api/client';
import { FileAudio, Calendar, Clock, ChevronRight, Trash2, CheckSquare, Square, Download, FileJson, FileText, X } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';

interface HistoryListProps {
  onSelectSession: (sessionId: string) => void;
}

export const HistoryList: React.FC<HistoryListProps> = ({ onSelectSession }) => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  
  // Dialog State
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null); // For single delete
  const [isBulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false); // For bulk delete

  // Export State
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const data = await getSessions();
        setSessions(data);
      } catch (err: any) {
        setError(err.message || "履歴の読み込みに失敗しました");
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  // Selection Handlers
  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === sessions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sessions.map(s => s.id)));
    }
  };

  // Delete Handlers
  const handleDeleteClick = (sessionId: string) => {
    setSessionToDelete(sessionId);
    setConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (sessionToDelete) {
      try {
        await deleteSession(sessionToDelete);
        setSessions(sessions.filter((session) => session.id !== sessionToDelete));
        // Remove from selection if exists
        if (selectedIds.has(sessionToDelete)) {
            const newSelected = new Set(selectedIds);
            newSelected.delete(sessionToDelete);
            setSelectedIds(newSelected);
        }
      } catch (err: any) {
        setError(err.message || "セッションの削除に失敗しました");
      } finally {
        setConfirmOpen(false);
        setSessionToDelete(null);
      }
    }
  };

  const handleBulkDeleteClick = () => {
      setBulkDeleteConfirmOpen(true);
  };

  const handleConfirmBulkDelete = async () => {
    try {
        const ids = Array.from(selectedIds);
        // Execute in parallel
        await Promise.all(ids.map(id => deleteSession(id)));
        
        setSessions(sessions.filter(s => !selectedIds.has(s.id)));
        setSelectedIds(new Set());
        setIsSelectionMode(false);
    } catch (err: any) {
        setError("一部のセッションの削除に失敗しました");
    } finally {
        setBulkDeleteConfirmOpen(false);
    }
  };

  // Export Handlers
  const handleBulkExport = async (format: 'txt' | 'json') => {
      setIsExporting(true);
      try {
          const ids = Array.from(selectedIds);
          // Fetch details for all selected sessions
          const details = await Promise.all(ids.map(id => getSessionDetail(id)));
          
          let content = "";
          let mimeType = "";
          let extension = "";

          if (format === 'json') {
              content = JSON.stringify(details, null, 2);
              mimeType = "application/json";
              extension = "json";
          } else {
              // Text format
              content = details.map(d => {
                  const header = `[${new Date(d.created_at).toLocaleString()}] ${d.filename}`;
                  const body = d.segments.map((s: any) => {
                      const speaker = s.speaker ? `[${s.speaker}] ` : "";
                      return `${speaker}${s.text}`;
                  }).join("\n");
                  return `${header}\n${"-".repeat(header.length)}\n${body}`;
              }).join("\n\n==================================================\n\n");
              mimeType = "text/plain";
              extension = "txt";
          }

          // Trigger download
          const blob = new Blob([content], { type: mimeType });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `whisper_export_${new Date().getTime()}.${extension}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

      } catch (err: any) {
          setError("エクスポートに失敗しました: " + err.message);
      } finally {
          setIsExporting(false);
      }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">履歴を読み込み中...</div>;
  if (error) return <div className="p-8 text-center text-red-500">エラー: {error}</div>;

  if (sessions.length === 0) {
    return (
        <div className="p-8 text-center text-gray-500 bg-white rounded-lg shadow-sm border">
            <p>文字起こしの履歴が見つかりません。</p>
        </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden relative">
        {/* Header / Action Bar */}
        <div className="px-6 py-4 border-b bg-gray-50 flex justify-between items-center h-16">
          {selectedIds.size > 0 ? (
              <div className="flex items-center justify-between w-full animate-in fade-in duration-200">
                  <div className="flex items-center space-x-4">
                      <button 
                        onClick={() => setSelectedIds(new Set())}
                        className="text-gray-500 hover:text-gray-700"
                      >
                          <X className="w-5 h-5" />
                      </button>
                      <span className="font-bold text-blue-600">{selectedIds.size} 件選択中</span>
                  </div>
                  <div className="flex items-center space-x-2">
                      <button 
                        onClick={() => handleBulkExport('txt')}
                        disabled={isExporting}
                        className="flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border rounded-md hover:bg-gray-50 disabled:opacity-50"
                      >
                          {isExporting ? <span className="animate-spin mr-2">⏳</span> : <FileText className="w-4 h-4 mr-2" />}
                          TXT
                      </button>
                      <button 
                        onClick={() => handleBulkExport('json')}
                        disabled={isExporting}
                        className="flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border rounded-md hover:bg-gray-50 disabled:opacity-50"
                      >
                          {isExporting ? <span className="animate-spin mr-2">⏳</span> : <FileJson className="w-4 h-4 mr-2" />}
                          JSON
                      </button>
                      <div className="h-6 w-px bg-gray-300 mx-2"></div>
                      <button 
                        onClick={handleBulkDeleteClick}
                        className="flex items-center px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100"
                      >
                          <Trash2 className="w-4 h-4 mr-2" />
                          削除
                      </button>
                  </div>
              </div>
          ) : (
            <>
                <div className="flex items-center space-x-4">
                    <button 
                        onClick={toggleSelectAll}
                        className="text-gray-400 hover:text-gray-600"
                        title="すべて選択"
                    >
                        {selectedIds.size === sessions.length && sessions.length > 0 ? (
                            <CheckSquare className="w-5 h-5 text-blue-500" />
                        ) : (
                            <Square className="w-5 h-5" />
                        )}
                    </button>
                    <div>
                        <h2 className="font-semibold text-gray-800">最近のセッション</h2>
                        <span className="text-sm text-gray-500">{sessions.length} 件</span>
                    </div>
                </div>
            </>
          )}
        </div>

        {/* List */}
        <div className="divide-y">
          {sessions.map((session) => {
            const isSelected = selectedIds.has(session.id);
            return (
                <div 
                key={session.id} 
                className={`p-4 transition-colors flex items-center justify-between group ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                >
                <div className="flex items-center space-x-4 flex-grow">
                    <div 
                        onClick={(e) => { e.stopPropagation(); toggleSelect(session.id); }}
                        className="cursor-pointer text-gray-400 hover:text-blue-500"
                    >
                        {isSelected ? (
                            <CheckSquare className="w-5 h-5 text-blue-500" />
                        ) : (
                            <Square className="w-5 h-5" />
                        )}
                    </div>

                    <div 
                        className="flex items-center space-x-4 cursor-pointer flex-grow" 
                        onClick={() => onSelectSession(session.id)}
                    >
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                            <FileAudio className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-medium text-gray-800 line-clamp-1 break-all">{session.filename}</h3>
                            <div className="flex items-center space-x-3 text-xs text-gray-500 mt-1">
                                <span className="flex items-center">
                                <Calendar className="w-3 h-3 mr-1" />
                                {new Date(session.created_at).toLocaleDateString()}
                                </span>
                                <span className="flex items-center">
                                <Clock className="w-3 h-3 mr-1" />
                                {new Date(session.created_at).toLocaleTimeString()}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold
                                ${session.status === 'completed' ? 'bg-green-100 text-green-700' : 
                                    session.status === 'error' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}
                                `}>
                                {session.status}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center pl-4">
                    {!isSelected && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClick(session.id);
                            }}
                            className="p-2 rounded-full hover:bg-red-100 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity mr-2"
                            title="セッションを削除"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    )}
                    <ChevronRight 
                        className="w-5 h-5 text-gray-300 cursor-pointer hover:text-blue-500" 
                        onClick={() => onSelectSession(session.id)}
                    />
                </div>
                </div>
            );
          })}
        </div>
      </div>

      {/* Single Delete Confirm */}
      <ConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        title="セッションの削除"
        message="このセッションを本当に削除しますか？この操作は元に戻せません。"
      />

      {/* Bulk Delete Confirm */}
      <ConfirmDialog
        isOpen={isBulkDeleteConfirmOpen}
        onClose={() => setBulkDeleteConfirmOpen(false)}
        onConfirm={handleConfirmBulkDelete}
        title="一括削除"
        message={`選択された ${selectedIds.size} 件のセッションを削除しますか？この操作は元に戻せません。`}
      />
    </>
  );
};
