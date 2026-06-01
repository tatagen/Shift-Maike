import React, { useState, useEffect } from 'react';
import { localDb } from '@/src/lib/localDb';
import { User, ShiftPattern, Submission, Schedule, Assignment } from '@/src/types';
import { useAuth } from './AuthProvider';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { Label } from '@/src/components/ui/label';
import { Badge } from '@/src/components/ui/badge';
import { Calendar } from '@/src/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/src/components/ui/popover';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isSameDay } from 'date-fns';
import { toast } from 'sonner';
import { CalendarDays, Save, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, Clock, X, RefreshCw, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

export function StaffDashboard() {
  const { user: currentUser } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date(2026, 4, 1)); // Default to May 2026 for consistency with demo database
  const [showSidebar, setShowSidebar] = useState(true);
  
  // Staff Selection States
  const [staffList, setStaffList] = useState<User[]>([]);
  const [activeUserId, setActiveUserId] = useState<string>("");
  const activeUser = staffList.find(s => s.id === activeUserId) || currentUser;

  // Data
  const [publishedSchedule, setPublishedSchedule] = useState<Schedule | null>(null);
  const [patterns, setPatterns] = useState<ShiftPattern[]>([]);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [offDates, setOffDates] = useState<Date[]>([]);
  const [specificRequests, setSpecificRequests] = useState<{ date: string; patternIds: string[] }[]>([]);
  const [activeTab, setActiveTab] = useState<string>("preference-edit");

  // 一括設定用ステート
  const [showBulkPanel, setShowBulkPanel] = useState<boolean>(false);
  const [weeklySettings, setWeeklySettings] = useState<{ [key: number]: { type: 'none' | 'off' | 'patterns'; patternIds: string[] } }>({
    0: { type: 'none', patternIds: [] }, // 日
    1: { type: 'none', patternIds: [] }, // 月
    2: { type: 'none', patternIds: [] }, // 火
    3: { type: 'none', patternIds: [] }, // 水
    4: { type: 'none', patternIds: [] }, // 木
    5: { type: 'none', patternIds: [] }, // 金
    6: { type: 'none', patternIds: [] }, // 土
  });

  const yearMonth = format(currentMonth, 'yyyy-MM');
  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth)
  });

  useEffect(() => {
    if (!currentUser) return;

    const refresh = async () => {
      const hotelId = currentUser.hotelId;
      
      // Load and set staff members
      const allUsers = await localDb.list<User>('users', hotelId);
      const staffs = allUsers.filter(u => u.role === 'STAFF');
      setStaffList(staffs);
      
      if (!activeUserId) {
        if (currentUser.role === 'STAFF' && currentUser.id !== 'mock-staff-id') {
          setActiveUserId(currentUser.id);
        } else if (staffs.length > 0) {
          setActiveUserId(staffs[0].id);
        }
      }

      // Fetch published schedule for this month
      const allSchedules = await localDb.list<Schedule>('schedules', hotelId);
      const currentPublished = allSchedules.find(s => s.yearMonth === yearMonth && s.status === 'published');
      setPublishedSchedule(currentPublished || null);

      // Fetch patterns
      setPatterns(await localDb.list<ShiftPattern>('shift_patterns', hotelId));

      // Fetch submission
      const currentId = activeUserId || currentUser.id;
      const allSubmissions = await localDb.list<Submission>('submissions', hotelId);
      const mySub = allSubmissions.find(s => s.userId === currentId && s.yearMonth === yearMonth);
      if (mySub) {
        setSubmission(mySub);
        setOffDates(mySub.offDates.map(d => new Date(d)));
        
        // 旧スキーマ(patternIdオブジェクト型)から新スキーマ(patternIds配列型)へのフォールバック対応
        const mappedRequests = (mySub.specificRequests || []).map((r: any) => ({
          date: r.date,
          patternIds: r.patternIds || (r.patternId ? [r.patternId] : [])
        }));
        setSpecificRequests(mappedRequests);
      } else {
        setSubmission(null);
        setOffDates([]);
        setSpecificRequests([]);
      }
    };

    refresh(); // Initial load

    const unsubUsers = localDb.subscribe('users', refresh);
    const unsubSch = localDb.subscribe('schedules', refresh);
    const unsubPatterns = localDb.subscribe('shift_patterns', refresh);
    const unsubSub = localDb.subscribe('submissions', refresh);

    return () => {
      unsubUsers();
      unsubSch();
      unsubPatterns();
      unsubSub();
    };
  }, [currentUser, activeUserId, yearMonth]);

  const saveSubmission = async () => {
    const targetUserId = activeUserId || currentUser!.id;
    const data = {
      hotelId: currentUser!.hotelId,
      userId: targetUserId,
      yearMonth,
      offDates: offDates.map(d => format(d, 'yyyy-MM-dd')),
      specificRequests: specificRequests 
    };

    if (submission) {
      await localDb.update('submissions', submission.id, data);
      toast.success(`${activeUser?.name || 'スタッフ'} さんの希望を更新し、提出完了しました！`);
    } else {
      await localDb.add<Submission>('submissions', data);
      toast.success(`${activeUser?.name || 'スタッフ'} さんの希望を新規提出しました！`);
    }
  };

  const activeId = activeUserId || currentUser?.id;
  const myAssignments = publishedSchedule?.assignments?.filter(a => a.userId === activeId) || [];

  const totalHours = myAssignments.reduce((acc, curr) => {
    const pattern = patterns.find(p => p.id === curr.patternId);
    return acc + (pattern?.workHours || 0);
  }, 0);

  // カレンダーセル内：チェックボックスによる複数シフト選択（トグル方式）
  const handleTogglePatternPreference = (day: Date, patternId: string) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const nextOffDates = offDates.filter(d => !isSameDay(d, day)); // 勤務シフト希望にするため、「休み」は解除する
    
    const existing = specificRequests.find(r => r.date === dateStr);
    let nextSpecificRequests = [];
    
    if (existing) {
      const isSelected = existing.patternIds.includes(patternId);
      const updatedIds = isSelected 
        ? existing.patternIds.filter(id => id !== patternId) 
        : [...existing.patternIds, patternId];
      
      if (updatedIds.length === 0) {
        // 全チェック解除ならリクエスト項目自体を削除
        nextSpecificRequests = specificRequests.filter(r => r.date !== dateStr);
      } else {
        nextSpecificRequests = specificRequests.map(r => 
          r.date === dateStr ? { ...r, patternIds: updatedIds } : r
        );
      }
    } else {
      nextSpecificRequests = [...specificRequests, { date: dateStr, patternIds: [patternId] }];
    }
    
    setOffDates(nextOffDates);
    setSpecificRequests(nextSpecificRequests);
  };

  // カレンダーセル内：希望なし or 希望休
  const handleClearOrSetOff = (day: Date, type: 'none' | 'off') => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const nextOffDates = offDates.filter(d => !isSameDay(d, day));
    const nextSpecificRequests = specificRequests.filter(r => r.date !== dateStr);
    
    if (type === 'off') {
      setOffDates([...nextOffDates, day]);
    } else {
      setOffDates(nextOffDates);
    }
    setSpecificRequests(nextSpecificRequests);
  };

  // 一括設定：月全体の全日程に適用
  const applyMonthlyBulk = (type: 'clear' | 'off' | string) => {
    if (type === 'clear') {
      setOffDates([]);
      setSpecificRequests([]);
      toast.success("この月のすべての希望設定をクリアしました。");
    } else if (type === 'off') {
      setOffDates([...daysInMonth]);
      setSpecificRequests([]);
      toast.success("この月の全日程を「希望休（休み）」に設定しました！");
    } else {
      // 特定のシフパターンを全日に適用
      setOffDates([]);
      setSpecificRequests(daysInMonth.map(day => ({
        date: format(day, 'yyyy-MM-dd'),
        patternIds: [type]
      })));
      const patternName = patterns.find(p => p.id === type)?.name || "シフト希望";
      toast.success(`この月の全日程を「${patternName}」希望に設定しました！`);
    }
  };

  // 一括設定：曜日ごとの希望設定を一括適用
  const handleApplyWeeklySettings = () => {
    let nextOffDates = [...offDates];
    let nextSpecificRequests = [...specificRequests];

    daysInMonth.forEach(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const wDay = day.getDay();
      const setting = weeklySettings[wDay];

      if (!setting || setting.type === 'none') {
        // 「希望なし（通常通り）」の場合は、既存の設定を消去
        nextOffDates = nextOffDates.filter(d => !isSameDay(d, day));
        nextSpecificRequests = nextSpecificRequests.filter(r => r.date !== dateStr);
      } else if (setting.type === 'off') {
        // 「希望休」の場合
        nextOffDates = nextOffDates.filter(d => !isSameDay(d, day));
        nextOffDates.push(day);
        nextSpecificRequests = nextSpecificRequests.filter(r => r.date !== dateStr);
      } else if (setting.type === 'patterns' && setting.patternIds.length > 0) {
        // 「特定時間帯シフト（複数可）」の場合
        nextOffDates = nextOffDates.filter(d => !isSameDay(d, day));
        nextSpecificRequests = nextSpecificRequests.filter(r => r.date !== dateStr);
        nextSpecificRequests.push({
          date: dateStr,
          patternIds: [...setting.patternIds]
        });
      }
    });

    setOffDates(nextOffDates);
    setSpecificRequests(nextSpecificRequests);
    toast.success("曜日ごとの希望設定が当月カレンダーに反映されました！上の「希望を保存・提出する」ボタンを押すと保存が完了します。");
  };

  const updateWeeklySettingType = (wDay: number, type: 'none' | 'off' | 'patterns') => {
    setWeeklySettings(prev => ({
      ...prev,
      [wDay]: { 
        ...prev[wDay], 
        type, 
        patternIds: type === 'patterns' ? prev[wDay].patternIds : [] 
      }
    }));
  };

  const toggleWeeklySettingPattern = (wDay: number, patternId: string) => {
    setWeeklySettings(prev => {
      const current = prev[wDay].patternIds;
      const isSelected = current.includes(patternId);
      const nextIds = isSelected ? current.filter(id => id !== patternId) : [...current, patternId];
      return {
        ...prev,
        [wDay]: { 
          ...prev[wDay], 
          type: 'patterns', 
          patternIds: nextIds 
        }
      };
    });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar: Staff Stats */}
        {showSidebar && (
          <aside className="w-64 border-r border-line flex flex-col bg-white/20 shrink-0">
            <div className="p-4 flex-1 space-y-6">
              <div>
                <div className="grid-header mb-2">スタッフ切り替え</div>
                <div className="mb-4">
                  <Select value={activeUserId} onValueChange={setActiveUserId}>
                    <SelectTrigger className="w-full h-10 rounded-xl border-slate-200 text-xs font-bold text-slate-700 bg-white shadow-sm">
                      <SelectValue placeholder="スタッフを選択" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {staffList.map(st => (
                        <SelectItem key={st.id} value={st.id} className="text-xs font-medium text-slate-700">
                          {st.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                 <div className="grid-header mb-4">ステータス :: {activeUser?.name}</div>
                <div className="space-y-3">
                  <div className="p-3 border border-line/10 rounded-xl bg-white/40 shadow-sm">
                    <div className="text-[10px] font-black opacity-50 uppercase mb-1">合計労働時間</div>
                    <div className="flex justify-between items-end">
                      <span className="text-xl font-mono tracking-tighter leading-none">{totalHours.toFixed(1)}h</span>
                      <span className={`text-[10px] font-bold uppercase ${totalHours > (activeUser?.maxHoursPerMonth || 160) ? 'text-red-500' : totalHours < (activeUser?.minHoursPerMonth ?? 0) ? 'text-amber-500' : 'text-emerald-600'}`}>
                        {totalHours > (activeUser?.maxHoursPerMonth || 160) ? '上限超過' : totalHours < (activeUser?.minHoursPerMonth ?? 0) ? '下限未達' : '正常'}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-bold mt-1.5 border-t border-slate-100/50 pt-1.5 flex justify-between">
                      <span>目安労働範囲:</span>
                      <span>{(activeUser?.minHoursPerMonth ?? 0)}h ～ {(activeUser?.maxHoursPerMonth || 160)}h</span>
                    </div>
                  </div>
                  <div className="p-3 border border-line/10 rounded-xl bg-white/40 shadow-sm">
                    <div className="text-[10px] font-black opacity-50 uppercase mb-1">割当コマ数</div>
                    <div className="font-mono text-lg tracking-tighter leading-none">
                      {myAssignments.length} スロット
                    </div>
                  </div>
                </div>
              </div>
   
              <div className="pt-2">
                 <div className="grid-header mb-4 font-bold flex items-center justify-between">
                   <span>希望・シフト提出</span>
                   {submission && (
                     <Badge variant="outline" className="text-[9px] text-emerald-600 bg-emerald-50 border-emerald-100 font-bold leading-none py-1 px-1.5 rounded-md">提出完了</Badge>
                   )}
                 </div>
                 <Button onClick={saveSubmission} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold h-10 mb-4 transition-all shadow-lg shadow-emerald-100">
                   <CheckCircle2 className="w-4 h-4 mr-2" /> 希望を保存・提出する
                 </Button>
                 <div className="text-[10px] text-slate-500 font-medium px-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-100 leading-normal">
                   カレンダーの日付をタップすると、希望休（赤色）や希望シフト時間帯（青色）を細かく登録・編集できます。設定後に上の「保存・提出する」ボタンを押してください。
                 </div>
              </div>

              <div>
                <div className="grid-header mb-4">シフト凡例</div>
                <div className="space-y-2">
                   {patterns.map(p => (
                     <div key={p.id} className="flex items-center gap-2 text-[11px] font-mono">
                        <div className="w-6 h-6 border border-line/10 flex items-center justify-center font-black bg-white shadow-sm">{p.shortName}</div>
                        <span className="opacity-60">{p.name} ({p.startTime})</span>
                     </div>
                   ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50">
              <div className="text-[10px] font-bold mb-2 text-slate-400 uppercase tracking-widest">お知らせ</div>
              <div className="font-sans text-[10px] leading-tight text-slate-500 font-medium">
                自動シフト生成のため、希望休の提出は期限までに行ってください。
              </div>
            </div>
          </aside>
        )}

        {/* Main Calendar View */}
        <main className="flex-1 flex flex-col bg-white overflow-hidden">
           <div className="h-14 border-b border-line flex items-center px-6 gap-4 shrink-0 justify-between">
              <div className="flex items-center gap-3">
                 <Button
                   variant="ghost"
                   size="icon"
                   className="h-8 w-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 bg-white shadow-sm shrink-0"
                   onClick={() => setShowSidebar(!showSidebar)}
                   title={showSidebar ? "サイドバーを隠す" : "サイドバーを表示"}
                 >
                   {showSidebar ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
                 </Button>
                 
                 <div className="w-5 h-5 bg-slate-900 rounded-full flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                 </div>
                 <h2 className="text-sm font-bold uppercase tracking-widest leading-none flex items-center gap-2">
                   <span>{format(currentMonth, 'yyyy年 MM月')} シフト＆希望休</span>
                   <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-lg leading-none">
                     {activeUser?.name}
                   </Badge>
                 </h2>
              </div>

              <div className="flex items-center gap-4">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
                  <TabsList className="bg-slate-100 border border-slate-200 h-9 p-1 rounded-xl">
                    <TabsTrigger value="preference-edit" className="text-[11px] font-bold h-full rounded-lg px-3">希望・シフトの編集提出</TabsTrigger>
                    <TabsTrigger value="schedule-view" className="text-[11px] font-bold h-full rounded-lg px-3">確定シフトの確認</TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="flex items-center gap-2 bg-zinc-100 p-1 rounded border border-line/10">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="font-mono text-[10px] font-black uppercase px-2">{format(currentMonth, 'yyyy年 M月')}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
           </div>

           <div className="flex-1 overflow-auto p-6 bg-zinc-50/50">
              <div className="max-w-4xl mx-auto">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsContent value="preference-edit" className="m-0 border-none p-0">
                    <div className="mb-4 bg-emerald-50 border border-emerald-200/60 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-500 text-white rounded-xl">
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-800">希望シフト・時間の作成中</div>
                          <div className="text-xs text-slate-500 font-medium">カレンダーの日付をタップして、各日の希望（希望休、早番、遅番など）を入力してください。</div>
                        </div>
                      </div>
                      <Button onClick={saveSubmission} className="bg-emerald-600 hover:bg-emerald-700 text-xs font-bold rounded-xl h-10 shadow-md shadow-emerald-100">
                        <Save className="w-3.5 h-3.5 mr-1" /> これで希望提出を確定する
                      </Button>
                    </div>

                    {/* 希望一括登録ツール */}
                    <div className="mb-4 bg-white border border-slate-200/90 shadow-sm rounded-2xl overflow-hidden">
                      <Button 
                        variant="ghost" 
                        onClick={() => setShowBulkPanel(!showBulkPanel)}
                        className="w-full flex items-center justify-between p-4 h-auto hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="p-1 px-1.5 text-[9px] bg-blue-600 font-extrabold text-white rounded-md tracking-wider leading-none">一括設定</span>
                          <span className="text-xs font-black text-slate-700">💡 シフト希望をまとめて自動入力する（曜日指定・月全体一括）</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-bold">{showBulkPanel ? "ツールを閉じる ▲" : "開いて設定する ▼"}</span>
                      </Button>

                      {showBulkPanel && (
                        <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-4">
                          {/* 月単位一括設定 */}
                          <div className="space-y-1.5">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">方法①：この月 ({format(currentMonth, 'M月')}) 全体をまとめて設定</div>
                            <div className="flex flex-wrap gap-1.5">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="text-xs font-bold border-red-200 hover:bg-red-50 text-red-600 rounded-xl bg-white"
                                onClick={() => applyMonthlyBulk('off')}
                              >
                                全ての日に希望休を適用
                              </Button>
                              
                              {patterns.map(p => (
                                <Button 
                                  key={p.id}
                                  variant="outline" 
                                  size="sm" 
                                  className="text-xs font-bold border-sky-200 hover:bg-sky-50 text-sky-700 rounded-xl bg-white"
                                  onClick={() => applyMonthlyBulk(p.id)}
                                >
                                  全体の希望を「{p.name}」にする
                                </Button>
                              ))}

                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="text-xs font-bold border-slate-200 hover:bg-slate-50 text-slate-500 rounded-xl bg-white"
                                onClick={() => applyMonthlyBulk('clear')}
                              >
                                全クリア (リセット)
                              </Button>
                            </div>
                          </div>

                          <div className="h-px bg-slate-150 my-3" />

                          {/* 曜日別一括設定 */}
                          <div className="space-y-2">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">方法②：指定した曜日ごとに希望をまとめて入力</div>
                            <div className="space-y-1.5 max-w-full">
                              {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => {
                                const currentSetting = weeklySettings[i];
                                return (
                                  <div key={d} className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 border border-slate-200 rounded-xl bg-white gap-2">
                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className={`w-7 h-7 flex items-center justify-center rounded-lg font-bold text-xs ${i === 0 ? 'bg-red-50 text-red-500' : 'bg-slate-100 text-slate-600'}`}>
                                        {d}
                                      </span>
                                      <span className="text-[10px] font-bold text-slate-400">曜日</span>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-1 flex-1 sm:justify-end">
                                      <Button 
                                        variant={currentSetting.type === 'none' ? 'secondary' : 'ghost'}
                                        size="sm"
                                        className="text-[10px] font-bold h-7 rounded-md px-2"
                                        onClick={() => updateWeeklySettingType(i, 'none')}
                                      >
                                        希望なし
                                      </Button>
                                      <Button 
                                        variant={currentSetting.type === 'off' ? 'secondary' : 'ghost'}
                                        size="sm"
                                        className="text-[10px] font-bold text-red-600 hover:text-red-700 hover:bg-red-50 h-7 rounded-md px-2"
                                        onClick={() => updateWeeklySettingType(i, 'off')}
                                      >
                                        休み希望
                                      </Button>

                                      <div className="flex items-center gap-1 border-l border-slate-200 pl-2.5 ml-1">
                                        <span className="text-[9px] font-bold text-slate-400 mr-1 shrink-0">シフト指定(複数選択可):</span>
                                        {patterns.map(p => {
                                          const isChecked = currentSetting.type === 'patterns' && currentSetting.patternIds.includes(p.id);
                                          return (
                                            <Button 
                                              key={p.id}
                                              variant={isChecked ? 'secondary' : 'ghost'}
                                              size="sm"
                                              className={`text-[9px] font-bold h-7 px-1.5 rounded-md ${isChecked ? 'bg-sky-50 text-sky-700 border border-sky-100' : ''}`}
                                              onClick={() => toggleWeeklySettingPattern(i, p.id)}
                                            >
                                              <span className="bg-sky-100 text-sky-700 rounded text-[9px] font-black px-1 mr-0.5">{p.shortName}</span>
                                              {p.name}
                                            </Button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="pt-1">
                              <Button 
                                onClick={handleApplyWeeklySettings} 
                                className="bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-bold px-4 h-8 rounded-xl shadow-md transition-all"
                              >
                                設定した曜日の希望をカレンダーに一挙適用する
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-7 border-t border-l border-line shadow-2xl shadow-ink/5 bg-white rounded-lg overflow-hidden">
                      {/* Day Headers */}
                      {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
                        <div key={d} className={`p-2 border-r border-b border-slate-200 bg-slate-50 text-center font-bold text-[11px] uppercase tracking-wider ${i === 0 ? 'text-red-500' : 'text-slate-500'}`}>
                          {d}
                        </div>
                      ))}
                      
                      {/* Empty offsets */}
                      {Array.from({ length: startOfMonth(currentMonth).getDay() }).map((_, i) => (
                        <div key={`empty-${i}`} className="h-24 sm:h-32 border-r border-b border-line bg-zinc-50/20"></div>
                      ))}

                      {daysInMonth.map(day => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        const isOff = offDates.some(d => isSameDay(d, day));
                        const req = specificRequests.find(r => r.date === dateStr);
                        // 複数選択されたパターンのID配列を取得
                        const reqPatternIds = req ? (req.patternIds || []) : [];
                        const reqPatterns = patterns.filter(p => reqPatternIds.includes(p.id));
                        const isToday = format(new Date(), 'yyyy-MM-dd') === dateStr;

                        let bgClass = "bg-white";
                        if (isOff) bgClass = "bg-red-50/30 hover:bg-red-100/30";
                        else if (reqPatterns.length > 0) bgClass = "bg-sky-50/30 hover:bg-sky-100/30";
                        else if (isToday) bgClass = "bg-amber-50/20";

                        return (
                          <Popover key={dateStr}>
                            <PopoverTrigger>
                              <div 
                                className={`h-24 sm:h-32 border-r border-b border-line p-2 relative group transition-colors cursor-pointer hover:bg-slate-50/80 ${bgClass} w-full text-left inline-block`}
                              >
                                <div className="flex justify-between items-start">
                                  <div className={`text-xs font-mono font-black ${day.getDay() === 0 ? 'text-red-400' : 'text-zinc-400'}`}>
                                    {format(day, 'dd')}
                                  </div>
                                  {isToday && (
                                    <span className="text-[8px] bg-amber-500 text-white font-bold px-1 rounded-sm leading-none py-0.5 text-[8px]">本日</span>
                                  )}
                                </div>
                                
                                {isOff ? (
                                  <div className="mt-2 p-1.5 h-[calc(100%-24px)] border border-red-200 bg-red-50/50 flex flex-col items-center justify-center rounded-xl shadow-sm">
                                    <div className="font-bold text-[10px] text-red-600 truncate leading-none">希望休</div>
                                    <X className="w-3.5 h-3.5 text-red-400 mt-1" />
                                  </div>
                                ) : reqPatterns.length > 0 ? (
                                  <div className="mt-2 p-1.5 h-[calc(100%-24px)] border border-sky-200 bg-sky-50/50 flex flex-col justify-between rounded-xl shadow-sm">
                                     <div className="text-[9px] font-extrabold text-sky-700 leading-tight truncate">
                                        {reqPatterns.map(p => p.shortName).join(' or ')} 希望
                                     </div>
                                     <div className="flex flex-wrap gap-0.5 justify-end mt-1">
                                        {reqPatterns.map(p => (
                                          <span key={p.id} className="w-4 h-4 flex items-center justify-center border border-sky-300 bg-sky-100 text-sky-700 rounded-full text-[9px] font-bold">
                                             {p.shortName}
                                          </span>
                                        ))}
                                     </div>
                                  </div>
                                ) : (
                                  <div className="mt-2 h-[calc(100%-24px)] border border-dashed border-zinc-200 bg-zinc-50/10 flex items-center justify-center rounded-xl opacity-35 hover:opacity-100 transition-opacity">
                                     <div className="font-medium text-[9px] text-slate-400">希望なし</div>
                                  </div>
                                )}
                              </div>
                            </PopoverTrigger>
                            <PopoverContent className="w-60 p-2.5 rounded-2xl shadow-xl border-slate-200" align="start">
                              <div className="text-[10px] font-bold text-slate-400 px-2 pb-1.5 border-b border-slate-100 uppercase tracking-wider mb-1.5">
                                {format(day, 'M月d日')} のシフト希望
                              </div>
                              <div className="space-y-1">
                                <Button 
                                  variant={(!isOff && reqPatterns.length === 0) ? "secondary" : "ghost"}
                                  size="sm" 
                                  className="w-full justify-start text-xs font-semibold rounded-lg h-8 px-2"
                                  onClick={() => handleClearOrSetOff(day, 'none')}
                                >
                                  <div className={`w-2.5 h-2.5 rounded-full ${(!isOff && reqPatterns.length === 0) ? "bg-slate-500" : "bg-slate-300"} mr-2`} />
                                  特に希望なし (通常通り)
                                </Button>
                                <Button 
                                  variant={isOff ? "secondary" : "ghost"}
                                  size="sm" 
                                  className="w-full justify-start text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg h-8 px-2"
                                  onClick={() => handleClearOrSetOff(day, 'off')}
                                >
                                  <div className={`w-2.5 h-2.5 rounded-full ${isOff ? "bg-red-500" : "bg-red-300"} mr-2`} />
                                  希望休 (休み希望)
                                </Button>
                                
                                <div className="h-px bg-slate-100 my-1" />
                                <div className="text-[9px] font-extrabold text-slate-400 px-2 pb-1">
                                  希望のシフトをチェック (複数選んで2択・3択にできます):
                                </div>
                                
                                {patterns.map(p => {
                                  const isChecked = reqPatternIds.includes(p.id);
                                  return (
                                    <Button 
                                      key={p.id}
                                      variant={isChecked ? "secondary" : "ghost"}
                                      size="sm" 
                                      className={`w-full justify-start text-xs font-semibold rounded-lg h-8 px-2 ${isChecked ? 'bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-100' : ''}`}
                                      onClick={() => handleTogglePatternPreference(day, p.id)}
                                    >
                                      <div className={`w-3.5 h-3.5 border rounded flex items-center justify-center mr-2 text-[9px] font-bold ${isChecked ? 'bg-sky-600 border-sky-700 text-white' : 'border-slate-300 bg-white'}`}>
                                        {isChecked && "✓"}
                                      </div>
                                      <span className="w-4 h-4 flex items-center justify-center bg-sky-100 text-sky-700 rounded-md text-[9px] font-bold mr-1.5 shrink-0">
                                        {p.shortName}
                                      </span>
                                      <span className="truncate">{p.name} ({p.startTime})</span>
                                    </Button>
                                  );
                                })}
                              </div>
                            </PopoverContent>
                          </Popover>
                        );
                      })}
                    </div>
                  </TabsContent>

                  <TabsContent value="schedule-view" className="m-0 border-none p-0">
                    {!publishedSchedule ? (
                       <Card className="border-dashed border-slate-200 shadow-none rounded-2xl py-20 text-center bg-white/50">
                          <AlertCircle className="w-10 h-10 mx-auto mb-4 text-slate-300" />
                          <div className="text-xl font-bold text-slate-400">現在、公開されたスケジュールはありません。</div>
                          <div className="text-[10px] font-bold text-slate-300 uppercase mt-2 tracking-widest">管理者による確定をお待ちください</div>
                       </Card>
                    ) : (
                      <div className="grid grid-cols-7 border-t border-l border-line shadow-2xl shadow-ink/5 bg-white rounded-lg overflow-hidden">
                        {/* Day Headers */}
                        {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
                          <div key={d} className={`p-2 border-r border-b border-slate-200 bg-slate-50 text-center font-bold text-[11px] uppercase tracking-wider ${i === 0 ? 'text-red-500' : 'text-slate-500'}`}>
                            {d}
                          </div>
                        ))}
                        
                        {/* Empty offsets */}
                        {Array.from({ length: startOfMonth(currentMonth).getDay() }).map((_, i) => (
                          <div key={`empty-${i}`} className="h-24 sm:h-32 border-r border-b border-line bg-zinc-50/20"></div>
                        ))}

                        {daysInMonth.map(day => {
                          const dateStr = format(day, 'yyyy-MM-dd');
                          const assignment = myAssignments.find(a => a.date === dateStr);
                          const pattern = patterns.find(p => p.id === assignment?.patternId);
                          const isToday = format(new Date(), 'yyyy-MM-dd') === dateStr;
                          const isOff = offDates.some(d => isSameDay(d, day));

                          return (
                            <div 
                              key={dateStr} 
                              className={`h-24 sm:h-32 border-r border-b border-line p-2 relative group transition-colors ${isToday ? 'bg-amber-50/30' : ''} ${isOff && !pattern ? 'bg-red-50/10' : ''}`}
                            >
                              <div className={`text-xs font-mono font-black ${day.getDay() === 0 ? 'text-red-400' : 'text-zinc-400'}`}>
                                {format(day, 'dd')}
                              </div>
                              
                              {pattern ? (
                                <div className={`mt-2 p-2 h-[calc(100%-24px)] flex flex-col justify-between border ${pattern.name.includes("夜") ? 'bg-indigo-950 text-white border-indigo-800' : 'bg-white border-zinc-200'} shadow-sm rounded-xl`}>
                                   <div className="text-[10px] font-bold uppercase leading-tight truncate">{pattern.name}</div>
                                   <div className="flex justify-between items-end">
                                      <span className="font-mono text-[9px] opacity-60">{pattern.startTime}</span>
                                      <span className="w-5 h-5 flex items-center justify-center border border-current rounded-full text-[9px] font-black">
                                         {pattern.shortName}
                                      </span>
                                   </div>
                                </div>
                              ) : (
                                <div className="mt-2 h-[calc(100%-24px)] border border-dashed border-zinc-100 bg-zinc-50/20 flex flex-col items-center justify-center opacity-30">
                                   <div className="font-bold text-[9px] uppercase tracking-widest text-slate-300">公休</div>
                                </div>
                              )}

                              {isToday && (
                                <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-amber-500 rounded-full"></div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
           </div>
        </main>
      </div>
    </div>
  );
}
