/**
 * Facebook Page video Story publisher.
 * Stories cannot reuse a video already published as a Reel, so this uploads
 * a separate copy. Facebook rejects story videos longer than 60 seconds.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { loadVideoBuffer } from './facebook-video-file.js';
import { finishPageVideoUpload, startPageVideoUpload, uploadPageVideoBytes } from './facebook-video-upload.js';

const execFileAsync = promisify(execFile);
const STORY_MAX_SECONDS = 60;
const STORY_TRIM_SECONDS = 59;

async function probeDurationSeconds(filePath) {
  try {
    const { stdout } = await execFileAsync(ffprobeStatic.path, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const n = parseFloat(String(stdout).trim());
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function trimVideo(inputPath, outputPath, seconds) {
  try {
    await execFileAsync(ffmpegStatic, [
      '-y', '-i', inputPath, '-t', String(seconds), '-c', 'copy', outputPath,
    ]);
  } catch {
    await execFileAsync(ffmpegStatic, [
      '-y', '-i', inputPath, '-t', String(seconds),
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-ac', '2', '-ar', '48000',
      '-movflags', '+faststart',
      outputPath,
    ]);
  }
}

export async function bufferForFacebookStory(videoUrl) {
  const { buffer, localPath } = await loadVideoBuffer(videoUrl);
  const workDir = mkdtempSync(join(tmpdir(), 'fb-story-'));
  try {
    const sourcePath = localPath || join(workDir, 'source.mp4');
    if (!localPath) writeFileSync(sourcePath, buffer);

    const duration = await probeDurationSeconds(sourcePath);
    if (!duration || duration <= STORY_MAX_SECONDS) {
      return localPath ? buffer : readFileSync(sourcePath);
    }

    const trimmedPath = join(workDir, 'story.mp4');
    await trimVideo(sourcePath, trimmedPath, STORY_TRIM_SECONDS);
    return readFileSync(trimmedPath);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

export async function publishStoryToFacebook(pageAccessToken, pageId, videoUrl) {
  if (!pageAccessToken || !pageId) {
    const errMsg = '[facebook-story] Missing pageAccessToken or pageId';
    console.error(errMsg);
    return { error: errMsg };
  }

  if (!videoUrl) {
    const errMsg = '[facebook-story] Missing videoUrl';
    console.error(errMsg);
    return { error: errMsg };
  }

  try {
    const videoBuffer = await bufferForFacebookStory(videoUrl);
    const { videoId, uploadUrl } = await startPageVideoUpload({
      pageAccessToken,
      pageId,
      edge: 'video_stories',
    });

    await uploadPageVideoBytes({ pageAccessToken, uploadUrl, videoBuffer });

    const finishData = await finishPageVideoUpload({
      pageAccessToken,
      pageId,
      edge: 'video_stories',
      videoId,
    });

    return {
      storyId: finishData.post_id || finishData.id || videoId,
      videoId,
      success: finishData.success !== false,
    };
  } catch (err) {
    const errorMessage = `[facebook-story] ${err.message}`;
    console.error(errorMessage);
    return { error: errorMessage };
  }
}
