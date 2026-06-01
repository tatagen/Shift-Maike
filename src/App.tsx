/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { AdminDashboard } from './components/AdminDashboard';
import { StaffDashboard } from './components/StaffDashboard';
import { Button } from '@/src/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { localDb } from '@/src/lib/localDb';
import { User } from '@/src/types';
import { Loader2, LogIn, CalendarDays, ArrowLeft, UserPlus } from 'lucide-react';
import { Toaster } from '@/src/components/ui/sonner';
import { toast } from 'sonner';

function AppContent() {
  const { user, loading, loginAsAdmin, loginAsStaff, logout } = useAuth();
  const [staffList, setStaffList] = useState<User[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [selectedStaffName, setSelectedStaffName] = useState<string>("");
  const [customStaffName, setCustomStaffName] = useState<string>("");
  const [showStaffSelector, setShowStaffSelector] = useState<boolean>(false);
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);

  useEffect(() => {
    const fetchStaff = async () => {
      try {
        let allUsers = await localDb.list<User>('users', 'default-hotel');
        let staffs = allUsers.filter(u => u.role === 'STAFF');
        
        // If there are no staff members registered yet, automatically seed the 5 standard staff members so the user gets a pull-down immediately.
        if (staffs.length === 0) {
          const defaultStaff = [
            { name: "田中 太郎", role: "STAFF" as const, maxHoursPerMonth: 160, preferredStyle: "DEFAULT" as const, hotelId: "default-hotel" },
            { name: "佐藤 花子", role: "STAFF" as const, maxHoursPerMonth: 160, preferredStyle: "DAY_MAIN" as const, hotelId: "default-hotel" },
            { name: "鈴木 一郎", role: "STAFF" as const, maxHoursPerMonth: 160, preferredStyle: "NIGHT_MAIN" as const, hotelId: "default-hotel" },
            { name: "高橋 優子", role: "STAFF" as const, maxHoursPerMonth: 80, preferredStyle: "DEFAULT" as const, hotelId: "default-hotel" },
            { name: "伊藤 健太", role: "STAFF" as const, maxHoursPerMonth: 160, preferredStyle: "DEFAULT" as const, hotelId: "default-hotel" },
          ];
          for (const s of defaultStaff) {
            await localDb.add<User>('users', s);
          }
          // Fetch again to update local list
          allUsers = await localDb.list<User>('users', 'default-hotel');
          staffs = allUsers.filter(u => u.role === 'STAFF');
        }

        setStaffList(staffs);
        if (staffs.length > 0) {
          setSelectedStaffId(staffs[0].id);
          setSelectedStaffName(staffs[0].name);
          setIsCreatingNew(false); // Default to the dropdown menu!
        }
      } catch (e) {
        console.error("Failed to load staff list", e);
      }
    };
    fetchStaff();
  }, [user]);

  const handleStaffLogin = async () => {
    if (isCreatingNew) {
      if (!customStaffName.trim()) {
        toast.error("お名前を入力してください");
        return;
      }
      
      // 新しいスタッフをDBに追加
      const id = await localDb.add<User>('users', {
        hotelId: "default-hotel",
        role: "STAFF",
        name: customStaffName,
        maxHoursPerMonth: 160,
        preferredStyle: "DEFAULT"
      });
      
      await loginAsStaff(id, customStaffName);
      toast.success(`${customStaffName} として開始しました！`);
    } else {
      const selected = staffList.find(s => s.id === selectedStaffId);
      const staffName = selected ? selected.name : "一般スタッフ";
      await loginAsStaff(selectedStaffId, staffName);
      toast.success(`${staffName} として開始しました！`);
    }
  };

  const onSelectStaff = (val: string) => {
    setSelectedStaffId(val);
    const s = staffList.find(st => st.id === val);
    if (s) setSelectedStaffName(s.name);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
        <p className="text-slate-600 font-medium animate-pulse">ShiftFlow AI を起動中...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-4xl space-y-12">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center gap-2 bg-blue-600 p-2 rounded-xl text-white mb-4">
              <CalendarDays className="w-8 h-8" />
            </div>
            <h1 className="text-4xl font-black tracking-tighter text-slate-900 sm:text-6xl">
              ShiftFlow AI
            </h1>
            <p className="text-xl text-slate-500 max-w-xl mx-auto">
              AIによる次世代のシフト管理システムへようこそ。
              お使いの役割を選択して開始してください。
            </p>
          </div>

          {!showStaffSelector ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Admin Entrance */}
              <div className="group bg-white p-8 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 hover:border-blue-500 transition-all cursor-pointer flex flex-col items-center text-center space-y-6"
                   onClick={loginAsAdmin}>
                <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                  <LogIn className="w-10 h-10" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">管理者用</h2>
                  <p className="text-slate-500 mt-2">シフトの自動生成・スタッフ管理・要件設定はこちら</p>
                </div>
                <Button size="lg" className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-lg font-bold rounded-2xl">
                  管理者として開始
                </Button>
              </div>

              {/* Staff Entrance */}
              <div className="group bg-white p-8 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 hover:border-emerald-500 transition-all cursor-pointer flex flex-col items-center text-center space-y-6"
                   onClick={() => setShowStaffSelector(true)}>
                <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
                  <CalendarDays className="w-10 h-10" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">スタッフ用</h2>
                  <p className="text-slate-500 mt-2">シフトの確認・希望休の提出はこちら</p>
                </div>
                <Button variant="outline" size="lg" className="w-full h-14 border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-lg font-bold rounded-2xl">
                  スタッフとして開始
                </Button>
              </div>
            </div>
          ) : (
            <div className="max-w-md mx-auto bg-white p-8 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 space-y-6">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <Button variant="ghost" size="sm" className="h-8 text-slate-500 rounded-xl px-2 hover:bg-slate-50" onClick={() => { setShowStaffSelector(false); setIsCreatingNew(false); }}>
                  <ArrowLeft className="w-4 h-4 mr-1" /> 戻る
                </Button>
                <span className="text-xs font-bold text-slate-400">スタッフログイン</span>
              </div>

              <div className="space-y-4">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-slate-900">スタッフの選択</h2>
                  <p className="text-slate-500 text-xs mt-1">シフトまたは希望を入力するメンバーを指定してください</p>
                </div>

                {!isCreatingNew && staffList.length > 0 ? (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">対象のスタッフ</Label>
                      <Select value={selectedStaffId} onValueChange={onSelectStaff}>
                        <SelectTrigger className="h-12 rounded-xl border-slate-200 text-slate-700 font-medium">
                          <SelectValue placeholder="メンバーを選択してください" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          {staffList.map(st => (
                            <SelectItem key={st.id} value={st.id} className="font-medium text-slate-700">
                              {st.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <button 
                        onClick={() => setIsCreatingNew(true)} 
                        className="text-xs text-blue-600 hover:text-blue-700 font-bold inline-flex items-center gap-1"
                      >
                        <UserPlus className="w-3.5 h-3.5" /> 別の新しいスタッフを登録して開始
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">新規スタッフ名</Label>
                      <Input 
                        placeholder="例: 佐藤 二郎" 
                        value={customStaffName} 
                        onChange={(e) => setCustomStaffName(e.target.value)}
                        className="h-12 rounded-xl"
                      />
                    </div>

                    {staffList.length > 0 && (
                      <div className="flex items-center justify-between pt-1">
                        <button 
                          onClick={() => setIsCreatingNew(false)} 
                          className="text-xs text-slate-500 hover:text-slate-600 font-semibold"
                        >
                          登録済みのスタッフ一覧に戻る
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Button 
                onClick={handleStaffLogin} 
                className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-base font-bold rounded-2xl shadow-lg shadow-emerald-100"
              >
                {isCreatingNew ? "新規登録して開始" : `${selectedStaffName} として開始`}
              </Button>
            </div>
          )}

          <div className="text-center">
             <p className="text-slate-400 text-sm">© 2026 ShiftFlow AI. すべての機能を無料でご利用いただけます。</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg text-ink font-sans">
      {/* Top Navigation */}
      <header className="h-16 border-b border-slate-200 flex items-center px-6 bg-white/80 backdrop-blur-md shrink-0 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
            <CalendarDays className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">ShiftFlow <span className="font-medium text-slate-400">AI</span></h1>
        </div>
        <div className="ml-auto flex items-center gap-6">
          <div className="text-right hidden sm:block">
            <div className="text-[10px] uppercase font-bold text-slate-400 leading-none mb-1">{user.role === 'ADMIN' ? '管理者アカウント' : 'スタッフ'}</div>
            <div className="text-sm font-semibold text-slate-700">{user.name}</div>
          </div>
          <Button variant="outline" size="sm" onClick={logout} className="h-9 border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold px-4 rounded-xl transition-all">
            ログアウト
          </Button>
        </div>
      </header>

      {/* Main Framework */}
      <main className="flex-1 overflow-hidden bg-white">
        {user.role === 'ADMIN' ? <AdminDashboard /> : <StaffDashboard />}
      </main>

      {/* Bottom Status Bar */}
      <footer className="h-10 bg-slate-50 border-t border-slate-200 flex items-center px-6 gap-6 text-slate-400 text-[10px] font-medium tracking-tight shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          システム稼働中
        </div>
        <div className="hidden md:block">Version 1.0.4</div>
        <div className="ml-auto flex items-center gap-4">
          <span>© 2026 ShiftFlow AI</span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
      <Toaster position="bottom-right" />
    </AuthProvider>
  );
}

