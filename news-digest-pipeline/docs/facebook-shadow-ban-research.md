# Facebook Silent Post Removal & Shadow Restriction: Full 2025–2026 Research

## Quick Summary

A verified Facebook account with 27K followers, whose posts are instantly removed without notification despite a clean Account Quality, has likely triggered an **automated spam filter**. This mechanism is fundamentally different from the official strike system: it operates outside the official strike framework, is not reflected in Account Quality, and sends no user notifications. This behavior is particularly common for accounts showing signs of automation or unusual activity patterns. Critical: repeated posting attempts in this state will worsen the situation.

### Symptom: "Couldn't Load Post" for another user

When the **author** (or Page admin) can see a fresh post, but **another account** opening the same post — including via a share notification like *"X shared Nise-ua's post"* — gets:

> **Couldn't Load Post**  
> This post may have expired, or it may only be visible to an audience you're not in.

…that is the same silent-restriction pattern, not a client bug. The notification can still fire for the sharer while the underlying object is already blocked for third parties.

Common pipeline triggers that make this worse:
- Prefixing captions with automation language (e.g. `Published by AI …`)
- Rapid publish/delete or republish loops while testing Reels/Stories
- Browser automation (Patchright) sessions that look unlike normal human use

After each Page text publish, the pipeline runs `checkFacebookPostVisibility` (`facebook-visibility.js`) and logs a warning if Graph reports `is_hidden`, non-public `privacy`, or `is_published=false`. Graph **cannot fully prove** third-party reach — so an all-clear log does not rule out a silent spam filter. Always confirm once from a second account.

**Nise-ua finding (Aug 2026):** Graph `/feed` text posts from app `news` are invisible to followers (object may later return `#10`). The same digest posted in the Page composer is visible. Reels from the same app still work. Page text publishing therefore uses Patchright as the Page (`facebook-page-browser.js`), not `/feed`.

***

## 1. Meta Official Documentation: Does Silent Removal Exist?

### Public "Remove, Reduce, Inform" Policy

Meta officially adheres to a three-tier content moderation strategy:
- **Remove**: Deleting content that violates Community Standards.
- **Reduce**: Quietly lowering the reach of borderline content without deletion.
- **Inform**: Adding warning labels.

Officially, Meta **does not use the term "shadow ban"** and claims to always notify users of content removal. However, a second, less transparent mechanism exists in reality.

### Spam Filter: Documented but Opaque

Facebook has a separate rate-limiting and spam detection system that acts **parallel** to the strike system. The official Meta Help Center description states:

> *"We have limits in place to prevent abuse. These limits are based on various factors, such as the speed and quantity of actions. We cannot provide further details about the rate limits that are applied."*

Key point: these specific limits trigger **silent post removal** — posts are created, shown to the user, but immediately disappear (the system logs them as "potential spam"). Account Quality remains clean because this is a behavioral restriction, not a Community Standards strike.

In the first half of 2025, Meta took action against **500,000 accounts** for spam-like behavior (reach reduction, distribution limits) and removed 10 million profiles impersonating major creators.

***

## 2. Types of Restrictions: Four Different Mechanisms

| Type | Notification | Visible in Account Quality | Duration | Appeal |
|-----|------------|------------------------|------|-----------|
| **Community Standards Strike** | Yes — specific notification | Yes — strike history | 1st strike: warning; 7+ strikes: 1–30 day block | Yes, via standard process |
| **Spam Filter / Automated Rate Limit** | No | No (or just "Post Has Been Removed") | Hours to days, up to 3–7 days | Limited, via Support Inbox |
| **Shadow Ban / Reduced Distribution** | No | No | Weeks to months | No direct mechanism |
| **Account Compromise Detection** | Sometimes (suspicious activity) | Sometimes | Until verified | Identity verification |

### Official Strike System (Community Standards)

According to official Meta documentation (November 2024 update):
- **1 strike**: Warning, no restrictions.
- **2–6 strikes**: Restriction of specific features (e.g., group posting).
- **7 strikes**: 1-day content creation block.
- **8 strikes**: 3-day block.
- **9 strikes**: 7-day block.
- **10+ strikes**: 30-day block.

Meta is **required to notify the user** of Community Standards violations. Silence combined with post removal indicates an automated spam filter or behavioral restriction.

***

## 3. Known Causes of Silent Post Removal

### Automation Detection
Meta's bot detection systems evolved significantly in 2024–2025:
- **Playwright/Puppeteer/Selenium**: Detected by specific browser properties, DOM interaction patterns, and lack of natural mouse movements.
- **Headless Browsers**: Instantly raise red flags.
- **Digital Fingerprinting**: Analysis of Canvas, WebGL, Audio Context, and dozens of other parameters.
- **New Sessions**: Fresh sessions without cookies or history look suspicious.

### Behavioral Patterns
- **Rapid publish/delete cycles**: The most likely trigger for this restriction. Repeated creation and quick deletion of posts is a classic signal of testing or spam automation.
- **Content Keywords**: Spam detection filters content for words like "test," "automation," and early links or engagement bait ("share," "like").
- **Multiple Devices/Browsers**: Increases suspicion of account sharing.
- **Unstable Geolocation**: Logins from different locations in a short period.

***

## 4. Duration and Recovery Dynamics

### Typical Timelines
| Category | Typical Duration |
|-----------|----------------------|
| Light (rate-limit) | 10 minutes – a few hours |
| Spam filter (1st occurrence) | 24–72 hours |
| Repeated or escalated | 3–7 days |
| Serious behavioral violation | 7–30 days |
| After multiple bypass attempts | 6–8 weeks and longer |

### Automatic Removal
Most rate-limit restrictions are removed automatically. Waiting without active intervention is often the best strategy.

### What Worsens the Situation
Repeated posting attempts during a restriction is the most common mistake. The system interprets persistence as continued spam activity and extends the restriction. Changing devices or IPs is perceived as an "evasive maneuver" and adds another red flag.

***

## 5. Recommended Actions

### Immediate Steps
1. **Stop all posting** for 24–48 hours to let the system "cool off."
2. **Confirm from a second account** (or Incognito without logging into the Page admin) that the latest post shows "Couldn't Load Post" — document the post URL/time.
3. **Check three locations** for hidden info: Support Inbox, Account Quality, and Email (including spam).
4. **Ensure account security**: Change password and enable 2FA in case compromise was the cause.
5. **Submit one appeal** via Account Quality if the "Request Review" button is available.
6. **Do not delete and repost** the failed item — that deepens the spam signal. Leave it alone and wait.

### What NOT to Do
- ❌ **Do not change IP, browser, or device** — flagged as evasive behavior.
- ❌ **Do not keep trying to post** — each failure strengthens the signal.
- ❌ **Do not use a VPN** during the restriction.
- ❌ **Do not create a new account** — Meta links accounts via fingerprints and history.
- ❌ **Do not continue using the automation** that likely caused the problem.

***

## 6. Technical Background: Andromeda System (2024–2025)

In late 2024, Meta launched Andromeda — an AI-powered engine with 10,000x model complexity working in real-time. Originally for ad targeting, this infrastructure is now used for content moderation, explaining the surge in both automation blocks and false positives in 2025.

***

## Conclusion

A verified account with instant post removal and clean Account Quality fits the **automated spam filter** pattern. The most likely causes are prior automation use or rapid publish/delete patterns. The optimal strategy: total pause, one official appeal, and 3–7 days of waiting. Most such restrictions are lifted automatically.
