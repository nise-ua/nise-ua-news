# Distribution Pipeline — Multi-platform Distribution

**Input:** Prepared media assets (text, images, video, audio)  
**Output:** Published to various platforms

## Architecture

```mermaid
flowchart TD
    A[📦 Prepared assets<br/>text + images + video + audio] --> B{Distribution}
    
    subgraph working["✅ Functional"]
        B --> T[📱 Telegram<br/>Bot API<br/>auto-splitting >4096]
        B --> FP[📄 Facebook Page<br/>Graph API<br/>Page Access Token]
        B --> FA[👤 Facebook Profile<br/>Patchright<br/>separate Chromium]
    end
    
    subgraph testing["🧪 Testing"]
        B --> IG[📸 Instagram<br/>Graph API + images]
    end
    
    subgraph planned["📋 Planned"]
        B --> YT[🎬 YouTube<br/>Shorts / Community]
        B --> TT[🎵 TikTok<br/>Video upload]
    end

    style A fill:#e3f2fd
    style working fill:#e8f5e9,stroke:#4caf50
    style testing fill:#fff8e1,stroke:#ffc107
    style planned fill:#f3e5f5,stroke:#9c27b0
```

## Distribution Channels

| Channel | Method | Content Type | Status |
|-------|-------|-------------|--------|
| **Telegram** | Bot API | Text | ✅ Functional |
| **Facebook Page** | Graph API | Text | ✅ Functional |
| **Facebook Profile** | Patchright | Text | 🧪 Testing |
| **Instagram** | Graph API / Patchright | Image + Text | 📋 Planned |
| **YouTube** | Patchright | Video / Community | 📋 Planned |
| **TikTok** | API / Patchright | Video | 📋 Planned |

## Publication Sequence

```mermaid
sequenceDiagram
    participant U as 👤 User
    participant D as 📊 Dashboard
    participant S as 🖥️ VPS Server
    participant M as 💻 Mac (Local)
    
    U->>D: Clicks "Publish"
    D->>S: POST /api/digests/:id/publish
    
    par Instant (API)
        S->>S: Telegram → Channel
        S->>S: Facebook → Page
    end
    
    S-->>D: {telegram: ✅, facebook: ✅}
    
    Note over M: After 2-5 min (Watcher)
    M->>M: Patchright → Facebook Profile
    M-->>U: 🔔 Published to FB Profile
    
    Note over M: Next
    M->>M: Instagram → Image + Caption
    M-->>U: 🔔 Published to Instagram
```

## Structure

```
distribution/
├── README.md               # This file
├── telegram/
│   ├── telegram.js          # Publisher: Bot API + message splitting
│   └── telegram-setup.md    # Setup documentation
├── facebook-page/
│   ├── facebook.js          # Publisher: Graph API
│   └── facebook-page-setup.md
├── facebook-profile/
│   ├── fb-publish.js        # Patchright automation
│   ├── fb-profile-watcher.js # Automatic watcher (launchd)
│   └── facebook-setup.md    # Documentation
├── instagram/               # TODO
│   └── README.md
├── youtube/                 # TODO
│   └── README.md
└── tiktok/                  # TODO
    └── README.md
```

## Environment Variables

```env
# Telegram
TELEGRAM_BOT_TOKEN=...
TELEGRAM_PUBLISH_CHAT_ID=-100...  # Channel (with -100 prefix)

# Facebook Page
FACEBOOK_PAGE_ID=YOUR_FACEBOOK_PAGE_ID
FACEBOOK_PAGE_ACCESS_TOKEN=...    # Page token (not User token!)

# Facebook Profile
# Session stored in .fb-profile/ (Patchright persistent context)

# Instagram (TODO)
INSTAGRAM_BUSINESS_ACCOUNT_ID=...
```
