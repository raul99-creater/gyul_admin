# 귤귤 어드민 배포 가이드 (Vercel)

## 1) 이 zip으로 하는 일
- 어드민 로그인 화면
- 첫 슈퍼어드민 계정 생성
- 강사 어드민 가입 신청
- 강의/기수 생성
- 일정/행사/과제/토큰 생성
- 슈퍼어드민의 전체 회원 조회
- 강사 어드민 / 슈퍼어드민 권한 부여

## 2) 배포 전 꼭 알아둘 점
- 이 프로젝트도 **정적 HTML/CSS/JS** 입니다.
- `assets/js/config.js` 에 Supabase URL / key 가 이미 들어가 있습니다.
- `mainAppUrl` 은 **메인 포털 주소**를 배포 후 넣어야 토큰 링크가 완성됩니다.

## 3) GitHub 업로드
1. GitHub에서 새 저장소 생성
   - 예: `gyulgyul-admin`
2. 이 zip 압축 해제
3. 파일 전체를 저장소 루트에 업로드
4. 커밋

## 4) Vercel 배포
1. Vercel → **Add New → Project**
2. `gyulgyul-admin` 저장소 선택
3. Framework Preset: **Other**
4. Root Directory: `/`
5. Deploy

Vercel은 같은 GitHub 계정의 저장소를 각각 별도 프로젝트로 import할 수 있고, 프로젝트 생성 시 Git 저장소 import와 Root Directory 설정을 공식 지원합니다. citeturn369238search0turn369238search8

## 5) Supabase 최초 세팅
### A. SQL 실행
Supabase Dashboard → SQL Editor → New query
1. `supabase/schema.sql` 전체 실행
2. 필요하면 `supabase/seed.sql` 실행

### B. 첫 슈퍼어드민 만들기
1. 어드민 앱 첫 화면에서 **첫 슈퍼어드민 계정 만들기** 폼 작성
2. 계정 생성 완료 메시지 확인
3. Supabase SQL Editor에서 아래 실행
```sql
select public.bootstrap_super_admin('네이메일');
```
4. 다시 어드민 로그인

이 함수는 첫 계정을 `course_admin_roles` 의 `super_admin` 으로 등록하기 위한 부트스트랩 단계입니다.

## 6) 강사 어드민 가입 신청 흐름
1. 강사/운영진이 어드민 첫 화면 하단 **가입 신청** 제출
2. 슈퍼어드민 로그인
3. 가입 신청 목록에서 이메일 확인
4. **어드민 권한 부여** 폼에 해당 이메일 입력
5. 권한 유형 선택
   - `course_admin` 이면 담당 강의/기수도 선택
   - `super_admin` 이면 강의 선택 없이 부여

## 7) 강의별 회원가입 페이지 만들기
1. 강의/기수 생성
2. 회원가입 토큰 생성
3. `mainAppUrl` 을 config.js 에 입력
```js
mainAppUrl: 'https://네-메인-주소.vercel.app',
```
4. 토큰 링크 미리보기에서 URL 복사
5. 해당 URL을 강의 참여자에게 전달
   - 예: `https://메인주소/signup.html?token=DINO-3-2026`

## 8) 슈퍼어드민 / 강사 어드민 차이
- **슈퍼어드민**: 모든 강사·기수의 회원, 일정, 행사, 과제, 토큰, 가입 신청, 권한을 모두 조회
- **강사 어드민**: 배정된 강의(강사/기수) 범위만 조회/등록

이 구분은 `course_admin_roles` 와 RLS 정책으로 처리됩니다.

## 9) config.js 수정 위치
배포 후 메인 주소를 알게 되면 아래 수정
```js
mainAppUrl: 'https://네-메인-주소.vercel.app',
```
수정 후 GitHub push → Vercel 자동 재배포

## 10) 문제 생기면 먼저 볼 것
- 로그인 실패 → Supabase Authentication에서 Email auth 확인
- 슈퍼어드민인데도 데이터가 안 보임 → bootstrap SQL 실행 여부 확인
- 강사 어드민이 전체 회원을 봄 → role_type / course_id 잘못 부여했는지 확인
- 토큰 링크가 `메인 앱 URL 설정 후 표시됩니다` 로 보임 → `mainAppUrl` 미입력
