export const DESCRIPTION_UNAVAILABLE = '공식 설명 미확인';
export const DESCRIPTION_MAX_LENGTH = 180;

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeOfficialDescription(value) {
  return text(value)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function officialDescriptionExcerpt(value, {
  maxLength = DESCRIPTION_MAX_LENGTH,
  minSentenceLength = 48,
} = {}) {
  const normalized = normalizeOfficialDescription(value);
  if (!normalized || maxLength < 2) return normalized;
  if (normalized.length <= maxLength) return normalized;

  let boundary = -1;
  const sentenceBoundary = /[.!?。！？](?:["'”’」』】）)\]]*)/gu;
  for (const match of normalized.matchAll(sentenceBoundary)) {
    const end = (match.index || 0) + match[0].length;
    if (end > maxLength) break;
    if (end >= minSentenceLength) boundary = end;
  }
  if (boundary >= minSentenceLength) return normalized.slice(0, boundary).trim();

  let cut = normalized.slice(0, maxLength - 1).trimEnd();
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace >= Math.floor(maxLength * 0.65)) cut = cut.slice(0, lastSpace);
  cut = cut.replace(/[,;:，、]+$/u, '').trimEnd();
  return `${cut}…`;
}

export function unavailableDescription(source, checkedAt, reason = 'official_description_missing') {
  return {
    description: DESCRIPTION_UNAVAILABLE,
    descriptionStatus: 'unavailable',
    descriptionSource: String(source || ''),
    descriptionCheckedAt: checkedAt,
    descriptionReason: String(reason || 'official_description_missing'),
  };
}

export function officialDescriptionMetadata(value, source, checkedAt, options = {}) {
  const description = officialDescriptionExcerpt(value, options);
  if (!description) return unavailableDescription(source, checkedAt, options.reason);
  return {
    description,
    descriptionStatus: 'verified',
    descriptionSource: String(source || ''),
    descriptionCheckedAt: checkedAt,
    descriptionReason: null,
  };
}

export function descriptionQuality(records) {
  const unavailable = records.filter(row => row.descriptionStatus !== 'verified').length;
  return {
    status: unavailable ? 'incomplete' : 'complete',
    verified: records.length - unavailable,
    unavailable,
  };
}
