/**
 * Which digest columns to write after a reel/Shorts generate job.
 * Facebook and YouTube cuts must not overwrite each other.
 */
export function digestVideoUpdateFields(format, { videoUrl, reelUrl } = {}) {
  if (format === 'shorts') {
    return { youtube_shorts_url: videoUrl };
  }
  const fields = {};
  if (videoUrl) fields.video_url = videoUrl;
  if (reelUrl) fields.reel_url = reelUrl;
  return fields;
}
