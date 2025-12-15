// @ts-nocheck
import express from 'express';
import cors from 'cors';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { YoutubeTranscript } from 'youtube-transcript';

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
      const transcriptData = await YoutubeTranscript.fetchTranscript(videoId);
      transcript = transcriptData.map(item => item.text).join(' ');
    } catch (err) {
      return res.status(400).json({ 
        error: 'Could not get transcript. Make sure the video has captions enabled.' 
      });
    }

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
