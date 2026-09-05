import type { ContentVersionPayload } from '../types/content-versioning.types';

// Concatenates whichever text-bearing fields a given content kind's payload
// actually populated (blog uses `content`; social kinds use `posts`;
// newsletter adds subjectLine/preheader; video-script uses hook + scenes).
export function extractGroundableText(payload: ContentVersionPayload): string {
  const parts: string[] = [];
  if (payload.subjectLine) parts.push(payload.subjectLine);
  if (payload.preheader) parts.push(payload.preheader);
  if (payload.hook) parts.push(payload.hook);
  if (payload.content) parts.push(payload.content);
  if (payload.posts?.length) parts.push(...payload.posts);
  if (payload.scenes?.length) parts.push(...payload.scenes.map((s) => s.narration));
  return parts.join('\n');
}
