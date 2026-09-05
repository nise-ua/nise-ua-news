import { digestWorkflow, renderDigestCard, workflowFilters } from './digest-workflow.js';

// Keep workflow rendering separate from the existing API action handlers.
export function createDashboard({ imageJobs, videoJobs, pollImage, pollVideo, loadStats, loadDigests, actions }) {
  let cached = [];
  let selectedFilter = 'all';
  const pending = new Set();
  const reviewed = new Map();
  try {
    for (const [id, text] of Object.entries(JSON.parse(localStorage.getItem('digest-reviewed-text') || '{}'))) reviewed.set(id, text);
  } catch { /* Private browsing/storage limits: keep review in memory. */ }

  function context(digest) {
    return { reviewed: reviewed.get(digest.id) === digest.content, imageJob: imageJobs.get(digest.id), videoJob: videoJobs.get(digest.id), busy: pending.has(digest.id) };
  }

  function showError(message) {
    const error = document.getElementById('list-error');
    error.hidden = !message;
    error.textContent = message;
  }

  function render(digests = cached) {
    cached = digests;
    const list = document.getElementById('tbody');
    const openMenus = new Set([...list.querySelectorAll('details[open]')].map(el => el.dataset.id));
    const focused = list.contains(document.activeElement) ? document.activeElement : null;
    const focusId = focused?.dataset.id || focused?.closest('details')?.dataset.id;
    const focusAction = focused?.dataset.action;
    const states = digests.map(digest => ({ digest, context: context(digest), state: digestWorkflow(digest, context(digest)) }));
    const filters = document.getElementById('workflow-filters');
    if (!filters.children.length) {
      filters.innerHTML = workflowFilters.map(([key, label]) => `<button type="button" data-filter="${key}" aria-pressed="false">${label} <span class="filter-count"></span></button>`).join('');
    }
    for (const button of filters.children) {
      const key = button.dataset.filter;
      button.setAttribute('aria-pressed', String(key === selectedFilter));
      button.querySelector('.filter-count').textContent = key === 'all' ? states.length : states.filter(item => item.state.stage === key).length;
    }
    const visible = states.filter(item => selectedFilter === 'all' || item.state.stage === selectedFilter);
    document.getElementById('subtitle').textContent = `Показано ${visible.length} із ${digests.length} дайджестів`;
    list.innerHTML = visible.length ? visible.map(({ digest, context }) => renderDigestCard(digest, context)).join('')
      : digests.length ? '<div class="empty-state"><h2>На цьому етапі немає дайджестів</h2><p>Оберіть інший етап або перегляньте всі.</p><button class="next-action" data-filter="all">Показати всі</button></div>'
      : '<div class="empty-state"><h2>Перший дайджест ще попереду</h2><p>Додайте статті, щоб підготувати першу публікацію.</p><a class="next-action" href="articles.html">Перейти до статей</a></div>';
    for (const menu of list.querySelectorAll('details')) menu.open = openMenus.has(menu.dataset.id);
    if (focusId) {
      const replacement = [...list.querySelectorAll('[data-action], summary')].find(el =>
        (el.dataset.id || el.closest('details')?.dataset.id) === focusId && el.dataset.action === focusAction);
      replacement?.focus({ preventScroll: true });
    }
    loadStats(visible.map(item => item.digest));
    // A hidden card must not stop polling or prevent a terminal job transition.
    for (const [jobs, poll] of [[videoJobs, pollVideo], [imageJobs, pollImage]]) {
      for (const job of jobs.values()) {
        if (!job.polling) poll(job.jobId).catch(err => {
          console.error('Progress polling failed:', err);
          job.polling = false;
          showError('Не вдалося оновити прогрес. Повторна спроба під час автооновлення.');
        });
      }
    }
  }

  function closeMoreMenus(except = null) {
    for (const menu of document.querySelectorAll('#tbody .more-actions[open]')) {
      if (menu !== except) menu.open = false;
    }
  }

  document.addEventListener('toggle', event => {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement) || !details.classList.contains('more-actions') || !details.open) return;
    closeMoreMenus(details);
  }, true);

  document.addEventListener('click', async event => {
    if (!event.target.closest('.more-actions')) closeMoreMenus();
    const filter = event.target.closest('[data-filter]');
    if (filter) { selectedFilter = filter.dataset.filter; render(); return; }
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    const { id, action } = button.dataset;
    const digest = cached.find(item => item.id === id);
    if (!digest || !actions[action]) return;
    button.closest('details.more-actions')?.removeAttribute('open');
    if (action === 'review' || action === 'copy') return actions[action](digest, button);
    if (pending.has(id)) return;
    pending.add(id);
    button.disabled = true;
    try { await actions[action](digest, button); }
    finally { pending.delete(id); await loadDigests(); }
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const open = document.activeElement?.closest('details[open]') || document.querySelector('#tbody .more-actions[open]');
    if (open) { open.open = false; open.querySelector('summary')?.focus(); }
  });

  return {
    render, showError,
    markReviewed(id, text) {
      reviewed.set(id, text);
      try { localStorage.setItem('digest-reviewed-text', JSON.stringify(Object.fromEntries(reviewed))); }
      catch { showError('Перевірку збережено лише до закриття сторінки: сховище браузера недоступне.'); }
      render();
    },
  };
}