이 ZIP은 local-demo 기능이 합쳐진 v18-merged 기준입니다.
추가 수정:
- gyulgyul_ui_roles_support_patch.sql 의 min(uuid) 오류 수정
- hotfix_min_uuid_bootstrap.sql 추가

적용 순서:
1) 현재 서버가 이미 real_setup + ui_roles_support_patch + admin_role_delete_patch 상태라면,
   hotfix_min_uuid_bootstrap.sql 만 실행해도 됩니다.
2) 처음부터 다시 세울 경우:
   - gyulgyul_real_setup.sql
   - gyulgyul_ui_roles_support_patch.sql
   - gyulgyul_admin_role_delete_patch.sql
