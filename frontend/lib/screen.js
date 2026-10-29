/* =========================================================
   screen.js — "폰"의 기준 폭을 한 곳에 둔다

   JS 는 여기 isPhone() 하나만 쓴다. CSS 는 이 파일을 못 읽으므로 같은 숫자(768px)를
   @media 에 직접 적는다 — 숫자를 바꾸면 아래 자리도 같이 바꾼다(모바일 교안 네 편을 다 치면 다섯 곳)
     test.css · mobile.css · signup.html · mypage.html
   ========================================================= */

export const PHONE_QUERY = "(max-width: 768px)";

/** 지금 화면이 폰 폭인가 */
export const isPhone = () => matchMedia(PHONE_QUERY).matches;
