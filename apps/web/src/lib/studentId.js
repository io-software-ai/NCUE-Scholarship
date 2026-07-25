/**
 * 學號推導（單一來源）
 *
 * 平台不再讓使用者手動輸入學號：改以「學校信箱網域」驗證身分，
 * 學號直接取自信箱帳號（例：s1354032@mail.ncue.edu.tw → 學號 S1354032）。
 * 非校內信箱（如 Gmail）登入者無學號，屬一般訪客身分。
 */

export const STUDENT_EMAIL_DOMAINS = ['mail.ncue.edu.tw', 'gm.ncue.edu.tw'];

/** 由 Email 推導學號；非校內信箱回傳 null */
export function deriveStudentIdFromEmail(email = '') {
    const m = String(email).trim().toLowerCase()
        .match(/^([a-z]\d{6,8})@(?:mail|gm)\.ncue\.edu\.tw$/);
    return m ? m[1].toUpperCase() : null;
}

/** 是否為校內學生信箱 */
export function isStudentEmail(email = '') {
    return deriveStudentIdFromEmail(email) !== null;
}
