-- optional sample seed
insert into public.courses (slug, title, subtitle, description, instructor_name, cohort_label, accent_color)
values
('shopping-shorts-master-3','쇼핑쇼츠 마스터반','상품 소싱부터 쇼츠 운영까지 정리하는 실전 트랙','참여자 전용 대시보드 예시입니다.','디노','3기','#ff9d4d'),
('ai-shorts-agency-1','AI 쇼츠 대행 부트캠프','대행 구조와 제작 플로우를 다루는 운영 트랙','주차별 과제와 행사 일정을 함께 보는 구조 예시입니다.','어비','1기','#ff9d4d')
on conflict (slug) do nothing;
