export interface Department {
  id: string;
  hotelId: string;
  name: string;
}

export type Role = "ADMIN" | "STAFF";
export type PreferredStyle = "DEFAULT" | "DAY_MAIN" | "NIGHT_MAIN";

export interface User {
  id: string;
  hotelId: string;
  role: Role;
  name: string;
  maxHoursPerMonth: number;
  minHoursPerMonth?: number;
  preferredStyle: PreferredStyle;
  isLeader?: boolean; // リーダー/ベテランフラグ
  departmentIds?: string[]; // 所属（スキル）部署ID配列
  primaryDepartmentId?: string; // メイン部署ID
}

export interface ShiftPattern {
  id: string;
  hotelId: string;
  name: string;
  shortName: string;
  startTime: string;
  endTime: string;
  workHours: number;
}

export interface Requirement {
  id: string;
  hotelId: string;
  date: string; // ISO yyyy-MM-dd
  patternId: string;
  count: number;
  departmentId?: string; // 部署ID
}

export interface PairRestriction {
  id: string;
  hotelId: string;
  staffId1: string;
  staffId2: string;
  type: "FORBIDDEN";
}

export interface Submission {
  id: string;
  hotelId: string;
  userId: string;
  yearMonth: string; // yyyy-MM
  offDates: string[]; // dates
  specificRequests: { date: string; patternIds: string[] }[];
}

export interface Assignment {
  date: string;
  userId: string;
  patternId: string;
  isLocked?: boolean;
  departmentId?: string; // 部署ID
}

export interface ScheduleRule {
  id: string;
  hotelId: string;
  maxConsecutiveDays: number;     // 連続勤務上限日数
  preventDayAfterNight: boolean;  // 夜勤明け日勤不可 (11時間以上の休息)
  limitMaxHours: boolean;        // 月間労働上限時間を超えない
  limitMinHours: boolean;        // 月間労働下限時間に極力引き上げる
  balanceWeekendShifts?: boolean; // 土日祝の均等割当
  preferConsecutiveOff?: boolean; // 連休推奨 (2日以上の連休を優先)
  requireLeaderInShift?: boolean; // 各シフトにリーダー/ベテランを少なくとも1名配置
}

export interface Schedule {
  id: string;
  hotelId: string;
  yearMonth: string;
  status: "draft" | "published";
  assignments: Assignment[];
}
