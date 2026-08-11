import { publishImageToFacebook } from './src/services/publishers/facebook-image.js';
import { publishVideoToFacebook } from './src/services/publishers/facebook-video.js';
import { config as dotenvConfig } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: join(__dirname, '.env') });

const PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const PAGE_ID = process.env.FACEBOOK_PAGE_ID;

// Use simpler placeholder images/videos that Facebook API definitely accepts
const TEST_IMAGE_URL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Image_created_with_a_mobile_phone.png/1200px-Image_created_with_a_mobile_phone.png';
const TEST_VIDEO_URL = 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'; 

async function testPublishers() {
  console.log('🚀 Starting Facebook Rich Media Publisher tests...');

  if (!PAGE_ACCESS_TOKEN || !PAGE_ID) {
    console.error('❌ Error: FACEBOOK_PAGE_ACCESS_TOKEN or FACEBOOK_PAGE_ID missing in .env');
    process.exit(1);
  }

  // 1. Test Image Publisher
  console.log('\n--- Test 1: Image Publisher ---');
  console.log(`Publishing image: ${TEST_IMAGE_URL}`);
  const imageResult = await publishImageToFacebook(
    PAGE_ACCESS_TOKEN,
    PAGE_ID,
    TEST_IMAGE_URL,
    'Test Image Post from news-digest-pipeline #AI #News'
  );
  
  if (imageResult.error) {
    console.error('❌ Image Test Failed:', imageResult.error);
  } else {
    console.log('✅ Image Test Success!');
    console.log('Post ID:', imageResult.postId);
  }

  // 2. Test Video Publisher
  console.log('\n--- Test 2: Video Publisher ---');
  console.log(`Publishing video: ${TEST_VIDEO_URL}`);
  const videoResult = await publishVideoToFacebook(
    PAGE_ACCESS_TOKEN,
    PAGE_ID,
    TEST_VIDEO_URL,
    'Test Video/Reel Post from news-digest-pipeline #AI #Reels'
  );

  if (videoResult.error) {
    console.error('❌ Video Test Failed:', videoResult.error);
  } else {
    console.log('✅ Video Test Success!');
    console.log('Video ID:', videoResult.videoId);
  }
}

testPublishers().catch(console.error);
