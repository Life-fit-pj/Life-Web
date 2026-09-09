/**
 * Supabase 클라이언트 (프론트 전용).
 *
 * anon key 는 공개키라 그대로 박아 둬도 된다 — service_role 키는 Life-Embed-jh/.env 에만
 * 있고, 그쪽 verify_token() 만 관리자 권한으로 쓴다. 값을 바꾸면 Life-Web/.env 의
 * SUPABASE_URL/SUPABASE_ANON_KEY 도 같이 바꿔 둔다(둘이 같은 값이어야 한다).
 *
 * 빌드 단계가 없는 저장소라 npm 패키지 대신 esm.sh CDN 에서 ES 모듈로 바로 불러온다.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://vcprgtneyssgkklgqpbl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjcHJndG5leXNzZ2trbGdxcGJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3NjUyNTQsImV4cCI6MjEwNDM0MTI1NH0.OD8W1a6QYvgl3kgu0gYq5CtwuV7a3hYywKCWMPXJTik";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
