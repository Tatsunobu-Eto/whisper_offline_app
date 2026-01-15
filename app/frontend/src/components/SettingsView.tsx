import React, { useEffect, useState } from 'react';
import { getWhisperModel, updateWhisperModel } from '../api/client';
import { Settings, Save, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface SettingsViewProps {
  isAdmin: boolean;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ isAdmin }) => {
  const [modelSize, setModelSize] = useState('medium');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const data = await getWhisperModel();
        setModelSize(data.value);
      } catch (err) {
        console.error("Failed to load settings", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    if (!isAdmin) return;
    setSaving(true);
    setMessage(null);
    try {
      await updateWhisperModel(modelSize);
      setMessage({ type: 'success', text: '設定を保存しました' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.detail || '保存に失敗しました' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">設定を読み込み中...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-800">設定</h2>
        <p className="text-gray-500 text-sm">アプリケーションの動作設定を行います。</p>
      </div>

      {message && (
        <div className={`p-4 rounded-lg border flex items-center ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
        }`}>
          {message.type === 'success' ? <CheckCircle className="w-5 h-5 mr-2" /> : <AlertCircle className="w-5 h-5 mr-2" />}
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="p-6 border-b bg-gray-50">
          <h3 className="font-semibold text-gray-800 flex items-center">
            <Settings className="w-5 h-5 mr-2 text-blue-600" />
            音声認識モデル設定
          </h3>
        </div>
        
        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">使用するWhisperモデル</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { id: 'small', name: 'Small', desc: '高速・軽量', disabled: !isAdmin },
                { id: 'medium', name: 'Medium', desc: '標準的な精度と速度', disabled: !isAdmin },
                { id: 'large-v3', name: 'Large-v3', desc: '最高精度・高負荷', disabled: !isAdmin },
              ].map((m) => (
                <label 
                  key={m.id}
                  className={`
                    relative p-4 border rounded-xl cursor-pointer transition-all
                    ${modelSize === m.id ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-200 hover:bg-gray-50'}
                    ${m.disabled ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  <input
                    type="radio"
                    name="modelSize"
                    value={m.id}
                    checked={modelSize === m.id}
                    onChange={(e) => setModelSize(e.target.value)}
                    disabled={m.disabled}
                    className="sr-only"
                  />
                  <div className="font-bold text-gray-800">{m.name}</div>
                  <div className="text-xs text-gray-500 mt-1">{m.desc}</div>
                </label>
              ))}
            </div>
            {!isAdmin && (
              <p className="mt-3 text-xs text-orange-600">※モデルの変更は管理者のみ可能です。</p>
            )}
          </div>

          <div className="pt-4 border-t flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving || !isAdmin}
              className={`
                flex items-center px-6 py-2 rounded-lg font-bold transition-all
                ${saving || !isAdmin 
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg'}
              `}
            >
              {saving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
              設定を保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
