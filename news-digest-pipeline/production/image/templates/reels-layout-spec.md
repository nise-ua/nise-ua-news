# Technical Description: Facebook & Instagram Reels Layout Template for News Blocks

This document provides a highly structured technical template specification derived from Facebook Reels and Instagram Reels official safe-zone properties (combining dynamic mobile viewport UI elements and metadata overlaps), modeled as a standardized template for programmatic media generation engines (e.g., using Puppeteer, Canvas, Sharp, or SVG) to render individual news frames.

---

## 1. Platform Requirements: FB/IG Reels Safe Zones

On Facebook and Instagram Reels, parts of the vertical screen are covered by the platform's persistent user interface overlay. Any critical information (headlines, bullet points, visual focus, logos) placed in these zones is obscured, ruined, or hard to read.

### Safe Zone Specifications
*   **Aspect Ratio:** 9:16 (Standard vertical video)
*   **Target Base Resolution:** 1080 × 1920 pixels
*   **X-Axis Safe Margin:** Left: `80px`, Right: `180px` (Due to right-hand action icons overlay on FB/IG)
*   **Y-Axis Top Safe Boundary:** Avoid placing elements within `0px – 220px` from the top (Reserved for page navigation/status bar/header banners).
*   **Y-Axis Bottom Safe Boundary:** Avoid placing critical text below `1620px` (Reserved for the account name, description text, expanding "more..." button, music/audio track, and platform comments section).

### Geometric Layout Grid

```
0px   +---------------------------------------+  <-- Top of Screen
      | [STRICT TOP EXCLUSION ZONE] (0-220px)  |  -- App header / Status bar / Navigation UI
220px | - - - - - - - - - - - - - - - - - - - |  
      | [BRANDING / CATEGORY HEADER ZONE]     |  -- Small Category tag or Brand Logo (Centered, 220px-320px)
320px | - - - - - - - - - - - - - - - - - - - |
      |                                   [R] |  <-- Right Side Exclusion Column (from X = 900px to 1080px)
      | [MAIN VISUAL CONTENT FOCUS ZONE]  [I] |  -- Best region for central visuals, key graphics,
      |                                   [G] |     or photo elements (unobstructed).
      |                                   [H] |  
      |                                   [T] |  <-- Right Side Area is covered by FB/IG Action Buttons
1120px| - - - - - - - - - - - - - - - - - [ ] |      (Like, Comment, Share, Audio Disc, Remix icons).
      | [DEDICATED CONTRAST PLASHKA ZONE] [U] |  
      |                                   [I] |  -- Safe plashka text region: Y = 1120px to 1620px.
1620px| - - - - - - - - - - - - - - - - - - - |      Strict X bounds: 80px to 900px (Width: 820px).
      | [STRICT BOTTOM EXCLUSION ZONE]        |  -- Profile Icon, Handle (@username), caption text, 
1920px+---------------------------------------+  <-- Bottom of Screen
```

---

## 2. Text Box ("Plashka") Specifications (Asymmetric for FB Reels UI)

To guarantee text readability on arbitrary animated or static photographic backgrounds, text is wrapped inside an off-center, semi-transparent overlay card ("Plashka") that is shifted leftward to clear FB/IG right-hand action icons.

*   **Y-Axis Placement:** Begins at `Y = 1120px`, ends at `Y = 1620px` (Max Height: `500px`).
*   **X-Axis Placement & Width:** Left position: `80px`. Right position: `900px` (Total Width: `820px`). Centering is avoided to prevent text from sliding under the right UI column of Reels.
*   **Border Radius:** `20px` (rounded corners).
*   **Background Fill:** High contrast semi-transparent dark overlay:
    *   **Color:** `#141517` (Rich dark charcoal)
    *   **Opacity:** `85%` (`rgba(20, 21, 23, 0.85)`)
*   **Inner Padding:** `40px` top/bottom, `45px` left/right.
*   **Backdrop Blur:** `20px` Gaussian blur (`backdrop-filter: blur(20px)`).

---

## 3. Typography & Information Hierarchy

Fonts must belong to highly legible, modern geometric sans-serif families (e.g., *Montserrat, Inter, Arial, Helvetica*).

### A. Brand/Category Indicator (Top Header - Outside of Plashka)
*   **Position:** Top of the screen, horizontally centered (`X = 540px`) at `Y = 280px`.
*   **Font Size:** `26px`
*   **Font Weight:** Bold / Heavy (`700` or `900`)
*   **Text Transform:** Uppercase
*   **Color:** White (`#FFFFFF`) or Accent Color (`#E41E48` - Crimson Red)
*   **Letter Spacing:** `4px` (tracking)

### B. Headline (Within Plashka - Primary Title)
*   **Position:** Top-aligned inside the asymmetric Plashka.
*   **Font Size:** `40px` to `44px` (Dynamic scaling based on length).
*   **Font Weight:** Black (`900`) or Ultra-Bold.
*   **Line Height:** `1.25`
*   **Color:** Pure White (`#FFFFFF`).
*   **Maximum Lines:** 2 lines. Wraps dynamically using non-breaking spaces for numerical values (e.g., `100\u00A0млн`).

### C. Bullet Points / Secondary Content (Within Plashka)
*   **Position:** Below the horizontal separator line inside the Plashka.
*   **Font Size:** `22px` to `24px`.
*   **Font Weight:** Medium (`500`).
*   **Line Height:** `1.4`.
*   **Color:** Off-white (`rgba(255, 255, 255, 0.95)`).
*   **List Style Prefix:** Visual prefix marker `→` (with increased tracking after the arrow) or numeric indexes `01.`, `02.`, `03.`.
*   **Line Limit:** Maximum 3 bullet points, 1 line per bullet point.

### D. Author Tag / Watermark (Within Plashka - Bottom Right)
*   **Position:** Bottom-right corner of Plashka (`X = 775px`, `Y = 450px` relative to Plashka).
*   **Font Size:** `18px`
*   **Font Weight:** Bold (`700`)
*   **Color:** Soft white-grey (`rgba(255, 255, 255, 0.5)`)
*   **Text Prefix:** `@` (e.g. `@your_brand`)

---

## 4. Visual Elements & Color Palette

### Color Scheme
*   **Base Dark:** `#141517` (Plashka Background)
*   **Text Primary:** `#FFFFFF` (Headline)
*   **Text Secondary:** `#EEEEEE` (Bullets)
*   **Accent Color:** `#E41E48` (Vibrant Crimson Red) — used sparingly for high-interest keywords, numeric callouts, or the brand logo to command attention.
*   **Separator Line:** Underneath the headline, a 1px solid horizontal separator with `rgba(255,255,255,0.15)` opacity spanning the full width of the text container padding.

---

## 5. Technical Implementation Blueprint (SVG Reference)

For automatic rendering pipelines (using engines like Node.js + Sharp), the layout can be dynamically described and overlayed using the following SVG template specification:

```xml
<svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
  <!-- 1. Background Image Placeholder -->
  <rect width="1080" height="1920" fill="#1C1D21"/>
  
  <!-- 2. Brand Category Header (Centered in top safe area) -->
  <text x="540" y="280" 
        font-family="'Montserrat', sans-serif" 
        font-size="26" 
        font-weight="900" 
        fill="#E41E48" 
        letter-spacing="4" 
        text-anchor="middle">НОВИНИ</text>

  <!-- 3. Safe Zone Text Card (Asymmetric Plashka Shifted Left) -->
  <g transform="translate(80, 1120)">
    <!-- Asymmetric Card Background (X-width = 820px, clearing right-side icons) -->
    <rect width="820" height="500" rx="20" fill="#141517" opacity="0.85"/>
    
    <!-- Headline Text -->
    <text x="45" y="75" 
          font-family="'Montserrat', sans-serif" 
          font-size="42" 
          font-weight="900" 
          fill="#FFFFFF" 
          width="730">ЩОДЕННИЙ ДАЙДЖЕСТ НОВИН</text>
          
    <!-- Decorative Accent Separator -->
    <line x1="45" y1="125" x2="775" y2="125" stroke="rgba(255, 255, 255, 0.15)" stroke-width="2"/>
    
    <!-- Bullet Point 1 -->
    <text x="45" y="195" 
          font-family="'Inter', sans-serif" 
          font-size="24" 
          font-weight="500" 
          fill="rgba(255, 255, 255, 0.95)">
      <tspan fill="#E41E48" font-weight="900">→ </tspan> ШІ успішно адаптується до створення коротких Reels відео
    </text>

    <!-- Bullet Point 2 -->
    <text x="45" y="255" 
          font-family="'Inter', sans-serif" 
          font-size="24" 
          font-weight="500" 
          fill="rgba(255, 255, 255, 0.95)">
      <tspan fill="#E41E48" font-weight="900">→ </tspan> Автоматизація дозволяє генерувати шаблони за 1 клік
    </text>

    <!-- Bullet Point 3 -->
    <text x="45" y="315" 
          font-family="'Inter', sans-serif" 
          font-size="24" 
          font-weight="500" 
          fill="rgba(255, 255, 255, 0.95)">
      <tspan fill="#E41E48" font-weight="900">→ </tspan> Платформа Sharp та SVG забезпечують максимальну швидкість
    </text>
    
    <!-- Author Watermark (Safely inside the card) -->
    <text x="775" y="450" 
          font-family="'Inter', sans-serif" 
          font-size="18" 
          font-weight="700" 
          fill="rgba(255, 255, 255, 0.45)" 
          text-anchor="end">@your_brand</text>
  </g>
</svg>
```

---

## 6. Execution & Safety Rules for Generation Scripts
1.  **Strict Avoidance of FB/IG UI Collision:** Never extend the Plashka width past `900px` on the X-axis (from left border `0px`) or push the Plashka below `Y = 1620px` on the Y-axis. This ensures perfect clearance of the floating interaction panel (Like, Comment, Share, Music Icon) on Facebook and Instagram mobile apps.
2.  **Luminance Contrast:** Background images must undergo a 30% brightness reduction overlay (`fill="black" opacity="0.3"`) behind the main asset area if they compete with text readability.
3.  **Automatic Scaling:** If the headline length exceeds 60 characters, the headline font-size must auto-scale down to `34px` to avoid text clipping.
