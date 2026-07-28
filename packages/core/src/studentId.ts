/**
 * 校內身分識別碼推導（單一來源，web 與 App 共用）
 *
 * 平台不讓使用者手動輸入學號：改以「學校信箱網域」驗證身分，識別碼一律取自信箱帳號前綴。
 * - 學生：前綴本身就是學號（例：s1354032@mail.ncue.edu.tw → S1354032）
 * - 教職員／別名信箱：沒有學號，前綴即為其識別碼（例：juh@gm.ncue.edu.tw → JUH）
 * 非校內信箱（如 Gmail）推導不出識別碼，須以驗證碼綁定學校信箱，
 * 或改以自備 Gemini 金鑰註冊為校外使用者（見 aiKey.ts）。
 */

export const STUDENT_EMAIL_DOMAINS = ['mail.ncue.edu.tw', 'gm.ncue.edu.tw'];

/** 校內信箱格式：帳號前綴 + 指定網域（前綴不限學號格式） */
const SCHOOL_EMAIL_PATTERN = /^([a-z0-9][a-z0-9._-]{0,63})@(?:mail|gm)\.ncue\.edu\.tw$/;

/** 標準學號格式（單一字母 + 6~8 碼數字），用於區分學生與教職員 */
const STUDENT_ID_PATTERN = /^[A-Z]\d{6,8}$/;

/**
 * 由 Email 推導校內識別碼（一律轉大寫）；非校內信箱回傳 null。
 * 學生取得的是學號，教職員／別名信箱取得的是帳號前綴。
 */
export function deriveStudentIdFromEmail(email = '') {
    const m = String(email).trim().toLowerCase().match(SCHOOL_EMAIL_PATTERN);
    return m ? m[1].toUpperCase() : null;
}

/** 是否為校內信箱（含教職員與別名信箱） */
export function isStudentEmail(email = '') {
    return deriveStudentIdFromEmail(email) !== null;
}

/** 識別碼是否為標準學號格式（false 代表教職員或別名信箱的帳號前綴） */
export function isStudentIdFormat(identifier = '') {
    return STUDENT_ID_PATTERN.test(String(identifier).trim().toUpperCase());
}
