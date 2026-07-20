export async function notify(topic, { title, message, priority = 'default', tags = '' }) {
  if (!topic) return null;

  try {
    const response = await fetch(`https://ntfy.sh/${topic}`, {
      method: 'POST',
      headers: {
        'Title': title || 'News Digest',
        'Priority': priority,
        ...(tags ? { 'Tags': tags } : {}),
      },
      body: message || '',
    });

    return response;
  } catch (err) {
    console.error('[notifier] Error sending notification:', err.message);
    return null;
  }
}

export async function notifyDigestReady(topic, digest) {
  return notify(topic, {
    title: `Digest Ready: ${digest.date || 'new'}`,
    message: `Digest with ${digest.articles_count} articles is ready for review.`,
    priority: 'default',
    tags: 'newspaper',
  });
}
