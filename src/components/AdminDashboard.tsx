import React, { useState, useEffect } from 'react';
import { localDb } from '@/src/lib/localDb';
import { User, ShiftPattern, Requirement, PairRestriction, Schedule, Assignment, Submission, ScheduleRule, Department } from '@/src/types';
import { useAuth } from './AuthProvider';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/table';
import { Badge } from '@/src/components/ui/badge';
import { Calendar } from '@/src/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/src/components/ui/popover';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths } from 'date-fns';
import { toast } from 'sonner';
import { Plus, Users, Clock, Settings, Brain, Save, Trash2, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Check, X, Database, AlertCircle, PanelLeftClose, PanelLeftOpen, Sparkles, Building, CheckSquare, Layers } from 'lucide-react';
import { solveLocalSchedule } from '@/src/utils/localSolver';
import { isHoliday, getJapanHoliday } from '@/src/utils/holidays';

export function AdminDashboard() {
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState("schedule");
  const [currentMonth, setCurrentMonth] = useState(new Date(2026, 4, 1)); // Default to May 2026
  const [showSidebar, setShowSidebar] = useState(true);
  const [generationMode, setGenerationMode] = useState<'local' | 'gemini'>('local');
  const [customPrompt, setCustomPrompt] = useState<string>("");
  const [viewInterval, setViewInterval] = useState<'monthly' | 'weekly'>('monthly');
  const [currentWeekIndex, setCurrentWeekIndex] = useState<number>(0);

  // Departments dynamic state
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>("all");
  const [newDeptName, setNewDeptName] = useState<string>("");

  // Batch requirement states (for Day-of-Week & Shift Time bulk setting)
  const [batchPatternId, setBatchPatternId] = useState<string>("all");
  const [batchDeptId, setBatchDeptId] = useState<string>("all");
  const [batchSelectedDays, setBatchSelectedDays] = useState<boolean[]>([true, true, true]); // [Weekday, Weekend, Holiday]
  const [batchCount, setBatchCount] = useState<number>(2);

  const [users, setUsers] = useState<User[]>([]);
  const [patterns, setPatterns] = useState<ShiftPattern[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [restrictions, setRestrictions] = useState<PairRestriction[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [rules, setRules] = useState<ScheduleRule>({
    id: '',
    hotelId: '',
    maxConsecutiveDays: 5,
    preventDayAfterNight: true,
    limitMaxHours: true,
    limitMinHours: true,
    balanceWeekendShifts: false,
    preferConsecutiveOff: false,
    requireLeaderInShift: false
  });

  // (Helper for seeding)
  const seedDemoData = async () => {
    if (!currentUser) return;
    toast.loading("デモデータを生成中...");

    try {
      const hotelId = currentUser.hotelId;

      // 1. Create Shift Patterns
      const patternData = [
        { name: "A勤 (早番)", shortName: "A", startTime: "07:00", endTime: "16:00", workHours: 8, hotelId },
        { name: "B勤 (遅番)", shortName: "B", startTime: "13:00", endTime: "22:00", workHours: 8, hotelId },
        { name: "夜勤", shortName: "N", startTime: "22:00", endTime: "08:00", workHours: 9, hotelId },
      ];

      const patternIds: string[] = [];
      for (const p of patternData) {
        const id = await localDb.add<ShiftPattern>('shift_patterns', p);
        patternIds.push(id);
      }

      // 2. Create Staff Users
      const staffData = [
        { name: "田中 太郎", role: "STAFF", maxHoursPerMonth: 160, preferredStyle: "DEFAULT", hotelId },
        { name: "佐藤 花子", role: "STAFF", maxHoursPerMonth: 160, preferredStyle: "DAY_MAIN", hotelId },
        { name: "鈴木 一郎", role: "STAFF", maxHoursPerMonth: 160, preferredStyle: "NIGHT_MAIN", hotelId },
        { name: "高橋 優子", role: "STAFF", maxHoursPerMonth: 80, preferredStyle: "DEFAULT", hotelId },
        { name: "伊藤 健太", role: "STAFF", maxHoursPerMonth: 160, preferredStyle: "DEFAULT", hotelId },
      ];

      for (const s of staffData) {
        await localDb.add<User>('users', s as User);
      }

      // 3. Create Requirements for May 2026
      const monthStart = startOfMonth(new Date(2026, 4, 1));
      const monthEnd = endOfMonth(new Date(2026, 4, 1));
      const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

      const reqBatch: any[] = [];
      for (const day of days) {
        const dStr = format(day, "yyyy-MM-dd");
        reqBatch.push({ hotelId, date: dStr, patternId: patternIds[0], count: 2 });
        reqBatch.push({ hotelId, date: dStr, patternId: patternIds[1], count: 2 });
        reqBatch.push({ hotelId, date: dStr, patternId: patternIds[2], count: 1 });
      }
      await localDb.batchSet('requirements', reqBatch);

      toast.dismiss();
      toast.success("デモデータの生成が完了しました。「AI生成を実行」を試してください。");
    } catch (e) {
      console.error(e);
      toast.error("生成に失敗しました。");
    }
  };

  // Subscriptions
  useEffect(() => {
    if (!currentUser) return;

    const refresh = async () => {
      setUsers(await localDb.list<User>('users', currentUser.hotelId));
      setPatterns(await localDb.list<ShiftPattern>('shift_patterns', currentUser.hotelId));
      setRequirements(await localDb.list<Requirement>('requirements', currentUser.hotelId));
      setRestrictions(await localDb.list<PairRestriction>('pair_restrictions', currentUser.hotelId));
      setSchedules(await localDb.list<Schedule>('schedules', currentUser.hotelId));
      setSubmissions(await localDb.list<Submission>('submissions', currentUser.hotelId));

      let deptsList = await localDb.list<Department>('departments', currentUser.hotelId);
      if (deptsList.length === 0) {
        // Seed dynamic departments
        await localDb.add<Department>('departments', { hotelId: currentUser.hotelId, name: "フロント (Front Desk)" });
        await localDb.add<Department>('departments', { hotelId: currentUser.hotelId, name: "客室サービス (Room Service)" });
        deptsList = await localDb.list<Department>('departments', currentUser.hotelId);
      }
      setDepartments(deptsList);

      const rulesList = await localDb.list<ScheduleRule>('schedule_rules', currentUser.hotelId);
      if (rulesList.length > 0) {
        setRules(rulesList[0]);
      } else {
        const defaultRule: Omit<ScheduleRule, 'id'> = {
          hotelId: currentUser.hotelId,
          maxConsecutiveDays: 5,
          preventDayAfterNight: true,
          limitMaxHours: true,
          limitMinHours: true,
          balanceWeekendShifts: false,
          preferConsecutiveOff: false,
          requireLeaderInShift: false
        };
        const newId = await localDb.add<ScheduleRule>('schedule_rules', defaultRule as any);
        setRules({ ...defaultRule, id: newId });
      }
    };

    refresh(); // Initial load

    const unsubUsers = localDb.subscribe('users', refresh);
    const unsubPatterns = localDb.subscribe('shift_patterns', refresh);
    const unsubReqs = localDb.subscribe('requirements', refresh);
    const unsubRest = localDb.subscribe('pair_restrictions', refresh);
    const unsubSch = localDb.subscribe('schedules', refresh);
    const unsubSubs = localDb.subscribe('submissions', refresh);
    const unsubRules = localDb.subscribe('schedule_rules', refresh);
    const unsubDepts = localDb.subscribe('departments', refresh);

    return () => {
      unsubUsers();
      unsubPatterns();
      unsubReqs();
      unsubRest();
      unsubSch();
      unsubSubs();
      unsubRules();
      unsubDepts();
    };
  }, [currentUser]);

  const addStaff = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const primaryDeptId = formData.get("primaryDepartmentId") as string || undefined;
    const newStaff = {
      hotelId: currentUser!.hotelId,
      name: formData.get("name") as string,
      role: "STAFF" as const,
      maxHoursPerMonth: Number(formData.get("maxHours") || 160),
      minHoursPerMonth: Number(formData.get("minHours") || 0),
      preferredStyle: formData.get("preferredStyle") as any || "DEFAULT",
      isLeader: formData.get("isLeader") === "true",
      primaryDepartmentId: primaryDeptId,
      departmentIds: primaryDeptId ? [primaryDeptId] : [],
    };
    await localDb.add<User>('users', newStaff);
    toast.success("スタッフを追加しました");
    (e.target as HTMLFormElement).reset();
  };

  const updateAssignment = async (userId: string, date: string, patternId: string | null, isLockedFallback?: boolean, departmentId?: string) => {
    if (!currentUser) return;
    
    let newAssignments = [...(currentSchedule?.assignments || [])];
    const existingIndex = newAssignments.findIndex(a => a.userId === userId && a.date === date);
    
    if (patternId === null) {
      // Remove assignment (set to Off)
      if (existingIndex !== -1) {
        newAssignments.splice(existingIndex, 1);
      }
    } else {
      // Add or Update assignment
      const isLocked = isLockedFallback !== undefined ? isLockedFallback : true; // Default to locked when manually assigned
      
      const finalDeptId = departmentId || (selectedDeptId !== "all" ? selectedDeptId : (users.find(u => u.id === userId)?.departmentIds?.[0] || departments[0]?.id || ""));
      
      if (existingIndex !== -1) {
        newAssignments[existingIndex] = { 
          ...newAssignments[existingIndex], 
          patternId, 
          isLocked,
          departmentId: finalDeptId
        };
      } else {
        newAssignments.push({ userId, date, patternId, isLocked, departmentId: finalDeptId });
      }
    }

    if (currentSchedule) {
      await localDb.update('schedules', currentSchedule.id, { assignments: newAssignments });
    } else {
      await localDb.add<Schedule>('schedules', {
        hotelId: currentUser.hotelId,
        yearMonth,
        status: 'draft',
        assignments: newAssignments
      });
    }
    toast.success("シフトを更新しました", { duration: 1000 });
  };

  const toggleAssignmentLock = async (userId: string, date: string) => {
    if (!currentUser) return;
    
    let newAssignments = [...(currentSchedule?.assignments || [])];
    const existingIndex = newAssignments.findIndex(a => a.userId === userId && a.date === date);
    
    if (existingIndex !== -1) {
      const currentLoc = !!newAssignments[existingIndex].isLocked;
      const isOff = !newAssignments[existingIndex].patternId || newAssignments[existingIndex].patternId === "OFF";
      
      if (currentLoc && isOff) {
        // 固定されていた「休み」の固定を解除する場合、完全にアサインメントから削除してクリア（変動休み）にする
        newAssignments.splice(existingIndex, 1);
        toast.success("休み（Off）の固定を解除しました (自動生成で変更可能になります)");
      } else {
        // 通常のシフト、または「休み」を固定状態変更する
        newAssignments[existingIndex] = { 
          ...newAssignments[existingIndex], 
          isLocked: !currentLoc 
        };
        toast.success(!currentLoc ? "シフト（休み）を固定しました (自動生成で維持されます)" : "固定を解除しました (自動生成で変更可能になります)");
      }
    } else {
      // まだアサインメントがない（あるいは変動可能な休み状態である）場合、
      // `patternId: ""` でアサインメントを追加して「休み」として固定する
      newAssignments.push({
        userId,
        date,
        patternId: "",
        isLocked: true
      });
      toast.success("休み（Off）を固定しました (自動生成で維持されます)");
    }

    if (currentSchedule) {
      await localDb.update('schedules', currentSchedule.id, { assignments: newAssignments });
    } else {
      await localDb.add<Schedule>('schedules', {
        hotelId: currentUser.hotelId,
        yearMonth,
        status: 'draft',
        assignments: newAssignments
      });
    }
  };

  const deleteUser = async (id: string, name: string) => {
    if (!confirm(`${name}さんを削除してもよろしいですか？`)) return;
    await localDb.delete('users', id);
    toast.success("スタッフを削除しました");
  };
  const yearMonth = format(currentMonth, 'yyyy-MM');
  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth)
  });

  const daysToDisplay = viewInterval === 'monthly'
    ? daysInMonth
    : daysInMonth.slice(currentWeekIndex * 7, (currentWeekIndex * 7) + 7);

  const currentSchedule = schedules.find(s => s.yearMonth === yearMonth);

  // Form Handlers
  const addPattern = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newPattern = {
      hotelId: currentUser!.hotelId,
      name: formData.get("name") as string,
      shortName: formData.get("shortName") as string,
      startTime: formData.get("startTime") as string,
      endTime: formData.get("endTime") as string,
      workHours: Number(formData.get("workHours")),
    };
    await localDb.add<ShiftPattern>('shift_patterns', newPattern);
    toast.success("パターンを追加しました");
    (e.target as HTMLFormElement).reset();
  };

  const updateRequirement = async (date: string, patternId: string, count: number, departmentId?: string) => {
    const finalDeptId = departmentId || selectedDeptId;
    const existing = requirements.find(r => 
      r.date === date && 
      r.patternId === patternId && 
      (r.departmentId || "default") === (finalDeptId || "default")
    );
    if (existing) {
      await localDb.update('requirements', existing.id, { count });
    } else {
      await localDb.add<Requirement>('requirements', {
        hotelId: currentUser!.hotelId,
        date,
        patternId,
        count,
        departmentId: finalDeptId === "all" ? undefined : finalDeptId
      });
    }
  };

  const applyBatchRequirements = async () => {
    if (!currentUser) return;
    if (batchSelectedDays.filter(d => d).length === 0) {
      toast.error("対象となるカテゴリー（平日・休日・祝日）を1つ以上選択してください。");
      return;
    }

    let patternsToUpdate: string[] = [];
    if (batchPatternId === "all") {
      patternsToUpdate = patterns.map(p => p.id);
    } else {
      patternsToUpdate = [batchPatternId];
    }

    const targetDays = daysInMonth.filter(day => {
      const isDayHoliday = isHoliday(day);
      if (isDayHoliday) {
        return batchSelectedDays[2]; // 祝日 (Holiday)
      }
      const dayIndex = day.getDay(); // 0 is Sunday, 1 is Monday, etc.
      const isWeekend = dayIndex === 0 || dayIndex === 6;
      if (isWeekend) {
        return batchSelectedDays[1]; // 休日 (Weekend)
      } else {
        return batchSelectedDays[0]; // 平日 (Weekday)
      }
    });

    if (targetDays.length === 0) {
      toast.error("対象となる日付が今月にありませんでした。");
      return;
    }

    toast.promise(
      (async () => {
        // Run batch updates sequentially
        const targetDeptId = batchDeptId === "all" ? undefined : batchDeptId;
        for (const day of targetDays) {
          const dateStr = format(day, 'yyyy-MM-dd');
          for (const patId of patternsToUpdate) {
            const existing = requirements.find(r => 
              r.date === dateStr && 
              r.patternId === patId && 
              (r.departmentId || "default") === (targetDeptId || "default")
            );
            if (existing) {
              await localDb.update('requirements', existing.id, { count: batchCount });
            } else {
              await localDb.add<Requirement>('requirements', {
                hotelId: currentUser!.hotelId,
                date: dateStr,
                patternId: patId,
                count: batchCount,
                departmentId: targetDeptId
              });
            }
          }
        }
      })(),
      {
        loading: '要件を一括更新中...',
        success: `${targetDays.length}日分の人員要件を正常に一括更新しました！`,
        error: '一括更新中にエラーが発生しました。'
      }
    );
  };

  const toggleForbiddenPair = async (u1Id: string, u2Id: string) => {
    const existing = restrictions.find(r => 
      (r.staffId1 === u1Id && r.staffId2 === u2Id) || (r.staffId1 === u2Id && r.staffId2 === u1Id)
    );
    if (existing) {
      await localDb.delete('pair_restrictions', existing.id);
      toast.info("ペア制限を解除しました");
    } else {
      await localDb.add<PairRestriction>('pair_restrictions', {
        hotelId: currentUser!.hotelId,
        staffId1: u1Id,
        staffId2: u2Id,
        type: "FORBIDDEN"
      });
      toast.success("ペア制限を追加しました");
    }
  };

  const generateAIschedule = async () => {
    toast.promise(
      (async () => {
        let generatedAssignments: Assignment[] = [];

        if (generationMode === 'local') {
          // Local heuristic constraint optimization (Highly robust, instant, works offline)
          await new Promise(resolve => setTimeout(resolve, 800)); // Short natural delay for premium feel

          const staffMembers = users.filter(u => u.role === 'STAFF');
          const monthRequirements = requirements.filter(r => r.date.startsWith(yearMonth));
          const monthSubmissions = submissions.filter(s => s.yearMonth === yearMonth);

          generatedAssignments = solveLocalSchedule(
            yearMonth,
            staffMembers,
            patterns,
            monthRequirements,
            monthSubmissions,
            restrictions,
            rules,
            customPrompt,
            currentSchedule?.assignments || []
          );
        } else {
          // Cloud Gemini API Shift Generator
          const response = await fetch('/api/generate-shift', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              yearMonth,
              staff: users.filter(u => u.role === 'STAFF'),
              patterns,
              requirements: requirements.filter(r => r.date.startsWith(yearMonth)),
              submissions: submissions.filter(s => s.yearMonth === yearMonth), 
              pairRestrictions: restrictions,
              rules,
              customInstructions: customPrompt,
              existingAssignments: currentSchedule?.assignments || []
            })
          });
          
          if (!response.ok) throw new Error("Failed to generate");
          const data = await response.json();
          generatedAssignments = data.assignments;
        }
        
        if (currentSchedule) {
          await localDb.update('schedules', currentSchedule.id, {
            assignments: generatedAssignments,
            status: 'draft'
          });
        } else {
          await localDb.add<Schedule>('schedules', {
            hotelId: currentUser!.hotelId,
            yearMonth,
            status: 'draft',
            assignments: generatedAssignments
          });
        }
      })(),
      {
        loading: generationMode === 'local' 
          ? 'ローカル最適化エンジンが最速計算中...' 
          : 'クラウド Gemini AIが最適なシフトを計算中...',
        success: 'スケジュールの作成に成功しました。',
        error: 'シフトの自動生成に失敗しました。設定を確認してください。'
      }
    );
  };

  const publishSchedule = async () => {
    if (!currentSchedule) return;
    await localDb.update('schedules', currentSchedule.id, { status: 'published' });
    toast.success("スケジュールを公開しました！");
  };

  const deletePattern = async (id: string) => {
    await localDb.delete('shift_patterns', id);
    toast.success("パターンを削除しました");
  };

  const updateUser = async (id: string, data: any) => {
    await localDb.update('users', id, data);
  };

  const updatePrimaryDepartment = async (userId: string, deptId: string) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    const currentDepts = user.departmentIds || [];
    let updatedList = [...currentDepts];
    if (deptId && !updatedList.includes(deptId)) {
      updatedList.push(deptId);
    }
    await localDb.update('users', userId, {
      primaryDepartmentId: deptId || undefined,
      departmentIds: updatedList
    });
    toast.success("メイン部署を更新しました（対応スキルにも自動追加されました）");
  };

  const updateRuleSettings = async (updates: Partial<ScheduleRule>) => {
    if (!rules.id) return;
    const newRules = { ...rules, ...updates };
    setRules(newRules);
    await localDb.update('schedule_rules', rules.id, updates);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar: Constraints & Rules */}
        {showSidebar && (
          <aside className="w-72 border-r border-line flex flex-col bg-white/20 shrink-0 overflow-y-auto">
            <div className="p-4 flex-1 space-y-8">
              <div>
                <div className="grid-header mb-4">システム設定状況</div>
                <div className="space-y-3">
                  <div className="p-3 border border-line/10 rounded bg-white/40">
                    <div className="text-[10px] font-black opacity-50 uppercase mb-1">スタッフ収容力</div>
                    <div className="flex justify-between items-end">
                      <span className="text-lg font-bold tracking-tight leading-none text-slate-800">
                        {users.filter(u => u.role === 'STAFF').length} 名
                      </span>
                      <span className="text-[10px] text-emerald-600 font-bold">有効</span>
                    </div>
                  </div>
                  <div className="p-3 border border-line/10 rounded bg-white/40">
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">シフトパターン</div>
                    <div className="flex justify-between items-end">
                      <span className="text-lg font-bold tracking-tight leading-none text-slate-800">{patterns.length} 種類</span>
                      <span className="text-[10px] text-blue-600 font-bold">設定済み</span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="grid-header mb-4">ペア禁止設定</div>
                <div className="space-y-2">
                  {restrictions.map(r => {
                    const u1 = users.find(u => u.id === r.staffId1);
                    const u2 = users.find(u => u.id === r.staffId2);
                    return (
                      <div key={r.id} className="flex justify-between items-center py-2 px-3 bg-slate-50 border border-slate-100 rounded text-xs">
                        <span className="font-semibold text-slate-700 truncate max-w-[120px]">{u1?.name} & {u2?.name}</span>
                        <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[9px] font-bold rounded">制限あり</span>
                      </div>
                    );
                  })}
                  {restrictions.length === 0 && <div className="text-[10px] text-slate-400 font-medium">制限ペアはありません</div>}
                </div>
              </div>

              <div className="pt-4 space-y-2">
                <Button onClick={() => setActiveTab('patterns')} variant="outline" className={`w-full justify-start font-bold text-[11px] rounded-xl border-slate-200 ${activeTab === 'patterns' ? 'bg-slate-100 border-slate-300' : ''}`}>
                  <Settings className="w-3 h-3 mr-2" /> 勤務パターン設定
                </Button>
                <Button onClick={() => setActiveTab('staff')} variant="outline" className={`w-full justify-start font-bold text-[11px] rounded-xl border-slate-200 ${activeTab === 'staff' ? 'bg-slate-100 border-slate-300' : ''}`}>
                  <Users className="w-3 h-3 mr-2" /> スタッフマスター管理
                </Button>
                <Button onClick={() => setActiveTab('departments')} variant="outline" className={`w-full justify-start font-bold text-[11px] rounded-xl border-slate-200 ${activeTab === 'departments' ? 'bg-slate-100 border-slate-300' : ''}`}>
                  <Building className="w-3 h-3 mr-2 text-blue-600" /> 部署・スキルマスター
                </Button>
                <Button onClick={() => setActiveTab('rules')} variant="outline" className={`w-full justify-start font-bold text-[11px] rounded-xl border-indigo-200 text-indigo-700 bg-indigo-50/20 hover:bg-indigo-50 ${activeTab === 'rules' ? 'bg-indigo-50 border-indigo-300' : ''}`}>
                  <Brain className="w-3 h-3 mr-2 text-indigo-600 animate-pulse" /> 自動生成・AIルール設定
                </Button>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50">
              <div className="text-[10px] font-bold mb-2 text-slate-400 uppercase">システム状況</div>
              <div className="text-[10px] leading-tight text-slate-400 space-y-1 font-bold">
                <div className="flex gap-1"><span>&gt;</span> <span>待機中</span></div>
                <div className="flex gap-1"><span>&gt;</span> <span>対象月: {yearMonth}</span></div>
                {currentSchedule && (
                  <div className="flex gap-1 text-emerald-600"><span>&gt;</span> <span>ステータス: {currentSchedule.status === 'published' ? '公開済み' : '編集中'}</span></div>
                )}
              </div>
            </div>
          </aside>
        )}

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col bg-white overflow-hidden">
          {/* Controls Bar */}
          <div className="h-14 border-b border-line flex items-center px-4 gap-4 shrink-0 justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 bg-white shadow-sm shrink-0"
                onClick={() => setShowSidebar(!showSidebar)}
                title={showSidebar ? "サイドバーを隠す" : "サイドバーを表示"}
              >
                {showSidebar ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
              </Button>
              
              <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-xs font-bold px-3 text-slate-600">{format(currentMonth, 'yyyy年 M月')}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="h-9">
                <TabsList className="bg-slate-100 border border-slate-200 h-9 p-1 rounded-xl">
                  <TabsTrigger value="schedule" className="text-[11px] font-bold h-full rounded-lg">シフト表</TabsTrigger>
                  <TabsTrigger value="requirements" className="text-[11px] font-bold h-full rounded-lg">人員要件</TabsTrigger>
                  <TabsTrigger value="submissions" className="text-[11px] font-bold h-full rounded-lg">希望提出一覧</TabsTrigger>
                </TabsList>
              </Tabs>
              {activeTab === 'schedule' && (
                <div className="flex items-center gap-0.5 bg-slate-100 p-1 rounded-xl border border-slate-200 h-9">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewInterval('monthly')}
                    className={`h-7 rounded-sm text-[10px] font-bold px-2.5 transition-all ${viewInterval === 'monthly' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-900 bg-transparent'}`}
                  >
                    月間
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setViewInterval('weekly');
                      setCurrentWeekIndex(0);
                    }}
                    className={`h-7 rounded-sm text-[10px] font-bold px-2.5 transition-all ${viewInterval === 'weekly' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-900 bg-transparent'}`}
                  >
                    週間
                  </Button>
                </div>
              )}
              <div className="w-px h-4 bg-slate-200 mx-1"></div>
              <div className="flex items-center gap-1 border border-slate-200 bg-slate-50 p-1 rounded-xl h-9 shadow-sm shrink-0">
                <Select value={generationMode} onValueChange={(val: any) => setGenerationMode(val)}>
                  <SelectTrigger className="w-36 h-7 text-[10px] font-bold border-none shadow-none bg-transparent hover:bg-slate-100/50 rounded-lg">
                    <SelectValue placeholder="生成モード" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="local" className="text-[11px] font-bold">
                      💻 ローカル高速エンジン
                    </SelectItem>
                    <SelectItem value="gemini" className="text-[11px] font-bold">
                      ☁️ クラウド Gemini AI
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Button 
                  onClick={generateAIschedule} 
                  size="sm" 
                  className="bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold text-[10px] h-7 px-3.5 shadow-sm transition-all"
                  title={generationMode === 'local' ? "ブラウザ内で拘束ルールを厳守して瞬時にスケジュールを構築します" : "クラウドAPI経由でGeminiモデルによりシフトを生成します"}
                >
                  {generationMode === 'local' ? '自動生成' : 'AI生成'}
                </Button>
              </div>
              {currentSchedule?.status === 'draft' && (
                <Button onClick={publishSchedule} size="sm" variant="outline" className="border-slate-200 text-slate-700 rounded-xl font-bold text-[11px] h-9 px-5 hover:bg-slate-50 transition-all">
                  本番公開
                </Button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-auto relative">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
              <TabsContent value="schedule" className="m-0 h-full">
                {generationMode === 'gemini' && (
                  <div className="bg-gradient-to-r from-violet-50/40 to-indigo-50/30 border-b border-indigo-100/60 p-4 shrink-0">
                    <div className="max-w-4xl space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
                          Gemini AI へのシフト調整指示（自然言語で条件を指定）
                        </Label>
                        <span className="text-[9px] font-black text-indigo-600 bg-indigo-100/80 px-2 py-0.5 rounded-md tracking-wider">AI CUSTOMIZE</span>
                      </div>
                      
                      <textarea
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        placeholder="例）5月3日〜5日のGW期間中は特定の人員を追加して。Aさんの夜勤は最大2回までにして。水曜日はCさんとDさんが同じ勤務（ペア）になるのを避けて、など。"
                        className="w-full min-h-[52px] p-3 text-[11px] font-medium text-slate-800 placeholder-slate-400 bg-white border border-indigo-200/60 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all resize-none shadow-xs"
                      />
                      
                      <div className="flex items-center justify-between gap-4 flex-wrap md:flex-nowrap">
                        <div className="flex flex-wrap gap-1.5 items-center">
                          <span className="text-[9.5px]/none font-black text-indigo-800 mr-1 flex items-center gap-1">
                            ⚡️ クイック指示:
                          </span>
                          {[
                            "GW（5/3〜5/5）はAさんとBさんのどちらか1名は必ず出勤",
                            "スタッフの夜勤連勤（夜勤の次の日も夜勤）を禁止する",
                            "特定のスタッフの土日シフトを極力減らす"
                          ].map((sample, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setCustomPrompt(sample)}
                              className="text-[9px] font-bold text-indigo-700 bg-indigo-50/80 hover:bg-indigo-100 border border-indigo-200/40 px-2 flex items-center h-6 rounded-lg transition-all"
                            >
                              + {sample}
                            </button>
                          ))}
                          {customPrompt && (
                            <button
                              type="button"
                              onClick={() => setCustomPrompt("")}
                              className="text-[9px] font-black text-rose-650 hover:text-rose-750 px-2 py-0.5 transition-colors"
                            >
                              クリア
                            </button>
                          )}
                        </div>
                        <Button
                          onClick={generateAIschedule}
                          size="sm"
                          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-[10.5px] h-7 px-3.5 flex items-center gap-1.5 shrink-0 shadow-sm transition-all"
                          title="この指示を考慮してクラウドGemini AIでシフトを生成します"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
                          指示を反映してAI生成
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {generationMode === 'local' && (
                  <div className="bg-gradient-to-r from-slate-50/60 to-blue-50/40 border-b border-blue-100/60 p-4 shrink-0">
                    <div className="max-w-4xl space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Brain className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
                          自動生成アルゴリズムへの追加指示（キーワード検知によるルール適用）
                        </Label>
                        <span className="text-[9px] font-black text-blue-600 bg-blue-100/80 px-2 py-0.5 rounded-md tracking-wider">LOCAL REWRITES</span>
                      </div>
                      
                      <textarea
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        placeholder="例）連勤は3日までに制限する。土日は均等にする。2日以上の連休を優先。各シフト枠にリーダーを配置する、など。"
                        className="w-full min-h-[52px] p-3 text-[11px] font-medium text-slate-800 placeholder-slate-400 bg-white border border-blue-200/60 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none shadow-xs"
                      />
                      
                      <div className="flex items-center justify-between gap-4 flex-wrap md:flex-nowrap">
                        <div className="flex flex-wrap gap-1.5 items-center">
                          <span className="text-[9.5px]/none font-black text-slate-500 mr-1 flex items-center gap-1">
                            ⚡️ クイック指示:
                          </span>
                          {[
                            "連勤の上限を3日以内にする",
                            "土日祝のシフトを全員で均等化する",
                            "2日以上の連休を優先しやすくする",
                            "各シフトの勤務枠にリーダーを常駐させる"
                          ].map((sample, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setCustomPrompt(sample)}
                              className="text-[9px] font-bold text-blue-700 bg-blue-50/80 hover:bg-blue-100 border border-blue-200/40 px-2 flex items-center h-6 rounded-lg transition-all"
                            >
                              + {sample}
                            </button>
                          ))}
                          {customPrompt && (
                            <button
                              type="button"
                              onClick={() => setCustomPrompt("")}
                              className="text-[9px] font-black text-rose-650 hover:text-rose-750 px-2 py-0.5 transition-colors"
                            >
                              クリア
                            </button>
                          )}
                        </div>
                        <Button
                          onClick={generateAIschedule}
                          size="sm"
                          className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-[10.5px] h-7 px-3.5 flex items-center gap-1.5 shrink-0 shadow-sm transition-all"
                          title="この指示を考慮してローカルエンジンでシフトを生成します"
                        >
                          <Brain className="w-3.5 h-3.5 text-blue-200" />
                          指示を反映して自動生成
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {viewInterval === 'weekly' && daysToDisplay.length > 0 && (
                  <div className="bg-slate-50 border-b border-slate-200 p-2.5 flex items-center justify-between shadow-xs shrink-0">
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentWeekIndex === 0}
                        onClick={() => setCurrentWeekIndex(prev => Math.max(0, prev - 1))}
                        className="h-7 text-[10px] font-bold rounded-lg border-slate-200 bg-white hover:bg-slate-50 shadow-xs"
                      >
                        ◀ 前の週
                      </Button>
                      <span className="text-[11px] font-black text-slate-700 bg-slate-200/55 border border-slate-300/30 px-3 py-1 rounded-lg">
                        週次表示 :: 第 {currentWeekIndex + 1} 週 ({format(daysToDisplay[0], 'M/d')} 〜 {format(daysToDisplay[daysToDisplay.length - 1], 'M/d')})
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={(currentWeekIndex + 1) * 7 >= daysInMonth.length}
                        onClick={() => setCurrentWeekIndex(prev => Math.min(Math.ceil(daysInMonth.length / 7) - 1, prev + 1))}
                        className="h-7 text-[10px] font-bold rounded-lg border-slate-200 bg-white hover:bg-slate-50 shadow-xs"
                      >
                        次の週 ▶
                      </Button>
                    </div>
                    <div className="text-[9.5px] font-black text-slate-400 mr-2 uppercase tracking-tight">
                      表示期間: {daysToDisplay.length}日間
                    </div>
                  </div>
                )}

                <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
                  <div className="flex items-center gap-2">
                    <Building className="w-4 h-4 text-blue-650" />
                    <div>
                      <h2 className="text-xs font-bold text-slate-800 leading-tight">表示部署フィルター</h2>
                      <p className="text-[10px] text-slate-400 font-medium">選択された部署スキルを持つスタッフと、その配置勤務のみを表示・最適化します。</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500 whitespace-nowrap">部署選択:</span>
                    <Select value={selectedDeptId} onValueChange={setSelectedDeptId}>
                      <SelectTrigger className="w-48 h-8 rounded-lg border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 transition-colors">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-lg">
                        <SelectItem value="all">🌐 すべての部署 (統合表示)</SelectItem>
                        {departments.map(dept => (
                          <SelectItem key={dept.id} value={dept.id}>
                            🏢 {dept.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="min-w-max">
                  {/* Grid Header */}
                  <div className="flex border-b border-line bg-zinc-50 shrink-0 sticky top-0 z-20">
                    <div className="w-40 border-r border-line bg-white flex items-center px-4 shrink-0">
                      <span className="grid-header w-full">スタッフ割当レジストリ</span>
                    </div>
                    <div className="flex">
                      {daysToDisplay.map(day => {
                        const isDayHoliday = isHoliday(day);
                        const dayOfWeek = day.getDay();
                        const isSunday = dayOfWeek === 0;
                        const isSaturday = dayOfWeek === 6;
                        
                        let headerBg = "bg-white";
                        if (isDayHoliday || isSunday) {
                          headerBg = "bg-rose-50/45";
                        } else if (isSaturday) {
                          headerBg = "bg-blue-50/20";
                        }

                        let textClass = "text-slate-600";
                        if (isDayHoliday || isSunday) {
                          textClass = "text-rose-500 font-extrabold";
                        } else if (isSaturday) {
                          textClass = "text-blue-500 font-extrabold";
                        }

                        return (
                          <div key={day.toString()} className={`w-12 border-r border-line/20 text-center py-1 flex flex-col justify-center ${headerBg}`} title={isDayHoliday ? getJapanHoliday(day) || '祝日' : undefined}>
                            <div className="text-[8px] opacity-55 font-mono leading-none mb-0.5">{format(day, 'EEE').toUpperCase()}</div>
                            <div className={`text-[11px] font-black font-mono ${textClass} leading-tight`}>
                              {format(day, 'dd')}
                            </div>
                            {isDayHoliday && (
                              <span className="text-[7px] text-rose-600 font-black tracking-tighter leading-none mt-0.5 scale-90">祝</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Grid Rows */}
                  {users.filter(u => u.role === 'STAFF').filter(u => {
                    if (selectedDeptId === "all") return true;
                    return u.departmentIds?.includes(selectedDeptId);
                  }).map(u => {
                    const staffAssignmentsAll = currentSchedule?.assignments?.filter(a => a.userId === u.id) || [];
                    const totalWorkHours = staffAssignmentsAll.reduce((acc, curr) => {
                      const pattern = patterns.find(p => p.id === curr.patternId);
                      return acc + (pattern?.workHours || 0);
                    }, 0);

                    return (
                      <div key={u.id} className="flex border-b border-zinc-200 hover:bg-zinc-50 group">
                        <div className="w-40 border-r border-slate-200 p-2 shrink-0 bg-white sticky left-0 z-10 flex flex-col justify-center">
                          <div className="text-xs font-bold text-slate-800 truncate leading-tight flex justify-between items-center">
                            <span>{u.name}</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] mt-1.5 gap-1">
                            <span className="font-mono bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-black shrink-0">
                              {totalWorkHours}h
                            </span>
                            <span className="text-[9px] text-slate-400 font-bold truncate">
                              ({u.minHoursPerMonth ?? 0}h-{u.maxHoursPerMonth}h)
                            </span>
                          </div>
                          {/* 制限チェック */}
                          {((totalWorkHours > u.maxHoursPerMonth) || (totalWorkHours < (u.minHoursPerMonth ?? 0))) && (
                            <div className={`text-[8px] font-black px-1.5 py-0.5 rounded mt-1.5 text-center leading-none ${totalWorkHours > u.maxHoursPerMonth ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                              {totalWorkHours > u.maxHoursPerMonth ? '上限超過' : '下限未達'}
                            </div>
                          )}
                          <div className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tight">{u.preferredStyle}</div>
                        </div>
                        <div className="flex">
                          {daysToDisplay.map(day => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const allDayAssignments = currentSchedule?.assignments?.filter(a => a.date === dateStr && a.userId === u.id) || [];
                            const assignment = allDayAssignments.find(a => 
                              selectedDeptId === "all" ? true : a.departmentId === selectedDeptId
                            );
                            const otherDeptAssignment = allDayAssignments.find(a => 
                              selectedDeptId !== "all" && a.departmentId !== selectedDeptId
                            );

                            const pattern = patterns.find(p => p.id === assignment?.patternId);
                            
                            // スタッフの提出希望をロード
                            const sub = submissions.find(s => s.userId === u.id && s.yearMonth === yearMonth);
                            const isOff = sub?.offDates?.includes(dateStr);
                            const req = sub?.specificRequests?.find(r => r.date === dateStr);
                            const reqPatternIds = req ? (req.patternIds || ((req as any).patternId ? [(req as any).patternId] : [])) : [];
                            const reqPatterns = patterns.filter(p => reqPatternIds.includes(p.id));

                            let cellClass = "cell-off";
                            if (pattern) {
                              if (pattern.name.includes("夜")) cellClass = "cell-n";
                              else if (pattern.name.includes("A")) cellClass = "cell-a";
                              else cellClass = "cell-sp";
                            }

                            const isAssignmentLocked = !!assignment?.isLocked;

                            // Render special block if they working in other department today
                            if (otherDeptAssignment) {
                              const otherDeptName = departments.find(d => d.id === otherDeptAssignment.departmentId)?.name || '他';
                              const otherPatShort = patterns.find(p => p.id === otherDeptAssignment.patternId)?.shortName || '';
                              return (
                                <div key={dateStr} className="w-12 h-10 border-r border-zinc-100 flex items-center justify-center p-1 bg-amber-50/20">
                                  <div className="w-full h-full rounded-sm text-[8px] font-black flex flex-col items-center justify-center bg-amber-50 border border-amber-200/50 text-amber-700 opacity-80" title={`他部署（${otherDeptName}）で勤務（${otherPatShort}）が割り当てられています。同時に２箇所に割り当てることはできません。`}>
                                    <span>他専属</span>
                                    <span className="text-[7px] font-extrabold leading-none">{otherPatShort}</span>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <Popover key={dateStr}>
                                <PopoverTrigger>
                                  <div className={`w-12 h-10 border-r border-zinc-100 flex items-center justify-center p-1 cursor-pointer transition-colors hover:bg-slate-100 relative ${isAssignmentLocked ? 'bg-slate-50/10' : ''}`}>
                                    <div className={`w-full h-full rounded-sm text-[9px] font-bold flex flex-col items-center justify-center transition-all ${cellClass} ${pattern ? 'shadow-sm gap-0.5' : ''} ${isAssignmentLocked ? 'ring-2 ring-slate-400 ring-offset-0.5' : ''}`}>
                                      <span>{pattern ? pattern.shortName : ''}</span>
                                      {pattern && assignment?.departmentId && selectedDeptId === "all" && (
                                        <span className="text-[6.5px] scale-90 leading-none opacity-60 bg-white/40 px-0.5 rounded font-black max-w-full truncate" title={departments.find(d => d.id === assignment.departmentId)?.name}>
                                          {departments.find(d => d.id === assignment.departmentId)?.name.split(' ')[0]}
                                        </span>
                                      )}
                                    </div>
                                    
                                    {/* 固定的オーバーレイ鍵アイコン */}
                                    {isAssignmentLocked && (
                                      <div className="absolute top-[3px] left-[3px] text-[7.5px] leading-none" title="固定済み（自動生成で維持されます）" style={{ textShadow: "1px 1px 0px white" }}>
                                        🔒
                                      </div>
                                    )}

                                    {/* ポップアップドット表示で希望を可視化 */}
                                    {isOff && (
                                      <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full ring-1 ring-white" title="本人希望：希望休" />
                                    )}
                                    {!isOff && reqPatterns.length > 0 && (
                                      <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-sky-500 rounded-full ring-1 ring-white" title={`本人希望：${reqPatterns.map(p => p.shortName).join(' or ')}`} />
                                    )}
                                  </div>
                                </PopoverTrigger>
                                <PopoverContent className="w-56 p-2.5 rounded-xl shadow-2xl border-slate-200" side="bottom" align="center">
                                  <div className="text-[10px] font-bold text-slate-400 uppercase mb-2 px-1 flex justify-between items-center">
                                    <span>シフト割当</span>
                                    {isAssignmentLocked && (
                                      <span className="text-[8px] font-extrabold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">🔒 固定中</span>
                                    )}
                                  </div>
                                  
                                  {/* 希望インフォを表示 */}
                                  {isOff ? (
                                    <div className="mb-2 px-1.5 py-1 bg-red-50 border border-red-100 rounded-lg text-[10px] font-bold text-red-600 flex items-center gap-1">
                                      <span>❌ 本人希望: 希望休 (お休み)</span>
                                    </div>
                                  ) : reqPatterns.length > 0 ? (
                                    <div className="mb-2 px-1.5 py-1 bg-sky-50/80 border border-sky-100 rounded-lg text-[9px] font-bold text-sky-800 flex flex-col gap-0.5">
                                      <span>⭐ 本人希望: {reqPatterns.map(p => `${p.name}`).join(' or ')}</span>
                                    </div>
                                  ) : (
                                    <div className="mb-2 px-1.5 py-1 bg-slate-50 border border-slate-100 rounded-lg text-[9px] font-bold text-slate-400">
                                      希望なし (管理者おまかせ)
                                    </div>
                                  )}

                                  {/* 配置部署 (Skill Dept selection inside Popover) */}
                                  {pattern && (
                                    <div className="mb-2 px-1">
                                      <Label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">配置先部署スキル</Label>
                                      <div className="flex flex-wrap gap-1">
                                        {(u.departmentIds && u.departmentIds.length > 0 ? departments.filter(d => u.departmentIds?.includes(d.id)) : departments).map(d => {
                                          const isActive = assignment?.departmentId === d.id;
                                          return (
                                            <button
                                              key={d.id}
                                              onClick={() => updateAssignment(u.id, dateStr, pattern.id, isAssignmentLocked, d.id)}
                                              className={`px-2 py-0.5 text-[8.5px] font-bold rounded-lg border transition-all ${isActive ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                                            >
                                              {d.name.split(' ')[0]}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  <div className="space-y-1">
                                    {patterns.map(p => {
                                      const isPreferred = reqPatternIds.includes(p.id);
                                      return (
                                        <Button 
                                          key={p.id} 
                                          variant={pattern?.id === p.id ? "default" : "ghost"}
                                          size="sm" 
                                          className={`w-full justify-start text-[11px] h-8 rounded-lg relative ${isPreferred && pattern?.id !== p.id ? 'border border-sky-200 bg-sky-50/20 text-sky-800' : ''}`}
                                          onClick={() => {
                                            // Assign to the selected department filter, or the staff's first skill
                                            const activeDept = selectedDeptId !== "all" ? selectedDeptId : (u.departmentIds?.[0] || departments[0]?.id || "");
                                            updateAssignment(u.id, dateStr, p.id, isAssignmentLocked, activeDept);
                                          }}
                                        >
                                          <div className={`w-4 h-4 rounded-sm mr-2 flex items-center justify-center text-[8px] font-bold ${p.name.includes("夜") ? 'bg-indigo-900 text-white' : p.name.includes("A") ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                            {p.shortName}
                                          </div>
                                          {p.name}
                                          {isPreferred && (
                                            <span className="absolute right-2 text-[8px] font-bold text-sky-600">⭐ 希望</span>
                                          )}
                                        </Button>
                                      );
                                    })}
                                    <Button 
                                      variant={!pattern ? "default" : "ghost"}
                                      size="sm" 
                                      className={`w-full justify-start text-[11px] h-8 rounded-lg text-slate-500 relative ${isOff && pattern ? 'border border-red-200 bg-red-50/20 text-red-700' : ''}`}
                                      onClick={() => updateAssignment(u.id, dateStr, null)}
                                    >
                                      <X className="w-3 h-3 mr-2 text-red-500" />
                                      休み (Off)
                                      {isOff && (
                                        <span className="absolute right-2 text-[8px] font-bold text-red-500">⭐ 希望</span>
                                      )}
                                    </Button>
                                  </div>

                                  {/* シフト固定トグルUI */}
                                  <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-1 animate-in fade-in slide-in-from-bottom-1">
                                    <div className="flex flex-col">
                                      <span className="text-[9.5px]/none font-black text-slate-700 flex items-center gap-1">
                                        {isAssignmentLocked ? "🔒 固定（自動生成で維持）" : "🔓 変動（自動生成で変更可）"}
                                      </span>
                                      <span className="text-[8px] text-slate-400 font-medium leading-normal mt-0.5">
                                        {isAssignmentLocked ? "自動生成で変更されません" : "自動生成時に変動・上書きされます"}
                                      </span>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant={isAssignmentLocked ? "default" : "outline"}
                                      onClick={() => toggleAssignmentLock(u.id, dateStr)}
                                      className={`h-6.5 px-2 text-[8.5px] font-bold rounded-lg shrink-0 transition-all ${isAssignmentLocked ? "bg-slate-900 text-white hover:bg-slate-800" : "border-slate-200 hover:bg-slate-50 text-slate-600"}`}
                                    >
                                      {isAssignmentLocked ? "解除" : "固定"}
                                    </Button>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {/* Requirement Summary Footer */}
                  <div className="flex h-24 border-t border-slate-200 bg-white sticky bottom-0 z-20">
                    <div className="w-40 border-r border-slate-200 flex flex-col justify-center px-4 shrink-0 bg-slate-50">
                      <span className="text-[9px] font-bold text-slate-400 uppercase mb-2">充足状況</span>
                      <div className="flex flex-col gap-1">
                        {patterns.map(p => (
                          <div key={p.id} className="flex justify-between items-center text-[10px] font-bold">
                            <span className="text-slate-400">{p.shortName}:</span>
                            <span className="text-slate-600 truncate max-w-[80px]">{p.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex">
                      {daysToDisplay.map(day => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        return (
                          <div key={dateStr} className="w-12 border-r border-slate-100 flex flex-col items-center justify-center gap-1">
                            {patterns.map(p => {
                              const req = requirements.find(r => 
                                r.date === dateStr && 
                                r.patternId === p.id && 
                                (selectedDeptId === "all" ? !r.departmentId : r.departmentId === selectedDeptId)
                              );
                              const currentCount = currentSchedule?.assignments?.filter(a => 
                                a.date === dateStr && 
                                a.patternId === p.id && 
                                (selectedDeptId === "all" ? true : a.departmentId === selectedDeptId)
                              ).length || 0;
                              const targetCount = req?.count || 0;
                              const satisfied = currentCount >= targetCount;
                              
                              return (
                                <div key={p.id} className={`text-[10px] font-bold leading-none ${!satisfied && targetCount > 0 ? 'text-red-500 font-bold bg-red-50 px-1 rounded' : 'text-slate-400'}`}>
                                  {currentCount}/{targetCount}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="requirements" className="m-0">
                <div className="p-8 max-w-5xl mx-auto space-y-6">
                  {/* Info alert banner */}
                  <div className="flex justify-between items-center bg-blue-50/40 p-5 border border-blue-100 rounded-2xl">
                    <div>
                      <h3 className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-blue-600" />
                        稼働要件（必要出勤人数）の設定
                      </h3>
                      <p className="text-[10px] text-blue-700 mt-1">
                        シフト自動生成エンジンが参照する、日付ごと・シフト時間帯ごとの最低出勤目標人数を設定します。
                      </p>
                    </div>
                  </div>

                  {/* 人員要件の一括入力パネル (Batch Input Panel) */}
                  <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden bg-white border-indigo-150 shadow-indigo-50/30">
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 p-6">
                      <div>
                        <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                          <Brain className="w-4.5 h-4.5 text-indigo-600 animate-pulse" />
                          人員要件の一括登録
                        </CardTitle>
                        <CardDescription className="text-[11px] font-medium text-slate-500 mt-1">
                          特定のカテゴリー（平日・休日・祝日）やシフト時間帯に対して、出勤必要人数を一括登録・更新します。
                        </CardDescription>
                      </div>
                    </CardHeader>
                     <CardContent className="p-6 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                        {/* 1. Target Department */}
                        <div className="space-y-2 md:col-span-4 border-r border-slate-100 pr-2">
                          <Label className="text-xs font-bold text-slate-700">対象部署</Label>
                          <Select value={batchDeptId} onValueChange={setBatchDeptId}>
                            <SelectTrigger className="h-10 text-xs font-bold rounded-xl border-slate-200">
                              <SelectValue placeholder="対象部署を選択" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              <SelectItem value="all" className="text-xs font-bold">🌐 すべての部署 (一般)</SelectItem>
                              {departments.map(dept => (
                                <SelectItem key={dept.id} value={dept.id} className="text-xs font-medium">
                                  🏢 {dept.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-[10px] text-slate-400 font-medium">
                            一括設定を適用する部署を選択します。
                          </p>
                        </div>

                        {/* 2. Target Shift Pattern */}
                        <div className="space-y-2 md:col-span-4">
                          <Label className="text-xs font-bold text-slate-700">対象シフト帯</Label>
                          <Select value={batchPatternId} onValueChange={setBatchPatternId}>
                            <SelectTrigger className="h-10 text-xs font-bold rounded-xl border-slate-200">
                              <SelectValue placeholder="対象シフトを選択" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              <SelectItem value="all" className="text-xs font-bold">📂 すべてのシフトパターン</SelectItem>
                              {patterns.map(p => (
                                <SelectItem key={p.id} value={p.id} className="text-xs font-medium">
                                  {p.name} ({p.startTime}〜{p.endTime})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-[10px] text-slate-400 font-medium">
                            必要人数を入力したい時間帯パターンを選択してください。
                          </p>
                        </div>

                        {/* 3. Target Category Multi-Select */}
                        <div className="space-y-2 md:col-span-4">
                          <div className="flex justify-between items-center h-5">
                            <Label className="text-xs font-bold text-slate-700">対象のカテゴリ（複数選択可）</Label>
                            <div className="flex gap-1 flex-wrap">
                              <Button 
                                type="button" 
                                variant="outline" 
                                size="sm" 
                                className="text-[9px] font-bold h-6 px-2 rounded-lg border-slate-200 hover:bg-slate-100 text-slate-600 shadow-none"
                                onClick={() => setBatchSelectedDays([true, true, true])}
                              >
                                全選択
                              </Button>
                              <Button 
                                type="button" 
                                variant="outline" 
                                size="sm" 
                                className="text-[9px] font-bold h-6 px-2 rounded-lg border-slate-200 hover:bg-slate-150 text-slate-500 shadow-none"
                                onClick={() => setBatchSelectedDays([false, false, false])}
                              >
                                クリア
                              </Button>
                            </div>
                          </div>
 
                          <div className="grid grid-cols-3 gap-2 bg-slate-50 p-1.5 border border-slate-100 rounded-xl">
                            {[
                              { label: "平日", sub: "月〜金 (除く祝日)", colorClass: "bg-indigo-650 text-white border-indigo-650 bg-indigo-600 border-indigo-600 hover:bg-indigo-700 font-extrabold shadow-sm" },
                              { label: "休日", sub: "土・日 (除く祝日)", colorClass: "bg-rose-500 text-white border-rose-500 hover:bg-rose-600 font-extrabold shadow-sm" },
                              { label: "祝日", sub: "祝日・振替休日", colorClass: "bg-red-500 text-white border-red-500 hover:bg-red-650 font-extrabold shadow-sm" }
                            ].map((item, idx) => {
                              const isChecked = batchSelectedDays[idx];
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => {
                                    const next = [...batchSelectedDays];
                                    next[idx] = !next[idx];
                                    setBatchSelectedDays(next);
                                  }}
                                  className={`flex flex-col items-center justify-center py-2 px-2 rounded-lg shadow-xs transition-all border ${
                                    isChecked 
                                      ? item.colorClass
                                      : "bg-white text-slate-400 border-slate-200 hover:bg-slate-50"
                                  }`}
                                >
                                  <span className="text-xs font-bold leading-tight">{item.label}</span>
                                  <span className={`text-[8px] mt-0.5 leading-none whitespace-nowrap overflow-hidden ${isChecked ? 'text-white/80' : 'text-slate-400'}`}>
                                    {item.sub}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
                        {/* 3. Target value & submit */}
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                          <Label className="text-xs font-bold text-slate-700 shrink-0">一括設定する出勤必要人員</Label>
                          <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 p-1 shrink-0">
                            <Button 
                              type="button" 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => setBatchCount(Math.max(0, batchCount - 1))}
                              className="h-7 w-7 rounded-lg hover:bg-white text-slate-600 font-extrabold"
                            >
                              -
                            </Button>
                            <Input 
                              type="number" 
                              className="w-12 h-7 border-none bg-transparent font-bold text-center text-xs p-0 focus-visible:ring-0 shadow-none font-mono"
                              value={batchCount}
                              onChange={(e) => setBatchCount(Math.max(0, parseInt(e.target.value) || 0))}
                            />
                            <Button 
                              type="button" 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => setBatchCount(batchCount + 1)}
                              className="h-7 w-7 rounded-lg hover:bg-white text-slate-600 font-extrabold"
                            >
                              +
                            </Button>
                          </div>
                          <span className="text-xs text-slate-500 font-extrabold">名／日</span>
                        </div>

                        <Button 
                          onClick={applyBatchRequirements} 
                          className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-10 px-6 rounded-xl shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-1.5"
                        >
                          <Save className="w-3.5 h-3.5" />
                          要件を一括更新
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 p-6">
                      <div>
                        <CardTitle className="text-xl font-bold tracking-tight text-slate-800">個別稼働要件設定 :: {yearMonth}</CardTitle>
                        <CardDescription className="text-xs font-semibold text-slate-500 uppercase tracking-widest leading-none mt-1">
                          {selectedDeptId === "all" ? "すべての部署共同 (一般設定)" : `「${departments.find(d => d.id === selectedDeptId)?.name}」の日ごとの必要出勤人数`}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap">対象部署:</span>
                        <Select value={selectedDeptId} onValueChange={setSelectedDeptId}>
                          <SelectTrigger className="w-52 h-8.5 rounded-lg border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 transition-colors">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-lg">
                            <SelectItem value="all">🌐 すべての部署 (一般)</SelectItem>
                            {departments.map(dept => (
                              <SelectItem key={dept.id} value={dept.id}>
                                🏢 {dept.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader className="bg-slate-50/50">
                          <TableRow>
                            <TableHead className="w-[180px] font-bold text-slate-900 py-4">日付／曜日</TableHead>
                            {patterns.map(p => (
                                <TableHead key={p.id} className="text-center font-bold text-slate-900">{p.name}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {daysInMonth.map(day => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const isDayHoliday = isHoliday(day);
                            const dayOfWeek = day.getDay();
                            const dayColorClass = isDayHoliday
                              ? "text-rose-600 font-black animate-pulse-subtle"
                              : dayOfWeek === 0
                              ? "text-rose-500"
                              : dayOfWeek === 6
                              ? "text-blue-500"
                              : "text-slate-700";

                            return (
                              <TableRow key={dateStr} className={`hover:bg-slate-50/30 transition-colors ${isDayHoliday ? 'bg-rose-50/10' : ''}`}>
                                <TableCell className="font-bold py-3">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={dayColorClass}>
                                      {format(day, 'MM.dd :: EEE').toUpperCase()}
                                    </span>
                                    {isDayHoliday && (
                                      <span className="text-[9px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-md font-extrabold whitespace-nowrap leading-none">
                                        {getJapanHoliday(day) || '祝日'}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                {patterns.map(p => {
                                  const req = requirements.find(r => 
                                    r.date === dateStr && 
                                    r.patternId === p.id && 
                                    (selectedDeptId === "all" ? !r.departmentId : r.departmentId === selectedDeptId)
                                  );
                                  return (
                                    <TableCell key={p.id} className="text-center">
                                      <Input
                                        type="number"
                                        className="w-16 h-9 text-center mx-auto rounded-xl border-slate-200 bg-white focus:ring-2 focus:ring-blue-500/20 transition-all"
                                        value={req?.count ?? 0}
                                        onChange={(e) => updateRequirement(dateStr, p.id, parseInt(e.target.value) || 0, selectedDeptId === "all" ? undefined : selectedDeptId)}
                                      />
                                    </TableCell>
                                  );
                                })}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="submissions" className="m-0">
                <div className="p-8 max-w-7xl mx-auto space-y-6">
                  <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden bg-white">
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 p-6">
                      <div>
                        <CardTitle className="text-xl font-bold tracking-tight text-slate-800">希望提出状況一覧 :: {yearMonth}</CardTitle>
                        <CardDescription className="text-xs font-semibold text-slate-500 uppercase tracking-widest leading-none mt-1.5">
                          シフト希望（公休「休み」・特定シフト希望「A/B」）の全員分を、日付ベースの表形式で一覧表示しています。
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-bold px-3 py-1 text-xs rounded-xl self-start md:self-auto">
                        提出状況: {submissions.filter(s => s.yearMonth === yearMonth).length} / {users.filter(u => u.role === 'STAFF').length}名 完了
                      </Badge>
                    </CardHeader>
                    <CardContent className="p-0 overflow-auto">
                      {submissions.filter(s => s.yearMonth === yearMonth).length === 0 ? (
                        <div className="text-center py-20 bg-slate-50/50 border border-dashed border-slate-200 rounded-2xl m-6">
                          <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                          <h3 className="text-lg font-bold text-slate-400">現在、提出された希望休はありません。</h3>
                          <p className="text-xs text-slate-400 mt-2 max-w-md mx-auto">
                            スタッフアカウントでログインし、カレンダーから希望日を選んで「希望を提出する」を実行してください。
                          </p>
                        </div>
                      ) : (
                        <div className="min-w-max">
                          <Table className="border-collapse">
                            <TableHeader className="bg-slate-50/50">
                              <TableRow className="border-b border-slate-150">
                                <TableHead className="w-44 border-r border-slate-200 sticky left-0 bg-slate-100/90 z-10 font-bold text-slate-800 py-3.5 pl-6">
                                  スタッフ名
                                </TableHead>
                                {daysInMonth.map(day => {
                                  const isDayHoliday = isHoliday(day);
                                  const dayOfWeek = day.getDay();
                                  const isSunday = dayOfWeek === 0;
                                  const isSaturday = dayOfWeek === 6;

                                  let colBg = "";
                                  if (isDayHoliday || isSunday) {
                                    colBg = "bg-rose-50/30";
                                  } else if (isSaturday) {
                                    colBg = "bg-blue-50/15";
                                  }

                                  let textClass = "text-slate-700";
                                  if (isDayHoliday || isSunday) {
                                    textClass = "text-rose-500 font-extrabold";
                                  } else if (isSaturday) {
                                    textClass = "text-blue-500 font-extrabold";
                                  }

                                  return (
                                    <TableHead key={day.toString()} className={`w-14 text-center border-r border-slate-200/40 font-bold p-1 ${colBg}`} title={isDayHoliday ? getJapanHoliday(day) || '祝日' : undefined}>
                                      <div className="text-[8px] opacity-45 uppercase leading-none font-sans mb-0.5">{format(day, 'EEE')}</div>
                                      <div className={`text-xs font-black ${textClass} leading-none`}>
                                        {format(day, 'dd')}
                                      </div>
                                      {isDayHoliday ? (
                                        <div className="text-[8px] text-rose-600 font-extrabold scale-90 mt-0.5 leading-none">祝</div>
                                      ) : (
                                        <div className="text-[8px] opacity-0 mt-0.5 leading-none select-none">間</div>
                                      )}
                                    </TableHead>
                                  );
                                })}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {users.filter(u => u.role === 'STAFF').map(u => {
                                const sub = submissions.find(s => s.userId === u.id && s.yearMonth === yearMonth);
                                const isSubmitted = !!sub;

                                return (
                                  <TableRow key={u.id} className={`hover:bg-slate-50/30 transition-colors ${!isSubmitted ? 'opacity-65 bg-slate-50/30' : ''}`}>
                                    <TableCell className="w-44 border-r border-slate-200 font-bold text-slate-800 sticky left-0 bg-white z-10 py-3 pl-6 flex items-center justify-between gap-2 max-w-[176px] shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                      <div className="truncate flex flex-col gap-1 min-w-0">
                                        <span className="text-xs font-extrabold text-slate-800 block truncate leading-tight">{u.name}</span>
                                        {isSubmitted ? (
                                          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 font-bold px-1.5 py-0 border text-[8px] rounded-lg self-start">
                                            提出済
                                          </Badge>
                                        ) : (
                                          <Badge className="bg-amber-50 text-amber-600 border-amber-100 font-bold px-1.5 py-0 border text-[8px] rounded-lg self-start">
                                            未提出
                                          </Badge>
                                        )}
                                      </div>
                                      {isSubmitted && (
                                        <Button 
                                          variant="ghost" 
                                          size="icon" 
                                          className="text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg h-7 w-7 p-0 shrink-0 self-center"
                                          onClick={async () => {
                                            if (confirm(`${u.name}さんの提出済みのシフト希望をクリア（削除）しますか？`)) {
                                              await localDb.delete('submissions', sub.id);
                                              toast.success("希望提出データを削除しました");
                                            }
                                          }}
                                          title="提出希望を削除/リセット"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                      )}
                                    </TableCell>
                                    {daysInMonth.map(day => {
                                      const dateStr = format(day, 'yyyy-MM-dd');
                                      const isOff = sub?.offDates?.includes(dateStr);
                                      const req = sub?.specificRequests?.find(r => r.date === dateStr);
                                      const reqPatternIds = req ? (req.patternIds || ((req as any).patternId ? [(req as any).patternId] : [])) : [];
                                      const reqPatterns = patterns.filter(p => reqPatternIds.includes(p.id));

                                      let cellContent = null;
                                      
                                      if (!isSubmitted) {
                                        cellContent = (
                                          <div className="text-[10px] text-slate-300 font-medium opacity-30">-</div>
                                        );
                                      } else if (isOff) {
                                        cellContent = (
                                          <span className="inline-flex items-center justify-center bg-rose-50 border border-rose-200 text-rose-600 font-extrabold text-[9px] h-6 px-1.5 rounded-md min-w-[36px] shadow-sm">
                                            休み
                                          </span>
                                        );
                                      } else if (reqPatterns.length > 0) {
                                        cellContent = (
                                          <span className="inline-flex items-center justify-center bg-sky-50 border border-sky-200 text-sky-700 font-extrabold text-[9px] h-6 px-1 rounded-md min-w-[36px] shadow-sm flex-col leading-none py-0.5 gap-0.5" title={`${reqPatterns.map(p => p.name).join(' or ')}`}>
                                            <span>{reqPatterns.map(p => p.shortName).join('/')}</span>
                                          </span>
                                        );
                                      } else {
                                        cellContent = (
                                          <span className="text-[9px] text-slate-400 font-medium whitespace-nowrap">おまかせ</span>
                                        );
                                      }

                                      return (
                                        <TableCell key={dateStr} className="text-center p-1.5 border-r border-slate-100/50 min-w-[56px]">
                                          {cellContent}
                                        </TableCell>
                                      );
                                    })}
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="staff" className="m-0">
                <div className="p-8 max-w-5xl mx-auto space-y-8">
                  <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                      <CardTitle className="text-xl font-bold tracking-tight">新規スタッフ追加</CardTitle>
                      <CardDescription className="text-xs font-semibold text-slate-500 uppercase tracking-widest leading-none mt-1">シフトに関わる新しいメンバーを登録</CardDescription>
                    </CardHeader>
                    <CardContent className="p-6">
                      <form onSubmit={addStaff} className="grid grid-cols-1 md:grid-cols-7 gap-4 items-end">
                        <div className="space-y-1">
                          <Label className="text-[11px] font-bold text-slate-500 uppercase">氏名</Label>
                          <Input name="name" placeholder="例: 佐藤 健二" className="h-10 rounded-xl" required />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] font-bold text-slate-500 uppercase">月間労働上限 (H)</Label>
                          <Input name="maxHours" type="number" defaultValue="160" className="h-10 rounded-xl" required />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] font-bold text-slate-500 uppercase">月間労働下限 (H)</Label>
                          <Input name="minHours" type="number" defaultValue="0" className="h-10 rounded-xl" required />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] font-bold text-slate-500 uppercase">希望スタイル</Label>
                          <Select name="preferredStyle" defaultValue="DEFAULT">
                            <SelectTrigger className="h-10 rounded-xl">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              <SelectItem value="DEFAULT">バランス重視</SelectItem>
                              <SelectItem value="DAY_MAIN">日勤メイン希望</SelectItem>
                              <SelectItem value="NIGHT_MAIN">夜勤メイン希望</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] font-bold text-slate-500 uppercase">役割区分</Label>
                          <Select name="isLeader" defaultValue="false">
                            <SelectTrigger className="h-10 rounded-xl">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              <SelectItem value="false">一般スタッフ</SelectItem>
                              <SelectItem value="true">👑 リーダー</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] font-bold text-slate-500 uppercase">メイン部署</Label>
                          <Select name="primaryDepartmentId" defaultValue="">
                            <SelectTrigger className="h-10 rounded-xl text-xs text-slate-600 font-medium">
                              <SelectValue placeholder="選択してください" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              <SelectItem value="">(未設定)</SelectItem>
                              {departments.map(dept => (
                                <SelectItem key={dept.id} value={dept.id}>🏢 {dept.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button type="submit" className="bg-blue-600 hover:bg-blue-700 h-10 rounded-xl font-bold text-white shadow-lg shadow-blue-200">登録する</Button>
                      </form>
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                      <CardTitle className="text-xl font-bold tracking-tight">スタッフマスター</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader className="bg-slate-50/50">
                          <TableRow>
                            <TableHead className="font-bold text-slate-900 py-4">スタッフ名</TableHead>
                            <TableHead className="font-bold text-slate-900">上限(H)</TableHead>
                            <TableHead className="font-bold text-slate-900">下限(H)</TableHead>
                            <TableHead className="font-bold text-slate-900">優先スタイル</TableHead>
                            <TableHead className="font-bold text-slate-900">主任権限</TableHead>
                            <TableHead className="font-bold text-slate-900 text-amber-700">メイン部署</TableHead>
                            <TableHead className="font-bold text-slate-900">NGペア (一緒にしたくない人)</TableHead>
                            <TableHead className="w-12"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {users.filter(u => u.role === 'STAFF').map(u => (
                            <TableRow key={u.id} className="group hover:bg-slate-50/30 transition-colors">
                              <TableCell className="font-bold text-slate-700">{u.name}</TableCell>
                              <TableCell>
                                <Input 
                                  type="number" 
                                  className="w-20 h-9 rounded-xl border-slate-200" 
                                  defaultValue={u.maxHoursPerMonth} 
                                  onBlur={(e) => updateUser(u.id, { maxHoursPerMonth: parseInt(e.target.value) || 0 })}
                                />
                              </TableCell>
                              <TableCell>
                                <Input 
                                  type="number" 
                                  className="w-20 h-9 rounded-xl border-slate-200" 
                                  defaultValue={u.minHoursPerMonth ?? 0} 
                                  onBlur={(e) => updateUser(u.id, { minHoursPerMonth: parseInt(e.target.value) || 0 })}
                                />
                              </TableCell>
                              <TableCell>
                                <Select defaultValue={u.preferredStyle} onValueChange={(val) => updateUser(u.id, { preferredStyle: val })}>
                                  <SelectTrigger className="w-40 h-9 rounded-xl border-slate-200 text-xs text-slate-600 font-medium">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="rounded-xl">
                                    <SelectItem value="DEFAULT">バランス重視</SelectItem>
                                    <SelectItem value="DAY_MAIN">日勤メイン希望</SelectItem>
                                    <SelectItem value="NIGHT_MAIN">夜勤メイン希望</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Select defaultValue={u.isLeader ? "true" : "false"} onValueChange={(val) => updateUser(u.id, { isLeader: val === "true" })}>
                                  <SelectTrigger className="w-28 h-9 rounded-xl border-slate-200 text-xs text-slate-600 font-medium">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="rounded-xl">
                                    <SelectItem value="false">一般</SelectItem>
                                    <SelectItem value="true">👑 リーダー</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Select defaultValue={u.primaryDepartmentId || ""} onValueChange={(val) => updatePrimaryDepartment(u.id, val)}>
                                  <SelectTrigger className="w-36 h-9 rounded-xl border-slate-200 text-xs text-slate-600 font-medium">
                                    <SelectValue placeholder="(未設定)" />
                                  </SelectTrigger>
                                  <SelectContent className="rounded-xl">
                                    <SelectItem value="">(未設定)</SelectItem>
                                    {departments.map(dept => (
                                      <SelectItem key={dept.id} value={dept.id}>🏢 {dept.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {users.filter(o => o.id !== u.id && o.role === 'STAFF').map(o => {
                                    const isNG = restrictions.some(r => (r.staffId1 === u.id && r.staffId2 === o.id) || (r.staffId1 === o.id && r.staffId2 === u.id));
                                    return (
                                      <button
                                        key={o.id}
                                        onClick={() => toggleForbiddenPair(u.id, o.id)}
                                        className={`px-2 py-1 text-[10px] font-bold border rounded-lg transition-all ${isNG ? 'bg-red-500 text-white border-red-500 shadow-sm' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-400'}`}
                                      >
                                        x {o.name.split(' ')[0]}
                                      </button>
                                    );
                                  })}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Button variant="ghost" size="icon" className="text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors" onClick={() => deleteUser(u.id, u.name)}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="departments" className="m-0">
                <div className="p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-2">
                  {/* Explanation Alert */}
                  <div className="flex justify-between items-center bg-blue-50/40 p-5 border border-blue-100 rounded-2xl">
                    <div>
                      <h3 className="text-xs font-bold text-blue-900 flex items-center gap-1.5 font-sans">
                        <Building className="w-3.5 h-3.5 text-blue-650" />
                        部署マスター・スキル（出勤権限）管理
                      </h3>
                      <p className="text-[10px] text-blue-700 mt-1 font-sans">
                        ホテル内の各部署（フロント、客室サービス、レストラン等）を作成し、スタッフにその部署での勤務スキル（配置権限）を割り当てます。
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Add Department Form */}
                    <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden bg-white border-blue-150 shadow-blue-50/20">
                      <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                        <CardTitle className="text-sm font-bold text-slate-800">新規部署の追加</CardTitle>
                      </CardHeader>
                      <CardContent className="p-6">
                        <div className="space-y-4">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-700">部署名</Label>
                            <Input
                              placeholder="例: フロント、客室サービス、料飲部門"
                              value={newDeptName}
                              onChange={(e) => setNewDeptName(e.target.value)}
                              className="h-10 rounded-xl border-slate-200"
                            />
                          </div>
                          <Button
                            onClick={async () => {
                              if (!newDeptName.trim()) {
                                toast.error("部署名を入力してください");
                                return;
                              }
                              if (!currentUser) return;
                              await localDb.add<Department>('departments', {
                                hotelId: currentUser.hotelId,
                                name: newDeptName.trim()
                              });
                              toast.success(`部署「${newDeptName}」を追加しました`);
                              setNewDeptName("");
                            }}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-10 rounded-xl shadow-md transition-all"
                          >
                            <Plus className="w-3.5 h-3.5 mr-1" />
                            部署を追加する
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Department List */}
                    <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden bg-white">
                      <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                        <CardTitle className="text-sm font-bold text-slate-800">登録済み部署マスター</CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <div className="divide-y divide-slate-100">
                          {departments.map(dept => (
                            <div key={dept.id} className="p-4 flex items-center justify-between text-xs font-bold text-slate-700">
                              <span className="flex items-center gap-1.5">
                                <Building className="w-3.5 h-3.5 text-slate-400" />
                                {dept.name}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={departments.length <= 1} // At least one department must exist
                                onClick={async () => {
                                  await localDb.delete('departments', dept.id);
                                  toast.success(`部署「${dept.name}」を削除しました`);
                                }}
                                className="h-7 px-2.5 rounded-lg text-red-500 hover:bg-red-50 hover:text-red-700 border border-transparent font-medium"
                              >
                                <Trash2 className="w-3 h-3 mr-1" /> 削除
                              </Button>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Staff Skills checklist mapping */}
                  <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden bg-white">
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                      <CardTitle className="text-sm font-bold text-slate-800">スタッフ別 出勤可能部署（スキル）設定</CardTitle>
                      <p className="text-[10px] text-slate-400 font-medium">各スタッフが出勤・稼動できる部署に選択を加えてください。複数兼任も可能です。</p>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader className="bg-slate-50/50">
                          <TableRow>
                            <TableHead className="font-bold text-slate-900 py-4">スタッフ名</TableHead>
                            <TableHead className="font-bold text-slate-900">役職・スタイル</TableHead>
                            <TableHead className="font-bold text-slate-900">対応・出勤可能部署（スキル付与）</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {users.filter(u => u.role === 'STAFF').map(u => {
                            const currentDepts = u.departmentIds || [];
                            return (
                              <TableRow key={u.id} className="hover:bg-slate-50/30">
                                <TableCell className="font-bold text-slate-700 py-3">{u.name}</TableCell>
                                <TableCell className="text-xs text-slate-500 font-semibold">{u.preferredStyle === 'NIGHT_MAIN' ? '夜勤優先' : '日勤固定'} ({u.maxHoursPerMonth}h)</TableCell>
                                <TableCell>
                                  <div className="flex flex-wrap gap-3 py-1">
                                    {departments.map(dept => {
                                      const hasSkill = currentDepts.includes(dept.id);
                                      return (
                                        <div key={dept.id} className="inline-flex items-center">
                                          <button
                                            onClick={async () => {
                                              let updatedList;
                                              let updatedPrimary = u.primaryDepartmentId;
                                              if (hasSkill) {
                                                updatedList = currentDepts.filter(id => id !== dept.id);
                                                if (u.primaryDepartmentId === dept.id) {
                                                  updatedPrimary = undefined;
                                                }
                                              } else {
                                                updatedList = [...currentDepts, dept.id];
                                              }
                                              await localDb.update('users', u.id, { 
                                                departmentIds: updatedList,
                                                primaryDepartmentId: updatedPrimary
                                              });
                                              toast.success(`${u.name}の所属スキルを更新しました`);
                                            }}
                                            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold border transition-all ${
                                              hasSkill
                                                ? 'bg-blue-50 text-blue-700 border-blue-200 rounded-l-xl border-r-0'
                                                : 'bg-white text-slate-400 border-slate-200 rounded-xl hover:bg-slate-50 hover:text-slate-600'
                                            }`}
                                          >
                                            <span>{hasSkill ? "✓" : "+"}</span>
                                            <span>{dept.name}</span>
                                          </button>
                                          {hasSkill && (
                                            <button
                                              onClick={async () => {
                                                const isPrimaryNow = u.primaryDepartmentId === dept.id;
                                                await localDb.update('users', u.id, {
                                                  primaryDepartmentId: isPrimaryNow ? undefined : dept.id
                                                });
                                                toast.success(`${u.name}のメイン部署を${isPrimaryNow ? '解除' : '設定'}しました`);
                                              }}
                                              title={u.primaryDepartmentId === dept.id ? "メイン部署（クリックで解除）" : "メイン部署として優先設定"}
                                              className={`px-2 py-1 text-xs font-bold rounded-r-xl border transition-all ${
                                                u.primaryDepartmentId === dept.id
                                                  ? 'bg-amber-100 text-amber-700 border-amber-300 shadow-sm'
                                                  : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100 hover:text-slate-600'
                                              }`}
                                            >
                                              {u.primaryDepartmentId === dept.id ? "👑 メイン" : "☆ メイン優先"}
                                            </button>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="patterns" className="m-0">
                <div className="p-8 max-w-5xl mx-auto space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
                      <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                        <CardTitle className="text-xl font-bold tracking-tight">パターンの新規作成</CardTitle>
                      </CardHeader>
                      <CardContent className="p-6">
                        <form onSubmit={addPattern} className="space-y-5">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <Label className="text-[11px] font-bold text-slate-500 uppercase">名称</Label>
                              <Input name="name" placeholder="例: 早番" className="h-10 rounded-xl" required />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] font-bold text-slate-500 uppercase">略称 (1文字)</Label>
                              <Input name="shortName" maxLength={1} placeholder="A" className="h-10 rounded-xl text-center font-bold" required />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <Label className="text-[11px] font-bold text-slate-500 uppercase">開始</Label>
                              <Input name="startTime" type="time" className="h-10 rounded-xl" required />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] font-bold text-slate-500 uppercase">終了</Label>
                              <Input name="endTime" type="time" className="h-10 rounded-xl" required />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] font-bold text-slate-500 uppercase">労働時間 (休憩除く)</Label>
                            <Input name="workHours" type="number" step="0.5" defaultValue="8" className="h-10 rounded-xl" required />
                          </div>
                          <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold h-11 shadow-lg shadow-blue-200">
                            パターンを追加
                          </Button>
                        </form>
                      </CardContent>
                    </Card>

                    <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
                      <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                        <CardTitle className="text-xl font-bold tracking-tight text-slate-900">登録済みパターン</CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <div className="divide-y divide-slate-100">
                          {patterns.map(p => (
                            <div key={p.id} className="flex items-center justify-between py-4 px-6 hover:bg-slate-50/30 transition-colors">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 border-2 border-blue-100 flex items-center justify-center font-bold text-lg text-blue-600 bg-blue-50 rounded-2xl">
                                  {p.shortName}
                                </div>
                                <div>
                                    <div className="text-sm font-bold text-slate-900 leading-tight">{p.name}</div>
                                    <div className="text-xs text-slate-400 font-medium">{p.startTime} - {p.endTime} <span className="mx-1">•</span> 実働{p.workHours}h</div>
                                </div>
                              </div>
                              <Button variant="ghost" size="icon" onClick={() => deletePattern(p.id)} className="h-9 w-9 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="rules" className="m-0">
                <div className="p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-200">
                  <div className="flex justify-between items-center border-b border-slate-200/60 pb-5">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                        <Brain className="w-5.5 h-5.5 text-indigo-600" />
                        自動生成ルール・アルゴリズム設定
                      </h2>
                      <p className="text-[11px] text-slate-500 font-medium mt-1">
                        シフトの自動生成時に適用される各種ビジネス・ロジックや拘束制約のカスタマイズを行います。
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Left & Center: Rules List */}
                    <div className="md:col-span-2 space-y-6">
                      <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
                        <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                          <CardTitle className="text-sm font-bold text-slate-900">自動生成アルゴリズム制約</CardTitle>
                          <CardDescription className="text-slate-500 text-[10px] font-semibold uppercase tracking-wider mt-1">
                            ブラウザ内の高速最適化エンジンおよびGemini AIが従うべきルール
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                          {/* 1. Max Consecutive Days */}
                          <div className="flex flex-col gap-2 p-4 border border-slate-100 rounded-xl bg-slate-50/50 hover:bg-slate-50/100 transition-all">
                            <div className="flex items-center justify-between">
                              <div>
                                <Label className="text-xs font-bold text-slate-800">連続勤務上限日数</Label>
                                <p className="text-[10px] text-slate-400 font-medium mt-0.5 mt-1">
                                  スタッフが連続して勤務できる最大日数です。
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Input 
                                  type="number"
                                  min={1}
                                  max={14}
                                  value={rules.maxConsecutiveDays}
                                  onChange={(e) => updateRuleSettings({ maxConsecutiveDays: parseInt(e.target.value) || 5 })}
                                  className="w-16 font-mono font-bold text-center h-8 rounded-lg text-xs"
                                />
                                <span className="text-[11px] font-bold text-slate-500">日</span>
                              </div>
                            </div>
                            <div className="text-[10px] bg-indigo-50/50 text-indigo-700 font-bold p-2 px-3 rounded-lg border border-indigo-100 mt-1">
                              💡 現在の設定：連続 <span className="font-mono text-xs">{rules.maxConsecutiveDays}</span> 日勤務した次の日は強制的に休日として処理されます。
                            </div>
                          </div>

                          {/* 2. Prevent Day After Night */}
                          <div className="flex flex-col gap-2 p-4 border border-slate-100 rounded-xl bg-slate-50/50 hover:bg-slate-50/100 transition-all">
                            <div className="flex items-center justify-between">
                              <div>
                                <Label className="text-xs font-bold text-slate-800">夜勤明け日勤の禁止 (11Hのインターバル確保)</Label>
                                <p className="text-[10px] text-slate-400 font-medium mt-0.5 mt-1">
                                  夜勤の明けたその日の日勤勤務（早番・遅番など）を禁止します。
                                </p>
                              </div>
                              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg shrink-0">
                                <Button 
                                  variant={rules.preventDayAfterNight ? "default" : "ghost"}
                                  size="sm"
                                  className={`rounded-md text-[10px] font-bold h-7 px-2.5 ${rules.preventDayAfterNight ? "bg-slate-900 text-white hover:bg-slate-900" : "text-slate-500 bg-transparent hover:bg-slate-200/50"}`}
                                  onClick={() => updateRuleSettings({ preventDayAfterNight: true })}
                                >
                                  有効
                                </Button>
                                <Button 
                                  variant={!rules.preventDayAfterNight ? "default" : "ghost"}
                                  size="sm"
                                  className={`rounded-md text-[10px] font-bold h-7 px-2.5 ${!rules.preventDayAfterNight ? "bg-slate-900 text-white hover:bg-slate-900" : "text-slate-500 bg-transparent hover:bg-slate-200/50"}`}
                                  onClick={() => updateRuleSettings({ preventDayAfterNight: false })}
                                >
                                  無効
                                </Button>
                              </div>
                            </div>
                          </div>

                          {/* 3. Limit Max Hours */}
                          <div className="flex flex-col gap-2 p-4 border border-slate-100 rounded-xl bg-slate-50/50 hover:bg-slate-50/100 transition-all">
                            <div className="flex items-center justify-between">
                              <div>
                                <Label className="text-xs font-bold text-slate-800">各メンバーの月間最大労働時間の厳守</Label>
                                <p className="text-[10px] text-slate-400 font-medium mt-0.5 mt-1">
                                  スタッフごとに設定された「上限労働時間」を超える割当を絶対的に排除します。
                                </p>
                              </div>
                              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg shrink-0">
                                <Button 
                                  variant={rules.limitMaxHours ? "default" : "ghost"}
                                  size="sm"
                                  className={`rounded-md text-[10px] font-bold h-7 px-2.5 ${rules.limitMaxHours ? "bg-slate-900 text-white hover:bg-slate-900" : "text-slate-500 bg-transparent hover:bg-slate-200/50"}`}
                                  onClick={() => updateRuleSettings({ limitMaxHours: true })}
                                >
                                  厳密に厳守
                                </Button>
                                <Button 
                                  variant={!rules.limitMaxHours ? "default" : "ghost"}
                                  size="sm"
                                  className={`rounded-md text-[10px] font-bold h-7 px-2.5 ${!rules.limitMaxHours ? "bg-slate-900 text-white hover:bg-slate-900" : "text-slate-500 bg-transparent hover:bg-slate-200/50"}`}
                                  onClick={() => updateRuleSettings({ limitMaxHours: false })}
                                >
                                  緩める
                                </Button>
                              </div>
                            </div>
                          </div>

                          {/* 4. Limit Min Hours */}
                          <div className="flex flex-col gap-2 p-4 border border-slate-100 rounded-xl bg-slate-50/50 hover:bg-slate-50/100 transition-all">
                            <div className="flex items-center justify-between">
                              <div>
                                <Label className="text-xs font-bold text-slate-800">各メンバーの月間最小期待労働時間の確保努力</Label>
                                <p className="text-[10px] text-slate-400 font-medium mt-0.5 mt-1">
                                  スタッフごとに設定された「下限労働時間」を満たすように優先配分を行います。
                                </p>
                              </div>
                              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg shrink-0">
                                <Button 
                                  variant={rules.limitMinHours ? "default" : "ghost"}
                                  size="sm"
                                  className={`rounded-md text-[10px] font-bold h-7 px-2.5 ${rules.limitMinHours ? "bg-slate-900 text-white hover:bg-slate-900" : "text-slate-500 bg-transparent hover:bg-slate-200/50"}`}
                                  onClick={() => updateRuleSettings({ limitMinHours: true })}
                                >
                                  引き上げる
                                </Button>
                                <Button 
                                  variant={!rules.limitMinHours ? "default" : "ghost"}
                                  size="sm"
                                  className={`rounded-md text-[10px] font-bold h-7 px-2.5 ${!rules.limitMinHours ? "bg-slate-900 text-white hover:bg-slate-900" : "text-slate-500 bg-transparent hover:bg-slate-200/50"}`}
                                  onClick={() => updateRuleSettings({ limitMinHours: false })}
                                >
                                  考慮しない
                                </Button>
                              </div>
                            </div>
                          </div>

                          {/* 5. Balance Weekend Shifts */}
                          <div className="flex flex-col gap-2 p-4 border border-slate-100 rounded-xl bg-slate-50/50 hover:bg-slate-50/100 transition-all animate-in fade-in">
                            <div className="flex items-center justify-between">
                              <div>
                                <Label className="text-xs font-bold text-slate-800">土日祝シフトの均等割り当て</Label>
                                <p className="text-[10px] text-slate-400 font-medium mt-1">
                                  特定のスタッフに土曜日・日曜日・祝日の勤務が偏ることを防ぎ、均等に振り分けます。
                                </p>
                              </div>
                              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg shrink-0">
                                <Button 
                                  variant={rules.balanceWeekendShifts ? "default" : "ghost"}
                                  size="sm"
                                  className={`rounded-md text-[10px] font-bold h-7 px-2.5 ${rules.balanceWeekendShifts ? "bg-slate-900 text-white hover:bg-slate-900" : "text-slate-500 bg-transparent hover:bg-slate-200/50"}`}
                                  onClick={() => updateRuleSettings({ balanceWeekendShifts: true })}
                                >
                                  均等化する
                                </Button>
                                <Button 
                                  variant={!rules.balanceWeekendShifts ? "default" : "ghost"}
                                  size="sm"
                                  className={`rounded-md text-[10px] font-bold h-7 px-2.5 ${!rules.balanceWeekendShifts ? "bg-slate-900 text-white hover:bg-slate-900" : "text-slate-500 bg-transparent hover:bg-slate-200/50"}`}
                                  onClick={() => updateRuleSettings({ balanceWeekendShifts: false })}
                                >
                                  考慮しない
                                </Button>
                              </div>
                            </div>
                          </div>

                          {/* 6. Prefer Consecutive Off */}
                          <div className="flex flex-col gap-2 p-4 border border-slate-100 rounded-xl bg-slate-50/50 hover:bg-slate-50/100 transition-all animate-in fade-in">
                            <div className="flex items-center justify-between">
                              <div>
                                <Label className="text-xs font-bold text-slate-800">2日以上の連休推奨</Label>
                                <p className="text-[10px] text-slate-400 font-medium mt-1">
                                  単発の休み（1日だけ休み）を極力避け、2連休以上のまとまった休日になりやすくします。
                                </p>
                              </div>
                              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg shrink-0">
                                <Button 
                                  variant={rules.preferConsecutiveOff ? "default" : "ghost"}
                                  size="sm"
                                  className={`rounded-md text-[10px] font-bold h-7 px-2.5 ${rules.preferConsecutiveOff ? "bg-slate-900 text-white hover:bg-slate-900" : "text-slate-500 bg-transparent hover:bg-slate-200/50"}`}
                                  onClick={() => updateRuleSettings({ preferConsecutiveOff: true })}
                                >
                                  連休を促す
                                </Button>
                                <Button 
                                  variant={!rules.preferConsecutiveOff ? "default" : "ghost"}
                                  size="sm"
                                  className={`rounded-md text-[10px] font-bold h-7 px-2.5 ${!rules.preferConsecutiveOff ? "bg-slate-900 text-white hover:bg-slate-900" : "text-slate-500 bg-transparent hover:bg-slate-200/50"}`}
                                  onClick={() => updateRuleSettings({ preferConsecutiveOff: false })}
                                >
                                  考慮しない
                                </Button>
                              </div>
                            </div>
                          </div>

                          {/* 7. Require Leader In Shift */}
                          <div className="flex flex-col gap-2 p-4 border border-slate-100 rounded-xl bg-slate-50/50 hover:bg-slate-50/100 transition-all animate-in fade-in">
                            <div className="flex items-center justify-between">
                              <div>
                                <Label className="text-xs font-bold text-slate-800">各シフト帯へのリーダー常駐優先</Label>
                                <p className="text-[10px] text-slate-400 font-medium mt-1">
                                  すべての勤務枠に、少なくとも1名は「リーダー（主任）権限」を持つスタッフを配置します。
                                </p>
                              </div>
                              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg shrink-0">
                                <Button 
                                  variant={rules.requireLeaderInShift ? "default" : "ghost"}
                                  size="sm"
                                  className={`rounded-md text-[10px] font-bold h-7 px-2.5 ${rules.requireLeaderInShift ? "bg-slate-900 text-white hover:bg-slate-900" : "text-slate-500 bg-transparent hover:bg-slate-200/50"}`}
                                  onClick={() => updateRuleSettings({ requireLeaderInShift: true })}
                                >
                                  常駐を保証
                                </Button>
                                <Button 
                                  variant={!rules.requireLeaderInShift ? "default" : "ghost"}
                                  size="sm"
                                  className={`rounded-md text-[10px] font-bold h-7 px-2.5 ${!rules.requireLeaderInShift ? "bg-slate-900 text-white hover:bg-slate-900" : "text-slate-500 bg-transparent hover:bg-slate-200/50"}`}
                                  onClick={() => updateRuleSettings({ requireLeaderInShift: false })}
                                >
                                  考慮しない
                                </Button>
                              </div>
                            </div>
                          </div>

                        </CardContent>
                      </Card>
                    </div>

                    {/* Right: Quick Forbidden Pairs Settings */}
                    <div className="space-y-6">
                      <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden bg-slate-50/10 mb-4">
                        <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                          <CardTitle className="text-xs font-bold text-slate-950 flex items-center gap-1.5">
                            <X className="w-3.5 h-3.5 text-red-500" />
                            新旧ペア・同日NG指定
                          </CardTitle>
                          <CardDescription className="text-[10px] font-medium leading-tight mt-1">
                            同じ日に同時勤務させない組み合わせを指定
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4">
                          <div className="text-[10px] bg-slate-50 text-slate-600 p-2.5 rounded-lg border border-slate-150 font-medium leading-relaxed">
                            業務引き継ぎ、スキルバランス、相性などを考慮して同一日に勤務が入らないようエンジンが自動回避します。
                          </div>

                          <div className="space-y-3">
                            <div className="text-[10px] font-bold text-slate-500 uppercase">未登録ペアの設定</div>
                            <div className="space-y-2">
                              {/* Show cross matching selections if there are users */}
                              {users.filter(u => u.role === 'STAFF').length >= 2 ? (
                                <div className="space-y-2">
                                  <div className="grid grid-cols-2 gap-2">
                                    <Select onValueChange={(val) => (window as any)._pair1 = val}>
                                      <SelectTrigger className="h-8 text-[11px] rounded-lg">
                                        <SelectValue placeholder="スタッフA" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {users.filter(u => u.role === 'STAFF').map(u => (
                                          <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Select onValueChange={(val) => (window as any)._pair2 = val}>
                                      <SelectTrigger className="h-8 text-[11px] rounded-lg">
                                        <SelectValue placeholder="スタッフB" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {users.filter(u => u.role === 'STAFF').map(u => (
                                          <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <Button 
                                    onClick={() => {
                                      const p1 = (window as any)._pair1;
                                      const p2 = (window as any)._pair2;
                                      if (p1 && p2 && p1 !== p2) {
                                        toggleForbiddenPair(p1, p2);
                                      } else {
                                        toast.error("異なるスタッフを2名指定してください。");
                                      }
                                    }}
                                    className="w-full text-[10px] font-bold bg-slate-900 text-white hover:bg-slate-800 rounded-lg h-8 shadow-sm"
                                  >
                                    ペア禁止制約を登録する
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-400 font-bold">スタッフが不足しています</span>
                              )}
                            </div>
                          </div>

                          <div className="border-t border-slate-100 pt-3 space-y-2">
                            <div className="text-[10px] font-bold text-slate-500 uppercase">既存のNGペア設定一覧</div>
                            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                              {restrictions.map(r => {
                                const u1 = users.find(u => u.id === r.staffId1);
                                const u2 = users.find(u => u.id === r.staffId2);
                                return (
                                  <div key={r.id} className="flex justify-between items-center py-1.5 px-2 bg-white border border-slate-100 rounded-lg text-[11px] shadow-xs">
                                    <span className="font-bold text-slate-700 truncate max-w-[140px]">{u1?.name} ⇄ {u2?.name}</span>
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      onClick={() => toggleForbiddenPair(r.staffId1, r.staffId2)} 
                                      className="h-5 w-5 text-slate-300 hover:text-red-500 rounded"
                                      title="ペア制限を削除"
                                    >
                                      <X className="w-3 h-3" />
                                    </Button>
                                  </div>
                                );
                              })}
                              {restrictions.length === 0 && (
                                <div className="text-[10px] text-slate-400 font-medium py-3 text-center">
                                  現在NGペアは設定されていません
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </div>
  );
}
