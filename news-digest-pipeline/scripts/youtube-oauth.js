import { google } from 'googleapis';
import { createServer } from 'http';
import { parse } from 'url';
import { StringDecoder } from 'string_decoder';
import { config as dotenvConfig } from 'dotenv';
import { join } from 'path';

dotenvConfig({ path: join(process.cwd(), '.env'), override: true });

const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET } = process.env;

if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET) {
  console.error('Error: YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET must be set in your .env file.');
  process.exit(1);
}

const redirectUri = 'http://localhost:3000/oauth2callback';

const oauth2Client = new google.auth.OAuth2(
  YOUTUBE_CLIENT_ID,
  YOUTUBE_CLIENT_SECRET,
  redirectUri
);

const scopes = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
];

const authorizationUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: scopes,
});

console.log('Please visit this URL to authorize your application:');
console.log(authorizationUrl);

const server = createServer(async (req, res) => {
  const parsedUrl = parse(req.url, true);

  if (parsedUrl.pathname === '/oauth2callback') {
    const code = parsedUrl.query.code;
    if (code) {
      try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        console.log('Authentication successful!');
        console.log('Refresh Token: ', tokens.refresh_token);
        console.log('Please add this to your .env file:');
        console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`);

        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Authentication successful! You can close this window now. Check your console for the refresh token.');
        server.close();
      } catch (error) {
        console.error('Error getting tokens:', error.message);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Authentication failed.');
        server.close();
      }
    } else {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('No code provided.');
      server.close();
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(3000, () => {
  console.log('OAuth2 callback server listening on port 3000');
});
