import React, { useEffect, useState } from 'react';
import { getSessions, deleteSession } from '../api/client';
import { FileAudio, Calendar, Clock, ChevronRight, Trash2 } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';

interface HistoryListProps {
  onSelectSession: (sessionId: string) => void;
}

export const HistoryList: React.FC<HistoryListProps> = ({ onSelectSession }) => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

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

  const handleDeleteClick = (sessionId: string) => {
    setSessionToDelete(sessionId);
    setConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (sessionToDelete) {
      try {
        await deleteSession(sessionToDelete);
        setSessions(sessions.filter((session) => session.id !== sessionToDelete));
      } catch (err: any) {
        setError(err.message || "セッションの削除に失敗しました");
      } finally {
        setConfirmOpen(false);
        setSessionToDelete(null);
      }
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">履歴を読み込み中...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-500">エラー: {error}</div>;
  }

  if (sessions.length === 0) {
    return (
        <div className="p-8 text-center text-gray-500 bg-white rounded-lg shadow-sm border">
            <p>文字起こしの履歴が見つかりません。</p>
        </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
          <h2 className="font-semibold text-gray-800">最近のセッション</h2>
          <span className="text-sm text-gray-500">{sessions.length} 件</span>
        </div>
        <div className="divide-y">
          {sessions.map((session) => (
            <div 
              key={session.id} 
              className="p-4 hover:bg-blue-50 transition-colors flex items-center justify-between group"
            >
              <div className="flex items-center space-x-4 cursor-pointer flex-grow" onClick={() => onSelectSession(session.id)}>
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                  <FileAudio className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-800">{session.filename}</h3>
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
              <div className="flex items-center">
                  <button
                      onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClick(session.id);
                      }}
                      className="p-2 rounded-full hover:bg-red-100 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="セッションを削除"
                  >
                      <Trash2 className="w-5 h-5" />
                  </button>
                  <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <ConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        title="セッションの削除"
        message="このセッションを本当に削除しますか？この操作は元に戻せません。"
      />
    </>
  );
};
