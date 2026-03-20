import { APP_CONFIG } from '../config.js';
import { escapeHtml } from './utils.js';
import { signOut } from './service.js';

function resolveHref(path) {
  const base = APP_CONFIG.siteBasePath || '';
  return `${base}${path}`;
}

export function renderHeader(active = '') {
  const header = document.getElementById('siteHeader');
  if (!header) return;
  const isAdmin = APP_CONFIG.appType === 'admin';
  const mainUrl = APP_CONFIG.mainAppUrl || '#';
  const adminUrl = APP_CONFIG.adminAppUrl || '#';
  const nav = isAdmin
    ? `
      <a href="${resolveHref('/index.html')}" class="${active === 'admin' ? 'active' : ''}">관리</a>
      ${APP_CONFIG.mainAppUrl ? `<a href="${mainUrl}">메인</a>` : ''}
    `
    : `
      <a href="${resolveHref('/index.html')}" class="${active === 'home' ? 'active' : ''}">로그인</a>
      <a href="${resolveHref('/dashboard.html')}" class="${active === 'dashboard' ? 'active' : ''}">내 일정</a>
      <a href="${resolveHref('/signup.html')}" class="${active === 'signup' ? 'active' : ''}">회원가입</a>
      ${APP_CONFIG.adminAppUrl ? `<a href="${adminUrl}">어드민</a>` : ''}
    `;
  header.innerHTML = `
    <div class="container nav-wrap">
      <a class="brand" href="${resolveHref('/index.html')}">
        <span class="brand-mark" aria-hidden="true"></span>
        <span class="brand-text">${escapeHtml(APP_CONFIG.siteName || '귤귤 일정관리')}</span>
      </a>
      <nav class="site-nav">${nav}</nav>
      <div class="nav-actions"></div>
    </div>`;
}

export function renderFooter() {
  const footer = document.getElementById('siteFooter');
  if (!footer) return;
  footer.innerHTML = `<div class="container"><div class="footer">${escapeHtml(APP_CONFIG.siteName || '귤귤 일정관리')}</div></div>`;
}

export function setStatus(message, type = '') {
  const bar = document.getElementById('statusBar');
  if (!bar) return;
  bar.className = `status-bar ${type}`.trim();
  bar.textContent = message;
}

export async function wireLogoutButtons() {
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action="logout"]');
    if (!button) return;
    event.preventDefault();
    try {
      await signOut();
      window.location.href = resolveHref('/index.html');
    } catch (error) {
      setStatus(error.message || '로그아웃에 실패했습니다.', 'err');
    }
  });
}
