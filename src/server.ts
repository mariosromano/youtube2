// @ts-nocheck
import express from 'express';
import cors from 'cors';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';

const app = express();
const PORT = process.env.PORT || 3000;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Extract video ID from YouTube URL
function getVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Fetch transcript directly from YouTube's timedtext API
async function fetchTranscript(videoId) {
  try {
    // First, get the video page to find caption tracks
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await fetch(watchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    
    const html = await response.text();
    
    // Find captions URL in the page
    const captionMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
    if (!captionMatch) {
      throw new Error('No captions found');
    }
    
    const captionTracks = JSON.parse(captionMatch[1]);
    if (!captionTracks || captionTracks.length === 0) {
      throw new Error('No caption tracks available');
    }
    
    // Prefer English, fall back to first available
    let captionUrl = captionTracks[0].baseUrl;
    for (const track of captionTracks) {
      if (track.languageCode === 'en' || track.vssId?.includes('en')) {
        captionUrl = track.baseUrl;
        break;
      }
    }
    
    // Fetch the captions
    const captionResponse = await fetch(captionUrl);
    const captionXml = await captionResponse.text();
    
    // Parse XML to extract text
    const textMatches = captionXml.matchAll(/<text[^>]*>(.*?)<\/text>/gs);
    const texts = [];
    for (const match of textMatches) {
      // Decode HTML entities
      let text = match[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n/g, ' ');
      texts.push(text);
    }
    
    return texts.join(' ');
  } catch (error) {
    console.error('Transcript fetch error:', error);
    throw error;
  }
}

// Main analyze endpoint
app.post('/api/analyze', async (req, res) => {
  try {
    const { input } = req.body;

    if (!input) {
      return res.status(400).json({ error: 'Input is required' });
    }

    // Parse URL and question from input
    const urlMatch = input.match(/(https?:\/\/[^\s]+)/);
    const url = urlMatch ? urlMatch[1] : '';
    const question = input.replace(url, '').trim() || 'What is this video about?';

    const videoId = getVideoId(url);
    if (!videoId) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    console.log(`Analyzing video: ${videoId}`);
    console.log(`Question: ${question}`);

    // Get transcript
    let transcript;
    try {
      transcript = await fetchTranscript(videoId);
      if (!transcript || transcript.trim().length === 0) {
        throw new Error('Empty transcript');
      }
    } catch (err) {
      console.error('Transcript error:', err.message);
      return res.status(400).json({ 
        error: 'Could not get transcript. The video may not have captions, or they may be disabled.' 
      });
    }

    console.log(`Transcript length: ${transcript.length} characters`);

    // Truncate if too long
    const maxChars = 100000;
    if (transcript.length > maxChars) {
      transcript = transcript.substring(0, maxChars) + '... [transcript truncated]';
    }

    // Ask Claude
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Here is a transcript from a YouTube video:

<transcript>
${transcript}
</transcript>

Based on this transcript, please answer the following question:

${question}

Provide a clear, helpful answer based only on what's in the transcript.`
        }
      ]
    });

    // Extract text from response
    const responseText = message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    // Get video metadata via oEmbed
    let videoTitle = 'YouTube Video';
    let thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    
    try {
      const oembedRes = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
      );
      if (oembedRes.ok) {
        const oembed = await oembedRes.json();
        videoTitle = oembed.title || videoTitle;
        thumbnailUrl = oembed.thumbnail_url || thumbnailUrl;
      }
    } catch (err) {
      // Use defaults
    }

    res.json({
      analysis: responseText,
      video: {
        title: videoTitle,
        thumbnailUrl: thumbnailUrl,
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
        duration: 'N/A'
      }
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      error: 'Failed to analyze video',
      message: error.message 
    });
  }
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 YouTube Analyzer running at http://localhost:${PORT}`);
});
