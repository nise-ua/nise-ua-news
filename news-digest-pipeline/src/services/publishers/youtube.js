import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getYouTubeOAuth2Client() {
  const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN } = process.env;

  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET || !YOUTUBE_REFRESH_TOKEN) {
    throw new Error('Missing YouTube OAuth2 credentials in .env. Please configure YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REFRESH_TOKEN.');
  }

  const oauth2Client = new google.auth.OAuth2(
    YOUTUBE_CLIENT_ID,
    YOUTUBE_CLIENT_SECRET,
    // Redirect URI is not strictly needed for refresh token flow, but often required by API console
    'http://localhost:3000/oauth2callback'
  );

  oauth2Client.setCredentials({
    refresh_token: YOUTUBE_REFRESH_TOKEN,
  });

  return oauth2Client;
}

export async function publishToYouTube(youtubeShortsPath, title, description, privacyStatus = 'unlisted') {
  if (!youtubeShortsPath) {
    throw new Error('No YouTube Shorts file path provided for publishing.');
  }

  const oauth2Client = getYouTubeOAuth2Client();
  const youtube = google.youtube({
    version: 'v3',
    auth: oauth2Client,
  });

  const fileSize = readFileSync(youtubeShortsPath).length;
  console.log(`Uploading ${youtubeShortsPath} (${fileSize} bytes) to YouTube...`);

  try {
    const res = await youtube.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title: title,
          description: description,
          categoryId: '25', // News & Politics
        },
        status: {
          privacyStatus: privacyStatus,
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: readFileSync(youtubeShortsPath),
      },
    }, {
      // This is important for resumable uploads, but the current API for simple
      // uploads using `media.body` doesn't directly support the `onUploadProgress`
      // callback for resumable streams without more advanced setup.
      // For now, we'll assume direct upload of smaller files.
      // A more robust solution for large files would involve `createReadStream`
      // and managing chunks.
    });

    const videoId = res.data.id;
    const videoUrl = `https://youtube.com/shorts/${videoId}`;
    console.log(`Successfully uploaded YouTube Short: ${videoUrl}`);
    return { videoId, url: videoUrl };
  } catch (error) {
    console.error('Error uploading to YouTube:', error.message);
    if (error.code === 401 || error.code === 403) {
      console.error('Authentication error. Please ensure your YouTube OAuth2 refresh token is valid and has the correct scopes.');
    }
    throw error;
  }
}
