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

export function renderDigestCard(digest, context = {}) {
  const state = digestWorkflow(digest, context);
  const id = escapeHtml(digest.id);
  const button = (action, label, disabled = false, className = '') =>
    `<button type="button" class="${className}" data-action="${action}" data-id="${id}" ${disabled ? 'disabled' : ''}>${label}</button>`;
  const link = (url, label, className = '') => safeUrl(url)
    ? `<a class="${className}" href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : '';
  const locked = state.stage === 'progress';
  const media = [
    ['image_url', 'обкладинку', 'Обкладинка', 'cover'],
    [digest.video_url ? 'video_url' : 'reel_url', 'відео', 'Відео', 'video'],
    ['youtube_shorts_url', 'Shorts', 'Shorts', 'shorts'],
  ].map(([field, viewName, createName, action]) => digest[field]
    ? link(digest[field], `Відкрити ${viewName}`) + button(`${action}-regenerate`, `Оновити ${createName.toLowerCase()}`, locked)
    : button(action, createName, locked)).join('');
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
            ${digest.content?.trim() ? `<span class="menu-heading">Текст і медіа</span>${button('review', 'Текст')}${button('copy', 'Копіювати')}${media}
              <span class="menu-heading">Публікація</span>
              ${!digest.facebook_post_id ? button('facebook', digest.image_url ? 'Facebook' : 'Facebook (лише текст)', locked) : ''}
              ${(digest.video_url || digest.reel_url) && !digest.facebook_reel_id ? button('reel', digest.facebook_post_id ? 'Reel + Story' : 'Reel: потрібен Facebook-пост', locked || !digest.facebook_post_id) : ''}
              ${digest.youtube_shorts_url && !digest.youtube_post_id ? button('youtube', 'YouTube', locked) : ''}` : ''}
            ${button('facebook-url', 'Facebook URL вручну', locked)}
            ${button('delete', 'Видалити', locked, 'danger-action')}
          </div>
        </details>
      </div>
    </div>
    ${statusStrip}
  </article>`;
}
