# Prompt for Digest Assembly

You are assembling the final digest from ready author commentaries.

## Input Data
- List of processed commentaries (each with a link to the original)
- Border text (from config.md)

## Digest Structure

1. The main hashtag (provided in the input data, usually #новини) stands ALONE on the first line.
   The first commentary starts on the NEXT line with "1.":
   [Hashtag]
   1. [Text of the first commentary]
   [link to original]
   Put a line break between the hashtag and 1. Do NOT put them on the same line.
   Do NOT use #AI or #news as the opening hashtag.

2. Numbered commentaries (starting from the 2nd — each on a new line):
   N. [Commentary text]
   [link to original]

3. Border (opt-out/ban) — at the very end. Do NOT add hashtags after it.

## Rules

- ABSOLUTELY FORBIDDEN to edit, shorten, or rewrite commentary texts (exception: the variety rule below).
- ALL commentaries from the input data MUST be included — none can be skipped.
- Do not add an intro or conclusion.
- Do not add your own comments.
- **Variety Rule:** Ensure variety in sentence beginnings. If several commentaries in a row start with the same words or clichés (e.g., "Well, yes, ", "Of course, ", "What can I say, "), you MUST change or remove this beginning in the repeating elements so the text reads naturally.
- Simply assembling everything into a single text is mechanical assembly, not creative work.
- The digest MUST end with the border/disclaimer only — if it is missing, the result is INCORRECT.
- Do NOT copy instructions from the user message into the digest.
- Do NOT invent or append trailing hashtags.

### Border / Disclaimer

The border text (provided in the input data) must be inserted VERBATIM, WORD FOR WORD, WITHOUT ANY CHANGES.
Do not paraphrase, shorten, or "improve." Copy as is.
Do not add hashtags at the end.

Example:

#новини
1. HR is f..ked. During the pandemic, HR seemed to be seated "at the table." Everyone was happy, made a couple of posts on LinkedIn — and moved on. Then the table slowly moved to finance, IT, and operations. No scandals, it just happened. Meanwhile, AI quietly took over recruitment, screening, answering questions, and half of the "business partnership." At IBM, for example, they say that almost all typical HR questions are already handled by AI. HR remains — but somewhere closer to administration and "complex cases." https://www.perplexity.ai/page/the-quiet-erosion-of-hr-s-powe-udw6iWxzQl6wK6FMa_79tQ

2. It was quiet and boring in the App Store for three years, and then suddenly — a 60% increase in new iOS apps in a year. Not because everyone suddenly got smarter, but because you can now write code with words. You say it — you get it. "Vibe coding," "agentic coding," call it what you want, the essence is the same: AI has started doing what was previously considered a craft.

The barrier to entry has dropped almost to zero. Anthropic is releasing tools for office people, Replit allows you to assemble an iOS app without a single line of code, and analysts from Andreessen Horowitz are nostalgic for 2008 and the first iPhone SDK. Back then, it also suddenly turned out that making apps wasn't just for the "chosen few."

Against this backdrop, old software looks slightly confused. Investors are nervous, shares of Adobe and Salesforce have dipped — because if software can be "talked" into existence, why pay for bulky platforms. https://www.perplexity.ai/page/ios-app-releases-surge-60-as-a-g9k3hjlESOGMDKwKj6pHYg

3. SaaS is also f..ked. The word "SaaSpocalypse" sounds like a joke from Twitter, but the market isn't laughing for some reason. Enterprise software shares are hanging out somewhere at the bottom while everyone watches AI agents and tries to understand why pay for a "seat in the system" at all if you can buy the result.

After the release of ChatGPT, software was supposed to flourish, but no. SaaS grew modestly, indices flew down, and investors started asking unpleasant questions. Especially after the story with Anthropic, where Claude Cowork was assembled in a week and a half by their own AI. This is no longer about efficiency, but about the business model itself.

Even in the Morgan Stanley SaaS basket this year, it looks like someone forgot to close the window. https://www.perplexity.ai/page/saaspocalypse-now-3Tsf6SIjTIKXLyHPUxQrWA

This digest is 100% prepared by AI.
