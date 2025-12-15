# YouTube Video Analyzer 🎬

An AI-powered YouTube video analyzer that uses Claude to answer questions about any YouTube video.

## How it works

1. You provide a YouTube URL and a question
2. The app fetches the video transcript
3. Claude analyzes the transcript and answers your question
4. Results displayed with video thumbnail and metadata

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env and add your ANTHROPIC_API_KEY
   ```

3. **Run locally**
   ```bash
   npm run dev
   ```

4. Open http://localhost:3000

## Deploy to Vercel

1. Push to GitHub
2. Import to Vercel
3. Add environment variable: `ANTHROPIC_API_KEY`
4. Deploy

## Tech Stack

- **Claude** (Anthropic) - AI analysis
- **youtube-transcript** - Transcript extraction
- **Express** - Web server
- **TypeScript** - Type safety

## Notes

- Videos must have captions/subtitles enabled
- Long videos are automatically truncated to fit Claude's context

---

Built by Samson 🚀
