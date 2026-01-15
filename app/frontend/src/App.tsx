import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ModernUploader } from './components/ModernUploader';
import { HistoryList } from './components/HistoryList';
import { TranscriptionView } from './components/TranscriptionView';
import { RealtimeView } from './components/RealtimeView';
import { Login } from './components/Login';
import { AdminDashboard } from './components/AdminDashboard';
import { SettingsView } from './components/SettingsView';
import { getCurrentUser, logout, isAuthenticated } from './api/auth';

function App() {
  const [user, setUser] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [currentView, setCurrentView] = useState('upload'); // upload, history, realtime, settings
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      if (isAuthenticated()) {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
      }
      setAuthChecked(true);
    };
    checkAuth();
  }, []);

  const handleLoginSuccess = async () => {
    const currentUser = await getCurrentUser();
    setUser(currentUser);
  };

  const handleLogout = () => {
    logout();
    setUser(null);
    setSelectedSessionId(null);
    setCurrentView('upload');
  };

  // Helper to switch view
  const handleViewChange = (view: string) => {
    setCurrentView(view);
    setSelectedSessionId(null);
  };

  const handleSessionSelect = (sessionId: string) => {
    setSelectedSessionId(sessionId);
  };

  const handleTranscriptionComplete = () => {
    // Automatically switch to history view to show the result (it will be at the top)
    // Alternatively, we could get the new ID and show detail immediately, but for now history is easier
    // handleViewChange('history');
  };

  if (!authChecked) {
    return <div className="h-screen flex items-center justify-center bg-gray-50">読み込み中...</div>;
  }

  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      <Sidebar 
        currentView={currentView} 
        onViewChange={handleViewChange} 
        isAdmin={user.role === 'admin'}
      />
      
      <main className="flex-1 overflow-hidden flex flex-col">
        {/* Header with user info */}
        <header className="h-14 bg-white border-b px-8 flex items-center justify-between shrink-0">
            <span className="text-sm text-gray-500">
                ログインユーザー: <span className="font-semibold text-gray-800">{user.username}</span>
            </span>
            <button 
                onClick={handleLogout}
                className="text-sm text-red-500 hover:underline"
            >
                ログアウト
            </button>
        </header>

        <div className="flex-1 p-8 overflow-y-auto">
          {/* Detail View - Overrides everything if selected */}
          {selectedSessionId ? (
            <TranscriptionView 
              sessionId={selectedSessionId} 
              onBack={() => setSelectedSessionId(null)} 
            />
          ) : (
            <>
                {/* Upload View - Always mounted to preserve state, hidden when not active */}
                <div style={{ display: currentView === 'upload' ? 'block' : 'none' }}>
                    <div className="mx-auto">
                        <div className="mb-8">
                            <h2 className="text-2xl font-bold text-gray-800">新規文字起こし</h2>
                            <p className="text-gray-500">音声ファイルをアップロードして処理を開始します。</p>
                        </div>
                        <ModernUploader onTranscriptionComplete={handleTranscriptionComplete} />
                    </div>
                </div>

                {/* Realtime View - Always mounted to preserve recording state */}
                <div className="h-full" style={{ display: currentView === 'realtime' ? 'block' : 'none' }}>
                    <RealtimeView />
                </div>

                {/* Other Views - Mounted only when active to refresh data */}
                {currentView === 'history' && (
                    <div className="max-w-4xl mx-auto h-full flex flex-col">
                        <div className="mb-6 shrink-0">
                            <h2 className="text-2xl font-bold text-gray-800">履歴</h2>
                            <p className="text-gray-500">過去の文字起こしセッションを表示します。</p>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            <HistoryList onSelectSession={handleSessionSelect} />
                        </div>
                    </div>
                )}

                {currentView === 'settings' && (
                    <SettingsView isAdmin={user.role === 'admin'} />
                )}

                {currentView === 'admin' && user.role === 'admin' && (
                    <AdminDashboard />
                )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
