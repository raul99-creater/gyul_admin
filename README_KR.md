# 귤귤 일정관리 - admin

1. Supabase SQL Editor에서 `supabase/gyulgyul_real_setup.sql` 전체 실행
2. 이 폴더를 GitHub 새 레포에 업로드
3. Vercel에서 해당 레포를 Import
4. 배포 후 `index.html` 접속

로그인:
- 슈퍼어드민: `wfe2303 / 122303`
- 강사 admin: 이름 + 전화번호 (슈퍼어드민 승인 후)

회원가입:
- 로그인 화면의 `회원가입` 버튼 → 강사 admin 신청

주의:
- main/admin은 별도 레포 / 별도 Vercel 프로젝트로 올리되, 같은 Supabase 프로젝트를 공유합니다.


추가 패치:
- local-demo 운영기능(방번호/메모, QR 출석, 수강생 대조, 활동로그)을 쓰려면
  `supabase/gyulgyul_localdemo_feature_patch.sql` 도 추가 실행하세요.
