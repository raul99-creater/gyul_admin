import { uid } from './utils.js';

function daysFromNow(days, hour = 19, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

export function createDemoState() {
  const course1 = {
    id: uid('course'), slug: 'shopping-shorts-master', title: '쇼핑쇼츠 마스터반',
    subtitle: '상품 소싱부터 쇼츠 운영, 전환 구조까지 정리하는 실전 트랙',
    description: '참여자 전용 대시보드에서 라이브 일정, 모집 행사, 과제, 공지까지 한 번에 볼 수 있는 구조입니다.',
    accent_color: '#ff9d4d', status: 'active', is_visible: true,
    instructor_name: '디노', cohort_label: '3기',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  };
  const course2 = {
    id: uid('course'), slug: 'ai-shorts-agency', title: 'AI 쇼츠 대행 부트캠프',
    subtitle: '대행 구조, 클라이언트 커뮤니케이션, 제작 플로우를 다루는 운영 트랙',
    description: '주차별 과제와 별도 행사 일정을 함께 보는 구조 예시입니다.',
    accent_color: '#ff9d4d', status: 'active', is_visible: true,
    instructor_name: '어비', cohort_label: '1기',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  };
  const student = { id: 'demo-user-1', email: 'student@gyulgyul.demo', full_name: '데모 수강생', phone: '010-1111-2222', role_hint: 'student' };
  const admin = { id: 'demo-admin-1', email: 'admin@gyulgyul.demo', full_name: '데모 총관리자', phone: '010-3333-4444', role_hint: 'super_admin' };
  const instructorAdmin = { id: 'demo-admin-2', email: 'instructor@gyulgyul.demo', full_name: '데모 강사 어드민', phone: '010-5555-6666', role_hint: 'course_admin' };

  const schedules = [
    { id: uid('sch'), course_id: course1.id, week_no: 1, title: 'OT + 상품 구조 이해', starts_at: daysFromNow(-2, 20), ends_at: daysFromNow(-2, 22), location: '줌 라이브', description: '첫 주 라이브', created_at: new Date().toISOString() },
    { id: uid('sch'), course_id: course1.id, week_no: 2, title: '소싱 실습 피드백', starts_at: daysFromNow(5, 20), ends_at: daysFromNow(5, 22), location: '줌 라이브', description: '2주차 라이브', created_at: new Date().toISOString() },
    { id: uid('sch'), course_id: course1.id, week_no: 3, title: '콘텐츠 구조 점검', starts_at: daysFromNow(12, 20), ends_at: daysFromNow(12, 22), location: '줌 라이브', description: '3주차 라이브', created_at: new Date().toISOString() },
    { id: uid('sch'), course_id: course2.id, week_no: 1, title: 'AI 대행 구조 OT', starts_at: daysFromNow(1, 19), ends_at: daysFromNow(1, 21), location: '줌 라이브', description: '1주차 OT', created_at: new Date().toISOString() },
    { id: uid('sch'), course_id: course2.id, week_no: 2, title: '샘플 제작 워크숍', starts_at: daysFromNow(8, 19), ends_at: daysFromNow(8, 21), location: '줌 라이브', description: '2주차 실습', created_at: new Date().toISOString() },
  ];

  const events = [
    { id: uid('evt'), course_id: course1.id, title: '오프라인 촬영회 추가 모집', category: 'recruitment', registration_open_at: daysFromNow(-1, 9), registration_close_at: daysFromNow(3, 18), starts_at: daysFromNow(6, 14), ends_at: daysFromNow(6, 17), location: '성수 스튜디오', description: '쇼츠 촬영 실습 인원 추가 모집', apply_url: '#', created_at: new Date().toISOString() },
    { id: uid('evt'), course_id: course1.id, title: '2주차 질의응답 세션', category: 'scheduled', registration_open_at: '', registration_close_at: '', starts_at: daysFromNow(5, 22), ends_at: daysFromNow(5, 23), location: '줌 라이브', description: '과제 피드백 이후 추가 Q&A', apply_url: '', created_at: new Date().toISOString() },
    { id: uid('evt'), course_id: course1.id, title: '1주차 보충 모집', category: 'recruitment', registration_open_at: daysFromNow(-10, 9), registration_close_at: daysFromNow(-5, 18), starts_at: daysFromNow(-3, 20), ends_at: daysFromNow(-3, 21), location: '줌 라이브', description: '마감된 행사 예시', apply_url: '#', created_at: new Date().toISOString() },
    { id: uid('evt'), course_id: course2.id, title: '외부 라이브 설명회', category: 'recruitment', registration_open_at: daysFromNow(4, 9), registration_close_at: daysFromNow(9, 18), starts_at: daysFromNow(11, 20), ends_at: daysFromNow(11, 21), location: '줌 라이브', description: '아직 열리지 않은 예정 행사', apply_url: '#', created_at: new Date().toISOString() },
    { id: uid('evt'), course_id: course2.id, title: '클라이언트 제안서 워크숍', category: 'scheduled', registration_open_at: '', registration_close_at: '', starts_at: daysFromNow(2, 20), ends_at: daysFromNow(2, 22), location: '줌 라이브', description: '주차 외 특별 워크숍', apply_url: '', created_at: new Date().toISOString() },
  ];

  const assignments = [
    { id: uid('asg'), course_id: course1.id, week_no: 1, title: '시장 조사 시트 제출', description: '카테고리 3개 이상, 경쟁 채널 5개 이상 조사해서 제출', due_at: daysFromNow(2, 23), material_url: '', is_required: true, created_at: new Date().toISOString() },
    { id: uid('asg'), course_id: course1.id, week_no: 2, title: '상품 10개 선별 + 사유 작성', description: '선정 이유와 타깃 문장까지 같이 제출', due_at: daysFromNow(9, 23), material_url: '', is_required: true, created_at: new Date().toISOString() },
    { id: uid('asg'), course_id: course1.id, week_no: 3, title: '테스트 쇼츠 3편 업로드', description: '썸네일, 후킹 문장, CTA 포함', due_at: daysFromNow(16, 23), material_url: '', is_required: true, created_at: new Date().toISOString() },
    { id: uid('asg'), course_id: course2.id, week_no: 1, title: '포트폴리오 샘플 2종 만들기', description: '대행 제안 전에 보여줄 샘플 영상 제작', due_at: daysFromNow(4, 23), material_url: '', is_required: true, created_at: new Date().toISOString() },
    { id: uid('asg'), course_id: course2.id, week_no: 2, title: '제안서 템플릿 완성', description: '가격표와 납기 기준 포함', due_at: daysFromNow(11, 23), material_url: '', is_required: true, created_at: new Date().toISOString() },
  ];

  const memberships = [
    { id: uid('mem'), course_id: course1.id, user_id: student.id, role: 'student', created_at: new Date().toISOString() },
    { id: uid('mem'), course_id: course2.id, user_id: student.id, role: 'student', created_at: new Date().toISOString() },
  ];

  const adminRoles = [
    { id: uid('adm'), user_id: admin.id, course_id: null, role_type: 'super_admin', created_at: new Date().toISOString() },
    { id: uid('adm'), user_id: instructorAdmin.id, course_id: course1.id, role_type: 'course_admin', created_at: new Date().toISOString() },
  ];

  const tokens = [
    { id: uid('tok'), course_id: course1.id, token: 'SHOPPING-ALPHA-2026', token_name: '디노 3기 회원가입', welcome_message: '쇼핑쇼츠 마스터반 3기 참여자 전용 회원가입 링크입니다.', expires_at: daysFromNow(30, 23), max_uses: 150, is_active: true, created_at: new Date().toISOString() },
    { id: uid('tok'), course_id: course2.id, token: 'AI-AGENCY-2026', token_name: '어비 1기 회원가입', welcome_message: 'AI 쇼츠 대행 부트캠프 참여자 전용 회원가입 링크입니다.', expires_at: daysFromNow(30, 23), max_uses: 150, is_active: true, created_at: new Date().toISOString() },
  ];

  const adminRequests = [
    { id: uid('req'), requester_id: instructorAdmin.id, requester_email: instructorAdmin.email, full_name: instructorAdmin.full_name, phone: instructorAdmin.phone, requested_role_type: 'course_admin', requested_course_id: course1.id, memo: '강의 운영 및 수강생 관리가 필요합니다.', status: 'pending', created_at: new Date().toISOString(), reviewed_at: null }
  ];

  return {
    profiles: [student, admin, instructorAdmin],
    authUsers: [
      { email: 'student@gyulgyul.demo', password: 'demo1234', user_id: student.id },
      { email: 'admin@gyulgyul.demo', password: 'admin1234', user_id: admin.id },
      { email: 'instructor@gyulgyul.demo', password: 'admin1234', user_id: instructorAdmin.id },
    ],
    courses: [course1, course2],
    course_memberships: memberships,
    course_schedule: schedules,
    course_events: events,
    course_assignments: assignments,
    course_admin_roles: adminRoles,
    signup_tokens: tokens,
    admin_signup_requests: adminRequests,
    meta: { site_title: '귤귤', site_subtitle: '참여자 전용 강의 대시보드 데모' },
  };
}
