import React, { useEffect, useState } from 'react';
import { getUsers, createUser, deleteUser, type User } from '../api/users';
import { UserPlus, Trash2, User as UserIcon, Loader2, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';

export const AdminDashboard: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // New user form state
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await getUsers();
      setUsers(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "ユーザーの読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await createUser({
        username: newUsername,
        password: newPassword,
        email: newEmail || undefined,
        role: newRole
      });
      // Reset form
      setNewUsername('');
      setNewPassword('');
      setNewEmail('');
      setNewRole('user');
      // Refresh list
      await fetchUsers();
    } catch (err: any) {
      setError(err.response?.data?.detail || "ユーザーの作成に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm("このユーザーを本当に削除しますか？")) return;
    try {
      await deleteUser(userId);
      await fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.detail || "ユーザーの削除に失敗しました");
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-800">管理者ダッシュボード</h2>
        <p className="text-gray-500">システムユーザーと権限を管理します。</p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 flex items-center">
            <AlertCircle className="w-5 h-5 mr-2" />
            {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Create User Form */}
        <div className="lg:col-span-1">
          <div className="bg-white p-6 rounded-xl border shadow-sm space-y-6">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center">
              <UserPlus className="w-5 h-5 mr-2 text-blue-600" />
              新規ユーザーの追加
            </h3>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ユーザー名 *</label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="jdoe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">パスワード *</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">役割</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                >
                  <option value="user">ユーザー</option>
                  <option value="admin">管理者</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg transition-all flex items-center justify-center"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "ユーザーを作成"}
              </button>
            </form>
          </div>
        </div>

        {/* User List Table */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
              <h3 className="font-semibold text-gray-800">システムユーザー</h3>
              <span className="text-xs text-gray-500">{users.length} 件</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs uppercase text-gray-400 font-bold border-b">
                    <th className="px-6 py-3">ユーザー</th>
                    <th className="px-6 py-3">役割</th>
                    <th className="px-6 py-3">メールアドレス</th>
                    <th className="px-6 py-3 text-right">アクション</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-sm">
                  {loading ? (
                    <tr>
                        <td colSpan={4} className="px-6 py-10 text-center text-gray-400">ユーザーを読み込み中...</td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                        <td colSpan={4} className="px-6 py-10 text-center text-gray-400">ユーザーが見つかりません。</td>
                    </tr>
                  ) : (
                    users.map((u) => (
                        <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center">
                                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center mr-3">
                                    <UserIcon className="w-4 h-4 text-gray-500" />
                                </div>
                                <span className="font-medium text-gray-800">{u.username}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={clsx(
                                "px-2 py-1 rounded text-[10px] font-bold uppercase",
                                u.role === 'admin' ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                            )}>
                                {u.role}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-gray-500">{u.email || "-"}</td>
                          <td className="px-6 py-4 text-right">
                            <button 
                                onClick={() => handleDeleteUser(u.id)}
                                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all"
                                title="ユーザーを削除"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
