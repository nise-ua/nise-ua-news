export const workflowFilters = [
  ['all', 'Усі'], ['review', 'Потребують перевірки'], ['progress', 'У роботі'],
  ['ready', 'Готові до публікації'], ['published', 'Опубліковані'],
];

const channels = [
  ['facebook_post_id', 'Facebook'], ['facebook_reel_id', 'Reel'],
  ['facebook_story_id', 'Story'], ['youtube_post_id', 'YouTube'], ['telegram_message_id', 'Telegram'],
];

export function digestWorkflow(digest, { reviewed = false, videoJob, imageJob, busy = false } = {}) {
  const jobs = [videoJob, imageJob].filter(Boolean);
  if (busy || jobs.some(job => ['queued', 'running'].includes(job.status))) {
    return { stage: 'progress', label: 'У роботі', action: 'waiting', next: 'Виконується…', hint: 'Можна продовжити роботу з іншими дайджестами.' };
  }
  if (!digest.content?.trim()) {
    return { stage: 'review', label: 'Немає тексту', action: 'articles', next: 'Перейти до статей', hint: 'Перевірте статті та створіть дайджест.' };
  }
  if (jobs.some(job => job.status === 'failed')) {
    return { stage: 'review', label: 'Потрібна увага', action: 'review', next: 'Переглянути текст', hint: 'Генерація не вдалася. Повторіть потрібну дію в меню.' };
  }
  const published = channels.some(([field]) => digest[field]);
  if (!published && !reviewed) {
    return { stage: 'review', label: 'Перевірка тексту', action: 'review', next: 'Переглянути текст', hint: 'Перевірте текст перед підготовкою публікації.' };
  }
  if (!digest.facebook_post_id) {
    return digest.image_url || published
      ? { stage: 'ready', label: 'Готовий до публікації', action: 'facebook', next: 'Опублікувати у Facebook', hint: 'Перед надсиланням підтвердьте публікацію.' }
      : { stage: 'ready', label: 'Текст перевірено', action: 'cover', next: 'Створити обкладинку', hint: 'Додайте обкладинку або опублікуйте лише текст через меню.' };
  }
  if ((digest.video_url || digest.reel_url) && !digest.facebook_reel_id) {
    return { stage: 'ready', label: 'Reel готовий до публікації', action: 'reel', next: 'Опублікувати Reel', hint: 'Facebook-пост уже опубліковано. Reel також додається в Stories.' };
  }
  if (digest.youtube_shorts_url && !digest.youtube_post_id) {
    return { stage: 'ready', label: 'Shorts готовий до публікації', action: 'youtube', next: 'Опублікувати на YouTube', hint: 'Facebook-пост уже опубліковано; Shorts ще не надіслано.' };
  }
  return { stage: 'published', label: 'Опубліковано', action: 'review', next: 'Переглянути дайджест', hint: 'Результати — нижче. Додаткові формати доступні в меню.' };
}

// Accepts SQLite "2026-04-12 23:20:03" (UTC, no zone), ISO strings, and plain "2026-04-12" dates.
export function formatDateTime(value, { time = true } = {}) {
  if (!value) return '';
  const raw = String(value).trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`)
    : new Date(raw.includes('T') || /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  const day = `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
  return time ? `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}` : day;
}

export function pluralizeArticles(count) {
  const n = Math.abs(Number(count) || 0);
  const mod10 = n % 10, mod100 = n % 100;
  const word = mod10 === 1 && mod100 !== 11 ? 'стаття'
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'статті' : 'статей';
  return `${n} ${word}`;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function safeUrl(value) {
  const url = String(value || '');
  return /^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url) ? escapeHtml(url) : '';
}

function showStatusStrip(state, context) {
  return state.stage === 'progress'
    || state.label === 'Потрібна увага'
    || Boolean(context.imageJob || context.videoJob);
}

const menuIcons = {
  text: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  video: '<rect x="2" y="4" width="15" height="16" rx="2"/><path d="M17 8l5-3v14l-5-3z"/>',
  shorts: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 9l5 3-5 3z"/>',
  refresh: '<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.1-3.4L23 10M1 14l5.4 4.4A9 9 0 0 0 20.5 15"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
  reel: '<rect x="2" y="2" width="20" height="20" rx="2.5"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 7h5M17 17h5"/>',
  youtube: '<path d="M22.5 6.4a2.8 2.8 0 0 0-2-2C18.9 4 12 4 12 4s-6.9 0-8.5.4a2.8 2.8 0 0 0-2 2A29 29 0 0 0 1 12a29 29 0 0 0 .5 5.6 2.8 2.8 0 0 0 2 2C5.1 20 12 20 12 20s6.9 0 8.5-.4a2.8 2.8 0 0 0 2-2A29 29 0 0 0 23 12a29 29 0 0 0-.5-5.6z"/><polygon points="9.8 15.5 15.5 12 9.8 8.5 9.8 15.5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
};

function menuIcon(name) {
  return `<svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${menuIcons[name] || ''}</svg>`;
}

function menuLabel(iconName, text) {
  return `${menuIcon(iconName)}<span>${text}</span>`;
}

export function renderDigestCard(digest, context = {}) {
  const state = digestWorkflow(digest, context);
  const id = escapeHtml(digest.id);
  const button = (action, label, disabled = false, className = '') =>
    `<button type="button" class="${className}" data-action="${action}" data-id="${id}" ${disabled ? 'disabled' : ''}>${label}</button>`;
  const link = (url, label, className = '') => safeUrl(url)
    ? `<a class="${className}" href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : '';
  const locked = state.stage === 'progress';
  const media = [
    ['image_url', 'обкладинку', 'Обкладинка', 'cover', 'image'],
    [digest.video_url ? 'video_url' : 'reel_url', 'відео', 'Відео', 'video', 'video'],
    ['youtube_shorts_url', 'Shorts', 'Shorts', 'shorts', 'shorts'],
  ].map(([field, viewName, createName, action, iconName]) => digest[field]
    ? link(digest[field], menuLabel('external', `Відкрити ${viewName}`))
      + button(`${action}-regenerate`, menuLabel('refresh', `Оновити ${createName.toLowerCase()}`), locked)
    : button(action, menuLabel(iconName, createName), locked)).join('');
  const publication = channels.filter(([field]) => digest[field]).map(([field, name]) => {
    const label = name;
    let url = '';
    if (field === 'youtube_post_id') url = `https://youtube.com/shorts/${encodeURIComponent(digest[field])}`;
    if (field === 'facebook_post_id') {
      const postId = String(digest[field]);
      url = /^\d+_\d+$/.test(postId) ? `https://www.facebook.com/${postId.replace('_', '/posts/')}`
        : /^\d+$/.test(postId) ? `https://www.facebook.com/${postId}` : postId;
    }
    if (field === 'facebook_reel_id') url = `https://www.facebook.com/reel/${encodeURIComponent(digest[field])}`;
    return link(url, label, 'channel-badge') || `<span class="channel-badge">${label}</span>`;
  }).join('') || '<span class="channel-empty">Не опубліковано</span>';
  const progress = [[context.imageJob, 'image'], [context.videoJob, 'video']].filter(([job]) => job).map(([job, type]) => {
    const value = Math.max(0, Math.min(100, Number(job.progress) || 0));
    return `<div class="video-status${job.status === 'failed' ? ' is-failed' : ''}" data-${type}-job="${escapeHtml(job.jobId)}" data-digest-id="${id}">
      <span class="video-progress-label">${escapeHtml(job.message || 'Підготовка…')} (${value}%)</span>
      <span class="video-progress-track"><span class="video-progress-bar" style="width:${value}%"></span></span></div>`;
  }).join('');
  const title = `Дайджест ${digest.date || `#${digest.seq_number || digest.id}`}${digest.part > 1 ? ` · ч.${digest.part}` : ''}`;
  const created = formatDateTime(digest.created_at);
  const publishedAt = formatDateTime(digest.published_at, { time: false });
  const meta = [
    pluralizeArticles(digest.articles_count),
    digest.cost_usd == null ? '' : `$${Number(digest.cost_usd).toFixed(4)}`,
    created ? `створено ${created}` : '',
    publishedAt ? `опубліковано ${publishedAt}` : '',
  ].filter(Boolean).map(escapeHtml).join(' · ');
  const statusStrip = showStatusStrip(state, context)
    ? `<div class="card-status">${state.stage === 'progress' || state.label === 'Потрібна увага' ? `<p class="next-hint">${state.hint}</p>` : ''}${progress}</div>`
    : '';
  return `<article class="digest-card" data-digest-id="${id}" aria-label="${escapeHtml(title)}">
    <div class="card-main">
      ${safeUrl(digest.image_url) ? link(digest.image_url, `<img src="${safeUrl(digest.image_url)}" alt="Обкладинка дайджесту" loading="lazy">`, 'digest-cover-thumb') : ''}
      <div class="card-title">
        <div class="card-title-row"><h2>${escapeHtml(title)}</h2><span class="workflow-badge stage-${state.stage}">${state.label}</span></div>
        <p class="card-meta">${meta}</p>
        <div class="channel-results" aria-label="Результати публікацій">${publication}</div>
        <div class="digest-stats" data-digest-stats="${id}"><span class="stat-empty">—</span></div>
      </div>
      <div class="card-actions">${state.action === 'articles' ? '<a class="next-action" href="articles.html">Перейти до статей</a>' : button(state.action, state.next, locked, 'next-action')}
        <details class="more-actions" data-id="${id}"><summary aria-label="Інші дії: ${escapeHtml(title)}"><span aria-hidden="true">⋯</span></summary>
          <div class="action-menu" role="menu">
            ${digest.content?.trim() ? `<span class="menu-heading">Текст і медіа</span>${button('review', menuLabel('text', 'Текст'))}${button('copy', menuLabel('copy', 'Копіювати'))}${media}
              <span class="menu-heading">Публікація</span>
              ${!digest.facebook_post_id ? button('facebook', menuLabel('facebook', digest.image_url ? 'Facebook' : 'Facebook (лише текст)'), locked) : ''}
              ${(digest.video_url || digest.reel_url) && !digest.facebook_reel_id ? button('reel', menuLabel('reel', digest.facebook_post_id ? 'Reel + Story' : 'Reel: потрібен Facebook-пост'), locked || !digest.facebook_post_id) : ''}
              ${digest.youtube_shorts_url && !digest.youtube_post_id ? button('youtube', menuLabel('youtube', 'YouTube'), locked) : ''}` : ''}
            ${button('facebook-url', menuLabel('link', 'Facebook URL вручну'), locked)}
            ${button('delete', menuLabel('trash', 'Видалити'), locked, 'danger-action')}
          </div>
        </details>
      </div>
    </div>
    ${statusStrip}
  </article>`;
}
