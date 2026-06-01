import { User, ShiftPattern, Requirement, PairRestriction, Submission, Assignment, ScheduleRule } from '../types';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { isHoliday } from './holidays';

export function solveLocalSchedule(
  yearMonth: string,
  staff: User[],
  patterns: ShiftPattern[],
  requirements: Requirement[],
  submissions: Submission[],
  pairRestrictions: PairRestriction[],
  rule?: ScheduleRule,
  customInstructions?: string,
  existingAssignments: Assignment[] = []
): Assignment[] {
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr) - 1; // 0-indexed month
  const startDate = startOfMonth(new Date(year, month, 1));
  const endDate = endOfMonth(startDate);
  const days = eachDayOfInterval({ start: startDate, end: endDate });
  const dates = days.map(d => format(d, 'yyyy-MM-dd'));

  // --- Local NLP Keyword Rule Overrides ---
  let maxConsecutiveDays = rule?.maxConsecutiveDays ?? 5;
  let preventDayAfterNight = rule?.preventDayAfterNight ?? true;
  let limitMaxHours = rule?.limitMaxHours ?? true;
  let limitMinHours = rule?.limitMinHours ?? true;
  let balanceWeekendShifts = rule?.balanceWeekendShifts ?? false;
  let preferConsecutiveOff = rule?.preferConsecutiveOff ?? false;
  let requireLeaderInShift = rule?.requireLeaderInShift ?? false;

  if (customInstructions) {
    const promptLower = customInstructions.toLowerCase();

    // 1. Parse max consecutive days e.g. "連勤3日" or "4日間連続"
    const consecMatch = promptLower.match(/(?:連続|連勤|上限)\s*(\d)\s*日?/);
    if (consecMatch) {
      maxConsecutiveDays = parseInt(consecMatch[1]);
      console.log(`[Local NLP] Override maxConsecutiveDays to ${maxConsecutiveDays}`);
    }

    // 2. Parse night shift interval
    if (promptLower.includes("夜勤明け") && (promptLower.includes("可能") || promptLower.includes("許可") || promptLower.includes("ok") || promptLower.includes("許容"))) {
      preventDayAfterNight = false;
      console.log(`[Local NLP] Override preventDayAfterNight to false`);
    } else if (promptLower.includes("夜勤明け") && (promptLower.includes("禁止") || promptLower.includes("不可") || promptLower.includes("厳禁") || promptLower.includes("ダメ"))) {
      preventDayAfterNight = true;
      console.log(`[Local NLP] Override preventDayAfterNight to true`);
    }

    // 3. Parse weekend equalization
    if (promptLower.includes("土日") || promptLower.includes("週末") || promptLower.includes("祝日") || promptLower.includes("均等")) {
      balanceWeekendShifts = true;
      console.log(`[Local NLP] Override balanceWeekendShifts to true`);
    }

    // 4. Parse consecutive days off
    if (promptLower.includes("連休") || promptLower.includes("連続休み") || promptLower.includes("2日休み") || promptLower.includes("連休優先")) {
      preferConsecutiveOff = true;
      console.log(`[Local NLP] Override preferConsecutiveOff to true`);
    }

    // 5. Parse leader presence
    if (promptLower.includes("リーダー") || promptLower.includes("ベテラン") || promptLower.includes("常駐") || promptLower.includes("主任")) {
      requireLeaderInShift = true;
      console.log(`[Local NLP] Override requireLeaderInShift to true`);
    }
  }

  // Extract only locked assignments (fixed by manager)
  const lockedAssignments = existingAssignments.filter(a => a.isLocked);
  const assignments: Assignment[] = [...lockedAssignments];

  // Track state in-flight
  const hoursMap: Record<string, number> = {};
  const consecutiveDaysMap: Record<string, number> = {};
  const lastShiftMap: Record<string, string | null> = {}; // userId -> last patternId
  const weekendShiftsCountMap: Record<string, number> = {}; // userId -> weekend/holiday shifts count

  staff.forEach(s => {
    hoursMap[s.id] = 0;
    consecutiveDaysMap[s.id] = 0;
    lastShiftMap[s.id] = null;
    weekendShiftsCountMap[s.id] = 0;
  });

  const isNightShift = (p: ShiftPattern) => {
    return p.name.includes('夜') || p.shortName.toUpperCase() === 'N' || p.shortName === '夜';
  };

  const isDayShift = (p: ShiftPattern) => {
    return !isNightShift(p);
  };

  // Convert structures for O(1) lookups
  const offDatesMap: Record<string, Set<string>> = {};
  const specificRequestsMap: Record<string, Record<string, string[]>> = {};

  staff.forEach(s => {
    offDatesMap[s.id] = new Set<string>();
    specificRequestsMap[s.id] = {};
    
    const sub = submissions.find(sub => sub.userId === s.id && sub.yearMonth === yearMonth);
    if (sub) {
      if (sub.offDates) {
        sub.offDates.forEach(d => offDatesMap[s.id].add(d));
      }
      if (sub.specificRequests) {
        sub.specificRequests.forEach(req => {
          const reqPats = req.patternIds || ((req as any).patternId ? [(req as any).patternId] : []);
          specificRequestsMap[s.id][req.date] = reqPats;
        });
      }
    }
  });

  const dailyReqs: Record<string, Record<string, number>> = {};
  dates.forEach(d => {
    dailyReqs[d] = {};
  });

  requirements.forEach(req => {
    if (dailyReqs[req.date] && req.patternId) {
      const key = `${req.departmentId || "default"}_${req.patternId}`;
      dailyReqs[req.date][key] = (dailyReqs[req.date][key] || 0) + req.count;
    }
  });

  // Assign Day by Day
  dates.forEach((dateStr) => {
    // Get locked shifts for today
    const lockedToday = lockedAssignments.filter(la => la.date === dateStr);

    // Track assigned staff for today
    const dailyAssignments: { userId: string; patternId: string }[] = [];

    // Inject locked assignments into daily tracker & update history attributes
    lockedToday.forEach(la => {
      dailyAssignments.push({ userId: la.userId, patternId: la.patternId });
      
      const pattern = patterns.find(p => p.id === la.patternId);
      if (pattern) {
        hoursMap[la.userId] = (hoursMap[la.userId] || 0) + pattern.workHours;
        consecutiveDaysMap[la.userId] = (consecutiveDaysMap[la.userId] || 0) + 1;
        lastShiftMap[la.userId] = la.patternId;
        
        const dObj = new Date(dateStr);
        const isWkndOrHldy = dObj.getDay() === 0 || dObj.getDay() === 6 || isHoliday(dObj);
        if (isWkndOrHldy) {
          weekendShiftsCountMap[la.userId] = (weekendShiftsCountMap[la.userId] || 0) + 1;
        }
      }
    });

    // Collect the slots we need to fill today (excluding slots already filled by locked assignments)
    const slotsToFill: { departmentId: string; patternId: string }[] = [];
    const dailyDemands = dailyReqs[dateStr] || {};
    Object.entries(dailyDemands).forEach(([compositeKey, count]) => {
      const [deptId, patternId] = compositeKey.split('_');
      const alreadyFilled = lockedToday.filter(la => 
        (la.departmentId || "default") === deptId && la.patternId === patternId
      ).length;
      const remainingNeeded = Math.max(0, count - alreadyFilled);
      for (let i = 0; i < remainingNeeded; i++) {
        slotsToFill.push({ departmentId: deptId, patternId });
      }
    });

    // Sort to fill NIGHT shifts first, since they constrain the next day
    slotsToFill.sort((a, b) => {
      const patA = patterns.find(p => p.id === a.patternId)!;
      const patB = patterns.find(p => p.id === b.patternId)!;
      const isNightA = isNightShift(patA) ? 1 : 0;
      const isNightB = isNightShift(patB) ? 1 : 0;
      return isNightB - isNightA;
    });

    slotsToFill.forEach(({ departmentId, patternId }) => {
      const pattern = patterns.find(p => p.id === patternId)!;

      // Rate candidates
      const candidates = staff.map(u => {
        let isEligible = true;
        let score = 100;
        let reason = "";

        // 1. Off-dates rule (ABSOLUTE)
        if (offDatesMap[u.id].has(dateStr)) {
          isEligible = false;
          reason = "希望休";
        }

        // 2. Already working today (ABSOLUTE)
        if (isEligible && dailyAssignments.some(da => da.userId === u.id)) {
          isEligible = false;
          reason = "重複勤務不可";
        }

        // 3. Department skill compatibility constraint
        if (isEligible && departmentId !== "default") {
          if (u.departmentIds && u.departmentIds.length > 0) {
            if (!u.departmentIds.includes(departmentId)) {
              isEligible = false;
              reason = "部署割当スキルなし";
            }
          }
        }

        // 4. Shift transition rule: No day shift immediately after night shift (ABSOLUTE if active)
        if (isEligible && preventDayAfterNight) {
          const lastPatId = lastShiftMap[u.id];
          if (lastPatId) {
            const lastPat = patterns.find(p => p.id === lastPatId);
            if (lastPat && isNightShift(lastPat) && isDayShift(pattern)) {
              isEligible = false;
              reason = "夜勤明け日勤不可 (11h以上の休息)";
            }
          }
        }

        // 4. Preferred Style rule
        if (isEligible) {
          if (isNightShift(pattern) && u.preferredStyle === 'DAY_MAIN') {
            isEligible = false;
            reason = "日勤専門スタッフ";
          }
        }

        // 5. Max hours limit
        if (isEligible && limitMaxHours) {
          const currentHours = hoursMap[u.id] || 0;
          if (currentHours + pattern.workHours > u.maxHoursPerMonth) {
            isEligible = false;
            reason = "上限労働時間を超える";
          }
        }

        // 6. Max consecutive days warning / constraint
        if (isEligible) {
          const consec = consecutiveDaysMap[u.id] || 0;
          if (consec >= maxConsecutiveDays) {
            if (consec >= maxConsecutiveDays + 1) {
              isEligible = false;
              reason = `${maxConsecutiveDays}日連続勤務制限`;
            } else {
              // Soft penalty to prevent long consecutive working blocks
              score -= 300;
            }
          }
        }

        // 7. Pair forbidden rules
        if (isEligible) {
          const alreadyAssignedToday = dailyAssignments.map(da => da.userId);
          const hasViolation = pairRestrictions.some(r => {
            if (r.type === "FORBIDDEN") {
              const matchesSelfAndOther = 
                (r.staffId1 === u.id && alreadyAssignedToday.includes(r.staffId2)) ||
                (r.staffId2 === u.id && alreadyAssignedToday.includes(r.staffId1));
              return matchesSelfAndOther;
            }
            return false;
          });
          if (hasViolation) {
            isEligible = false;
            reason = "NGペアと同日勤務制限";
          }
        }

        // --- Priority Boosts & Penalties ---
        if (isEligible) {
          // Specific request prioritization
          const reqs = specificRequestsMap[u.id]?.[dateStr];
          if (reqs && reqs.includes(patternId)) {
            score += 2500; // Extremely high priority to honor user requests
          } else if (reqs && reqs.length > 0) {
            score -= 500; // They requested another shift, don't give them this one
          }

          // Balance hours - prefer users far from their max hours
          const currHours = hoursMap[u.id] || 0;
          const maxH = u.maxHoursPerMonth;
          const remainingPct = (maxH - currHours) / maxH;
          score += remainingPct * 300;

          // Meet minimum hours targets
          if (limitMinHours) {
            const minH = u.minHoursPerMonth ?? 0;
            if (currHours < minH) {
              score += (minH - currHours) * 15; // Strongly pull up to satisfy minHours
            }
          }

          // Shift style affinity score
          if (isNightShift(pattern) && u.preferredStyle === 'NIGHT_MAIN') {
            score += 200;
          }
          if (isDayShift(pattern) && u.preferredStyle === 'DAY_MAIN') {
            score += 100;
          }

          // Primary/Main Department preference alignment
          if (departmentId !== "default" && u.primaryDepartmentId) {
            if (u.primaryDepartmentId === departmentId) {
              score += 1000; // Prioritize assignment to primary department
            } else {
              score -= 300; // Deprioritize secondary department assignment if they have a primary choice
            }
          }

          // Consecutive working days penalty
          const consec = consecutiveDaysMap[u.id] || 0;
          score -= (consec * 40);

          // 1. 土日祝の均等割当 (balanceWeekendShifts)
          const dObj = new Date(dateStr);
          const isWkndOrHldy = dObj.getDay() === 0 || dObj.getDay() === 6 || isHoliday(dObj);
          if (balanceWeekendShifts && isWkndOrHldy) {
            const wkndCount = weekendShiftsCountMap[u.id] || 0;
            score -= (wkndCount * 150); // Penalty for already assignments on weekends
          }

          // 2. 連休推奨 (preferConsecutiveOff)
          if (preferConsecutiveOff && lastShiftMap[u.id] === null) {
            score -= 150; // Penalize breaking candidate's rest sequence
          }

          // 3. リーダー常駐優先 (requireLeaderInShift)
          if (requireLeaderInShift) {
            const leadersAssignedCount = dailyAssignments.filter(da => {
              const assignedUser = staff.find(s => s.id === da.userId);
              return da.patternId === patternId && assignedUser?.isLeader;
            }).length;

            if (leadersAssignedCount === 0) {
              if (u.isLeader) {
                score += 1500; // Large boost to guarantee leader when none is assigned
              }
            }
          }

          // Random noise for fairness and breaks tie-breakers
          score += Math.random() * 20;
        }

        return {
          user: u,
          isEligible,
          score,
          reason
        };
      });

      // Filter and assign
      const dObjForDay = new Date(dateStr);
      const isWkndOrHldyForDay = dObjForDay.getDay() === 0 || dObjForDay.getDay() === 6 || isHoliday(dObjForDay);

      const eligibleCandidates = candidates.filter(c => c.isEligible);
      if (eligibleCandidates.length > 0) {
        eligibleCandidates.sort((a, b) => b.score - a.score);
        const best = eligibleCandidates[0].user;

        dailyAssignments.push({ userId: best.id, patternId });
        assignments.push({ 
          date: dateStr, 
          userId: best.id, 
          patternId, 
          departmentId: departmentId === "default" ? undefined : departmentId 
        });

        hoursMap[best.id] = (hoursMap[best.id] || 0) + pattern.workHours;
        consecutiveDaysMap[best.id] = (consecutiveDaysMap[best.id] || 0) + 1;
        lastShiftMap[best.id] = patternId;
        if (isWkndOrHldyForDay) {
          weekendShiftsCountMap[best.id] = (weekendShiftsCountMap[best.id] || 0) + 1;
        }
      } else {
        // Fallback: If no candidate was 100% eligible, relax softer rules (e.g., maxHours, preferred styles)
        const relaxedCandidates = candidates.filter(c => {
          // offDates are hard. Already working is absolute hard. Pair boundary is hard.
          const isHardInvalid = offDatesMap[c.user.id].has(dateStr) || 
                                dailyAssignments.some(da => da.userId === c.user.id);
          return !isHardInvalid;
        });

        if (relaxedCandidates.length > 0) {
          relaxedCandidates.sort((a, b) => b.score - a.score);
          const best = relaxedCandidates[0].user;

          dailyAssignments.push({ userId: best.id, patternId });
          assignments.push({ 
            date: dateStr, 
            userId: best.id, 
            patternId, 
            departmentId: departmentId === "default" ? undefined : departmentId 
          });

          hoursMap[best.id] = (hoursMap[best.id] || 0) + pattern.workHours;
          consecutiveDaysMap[best.id] = (consecutiveDaysMap[best.id] || 0) + 1;
          lastShiftMap[best.id] = patternId;
          if (isWkndOrHldyForDay) {
            weekendShiftsCountMap[best.id] = (weekendShiftsCountMap[best.id] || 0) + 1;
          }
        } else {
          console.warn(`[LocalSolver] 無理な制約：${dateStr}のパターン${pattern.name}を割り当てられるスタッフがいません。`);
        }
      }
    });

    // Reset consecutive counter for staff not working today (ensure assignments with null/empty patternId like locked-off are treated as not working)
    staff.forEach(u => {
      const workedToday = dailyAssignments.some(da => da.userId === u.id && da.patternId && da.patternId !== "OFF");
      if (!workedToday) {
        consecutiveDaysMap[u.id] = 0;
        lastShiftMap[u.id] = null;
      }
    });
  });

  return assignments;
}
