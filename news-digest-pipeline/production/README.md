# Media Production Pipeline

**Input:** Digest text  
**Output:** Ready media assets (images, video, audio)

## Architecture

```mermaid
flowchart TD
    A[📰 Digest Text] --> B[🤖 Claude API]
    
    B --> C1[📝 Clickbait Headline<br/>+ Image Prompt]
    B --> C2[📋 Video Script<br/>JSON: shots × 5-15 sec]
    B --> C3[📝 Adapted Text<br/>for Voice-over]
    
    subgraph Image["🖼 Image Production"]
        C1 --> I1[🎨 Template Reference]
        I1 --> I2[Recraft V3 / fal.ai<br/>img2img → background]
        I2 --> I3[Sharp / Canvas<br/>text overlay]
        I3 --> I4[📸 image.png<br/>1080×1350]
    end
    
    subgraph Video["🎬 Video Production"]
        C2 --> V1[🎨 Style Element]
        V1 --> V2[Kling 3.0 / Veo 3.1<br/>parallel generation]
        V2 --> V3[FFmpeg concat<br/>+ resize 1080×1920]
        V3 --> V4[📱 reel.mp4]
    end
    
    subgraph Audio["🎙 Audio Production"]
        C3 --> A1[🎙 Voice Clone ID]
        A1 --> A2[ElevenLabs / Fish Audio<br/>TTS generation]
        A2 --> A3[🔊 voiceover.mp3]
    end
    
    A3 --> V3
    
    I4 --> OUT[📦 Ready Assets]
    V4 --> OUT
    A3 --> OUT
    
    style A fill:#e3f2fd
    style OUT fill:#c8e6c9
    style Image fill:#fff8e1,stroke:#ffc107
    style Video fill:#e8eaf6,stroke:#3f51b5
    style Audio fill:#fce4ec,stroke:#e91e63
```

## Components

| Component | Service | Price/unit | Status |
|-----------|--------|---------|--------|
| **Image** | Recraft V3 (fal.ai) | $0.04/img | 📋 Research |
| **Video** | Kling 3.0 (EvoLink) | $0.075/sec | 📋 Research |
| **Audio** | ElevenLabs Flash v2.5 | $22/mo plan | 📋 Research |

## Structure

```
production/
├── README.md           # This file
├── image/
│   ├── README.md       # Image pipeline architecture
│   ├── research-image-apis.md
│   ├── templates/      # Template references
│   ├── fonts/          # Fonts for text
│   ├── output/         # Ready images
│   └── src/            # Generation scripts
├── video/
│   ├── README.md       # Video pipeline architecture
│   ├── research-video-apis.md
│   ├── templates/      # Style references
│   ├── output/         # Ready videos
│   └── src/            # Generation scripts
└── audio/
    ├── README.md       # Audio pipeline architecture
    ├── research-tts-apis.md
    ├── voice-samples/  # Samples for cloning
    └── src/            # Generation scripts
```
