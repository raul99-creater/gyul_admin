# 귤귤 어드민 Vercel 배포 가이드

이 프로젝트는 **정적 HTML/CSS/JS** 기반이라 Vercel에 바로 올릴 수 있습니다.
같은 Supabase 프로젝트를 바라보는 **main 회원 포털**과 연결되도록 기본 설정을 넣어뒀습니다.

## 1) GitHub에 업로드
1. 새 GitHub 저장소 생성
2. 이 폴더의 **내용물 전체**를 저장소 루트에 업로드
   - `index.html`, `assets/`, `supabase/`, `docs/`, `vercel.json` 이 바로 보여야 정상

## 2) Vercel 배포
1. Vercel 로그인
2. **Add New → Project**
3. 방금 만든 GitHub 저장소 선택
4. Framework Preset: **Other**
5. Root Directory: `/`
6. Deploy

## 3) main과 연결
배포 후 Vercel 주소가 정해지면 `assets/js/config.js`에서 아래 값을 확인하세요.

```js
mainAppUrl: 'https://YOUR-MAIN-PROJECT.vercel.app'
```

`YOUR-MAIN-PROJECT`를 실제 main 주소로 바꾸고 GitHub에 push 하면 자동 재배포됩니다.

## 4) Supabase
- 이 프로젝트는 같은 Supabase 프로젝트를 사용합니다.
- 현재 URL / key는 이미 입력되어 있습니다.
- main과 admin은 **같은 Supabase**를 바라봐야 합니다.

## 5) 첫 슈퍼어드민
어드민 로그인 화면에서 관리자 계정을 하나 만든 뒤, Supabase SQL Editor에서 아래를 1회 실행하세요.

```sql
select public.bootstrap_super_admin('당신의이메일@example.com');
```

## 6) 확인 체크리스트
- 로그인 화면이 먼저 뜨는지
- 슈퍼어드민 로그인 가능한지
- 강의/기수 생성되는지
- 토큰 생성되는지
- 생성된 토큰 링크가 main 회원가입으로 연결되는지
