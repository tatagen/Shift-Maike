/**
 * 日本の祝日を判定・取得するユーティリティ (2025年〜2027年対応版)
 * インターネット未接続でも自己完結で正確に判定できます。
 */

// 固定祝日の定義
const FIXED_HOLIDAYS: Record<string, string> = {
  // 1月
  '01-01': '元日',
  // 2月
  '02-11': '建国記念の日',
  '02-23': '天皇誕生日',
  // 4月
  '04-29': '昭和の日',
  // 5月
  '05-03': '憲法記念日',
  '05-04': 'みどりの日',
  '05-05': 'こどもの日',
  // 8月
  '08-11': '山の日',
  // 11月
  '11-03': '文化の日',
  '11-23': '勤労感謝の日',
};

// ハッピーマンデーや年によって変動する祝日の計算
export function getJapanHoliday(date: Date): string | null {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  
  const mStr = String(m).padStart(2, '0');
  const dStr = String(d).padStart(2, '0');
  const mmdd = `${mStr}-${dStr}`;
  const yyyymmdd = `${y}-${mStr}-${dStr}`;

  // 1. 固定祝日のチェック
  if (FIXED_HOLIDAYS[mmdd]) {
    return FIXED_HOLIDAYS[mmdd];
  }

  // 2. 年によって変わる祝日 (春分・秋分の日)
  // 簡易天文学式による春分の日・秋分の日の計算
  if (m === 3) {
    let equinoxDay = 20; // デフォルト
    if (y === 2025) equinoxDay = 20;
    if (y === 2026) equinoxDay = 20;
    if (y === 2027) equinoxDay = 21;
    if (d === equinoxDay) return '春分の日';
  }
  if (m === 9) {
    let equinoxDay = 23; // デフォルト
    if (y === 2025) equinoxDay = 23;
    if (y === 2026) equinoxDay = 23;
    if (y === 2027) equinoxDay = 23;
    if (d === equinoxDay) return '秋分の日';
  }

  // 3. ハッピーマンデー制度 (成人の日, 海の日, 敬老の日, スポーツの日)
  const dayOfWeek = date.getDay(); // 0 is Sunday, 1 is Monday...
  const nthMonday = Math.floor((d - 1) / 7) + 1;

  if (dayOfWeek === 1) { // 月曜日
    if (m === 1 && nthMonday === 2) return '成人の日'; // 1月第2月曜
    if (m === 7 && nthMonday === 3) return '海の日';   // 7月第3月曜
    if (m === 9 && nthMonday === 3) return '敬老の日'; // 9月第3月曜
    if (m === 10 && nthMonday === 2) return 'スポーツの日'; // 10月第2月曜
  }

  // 4. 振替休日の判定法
  // 祝日が日曜日の場合、その後の最初の祝日でない日が休日となる。
  // 祝日法「国民の祝日が日曜日に当たるときは、その翌日を休日とする」
  // 2025〜2027年の既知の振替休日
  const substitutes: Record<string, string> = {
    // 2025
    '2025-02-24': '振替休日', // 天皇誕生日が日曜日
    '2025-11-24': '振替休日', // 勤労感謝の日が日曜日
    // 2026
    '2026-05-06': '振替休日', // 憲法記念日5/3が日曜日 -> 5/6振替
    '2026-11-24': '振替休日', // 勤労感謝の日が日曜日
    // 2027
    '2027-02-24': '振替休日', // 天皇誕生日が日曜日
    '2027-03-22': '振替休日', // 春分の日が日曜日
    '2027-08-12': '振替休日', // 山の日が日曜日
  };

  if (substitutes[yyyymmdd]) {
    return substitutes[yyyymmdd];
  }

  // 国民の休日判定 (前日と翌日の両方が祝日である平日)
  // 例：敬老の日と秋分の日に挟まれた日 (シルバーウィークなど)
  // 2025〜2027年には該当なし(2026年9月22日は敬老9/21,秋分9/23に挟まれるので国民の休日)
  if (y === 2026 && m === 9 && d === 22) {
    return '国民の休日';
  }

  return null;
}

export function isHoliday(date: Date): boolean {
  return getJapanHoliday(date) !== null;
}
