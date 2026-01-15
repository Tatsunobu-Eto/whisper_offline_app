import React from 'react';
import { Mic, Upload, Settings, History, Shield } from 'lucide-react';
import { clsx } from 'clsx';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  isAdmin?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange, isAdmin }) => {
  const menuItems = [
    { id: 'upload', label: 'ファイル文字起こし', icon: Upload },
    { id: 'realtime', label: 'リアルタイム (ベータ)', icon: Mic },
    { id: 'history', label: '履歴', icon: History },
    { id: 'settings', label: '設定', icon: Settings },
  ];

  if (isAdmin) {
    menuItems.push({ id: 'admin', label: '管理者', icon: Shield });
  }

  return (
    <div className="w-64 bg-gray-900 text-white flex flex-col h-screen">
      <div className="p-6 border-b border-gray-800">
        <h1 className="text-xl font-bold flex items-center">
            <Mic className="w-6 h-6 mr-2 text-blue-400" />
            STT Pro
        </h1>
      </div>
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onViewChange(item.id)}
                className={clsx(
                  "w-full flex items-center p-3 rounded-lg transition-colors duration-200",
                  currentView === item.id 
                    ? "bg-blue-600 text-white" 
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                )}
              >
                <item.icon className="w-5 h-5 mr-3" />
                <span className="font-medium">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="p-4 border-t border-gray-800 text-xs text-gray-500">
        Offline STT System v1.0
      </div>
    </div>
  );
};
