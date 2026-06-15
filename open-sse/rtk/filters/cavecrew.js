// Cavecrew: compress subagent output using caveman-style rules
// Only applies to text blocks ≥ 500 characters.
// Preserves: code blocks, file paths, commands, URLs, errors, numeric values.

const THRESHOLD = 500;

// --- Protected content patterns ---

// Fenced code blocks (```...```)
const FENCED_CODE_BLOCK = /```[\s\S]*?```/g;

// Inline code (`...`)
const INLINE_CODE = /`[^`\n]+`/g;

// URLs (http, https, ftp)
const URL_PATTERN = /https?:\/\/[^\s)>\]]+|ftp:\/\/[^\s)>\]]+/g;

// File paths (Unix and Windows)
const FILE_PATH = /(?:\/[\w.~@-]+){2,}[\w./~@-]*|[A-Z]:\\[\w\\./~@-]+/g;

// Shell commands (lines starting with $ or >)
const SHELL_CMD = /^[\t ]*[$>]\s+.+$/gm;

// Error messages (common patterns)
const ERROR_MSG = /^(?:Error|TypeError|ReferenceError|SyntaxError|RangeError|URIError|EvalError|FATAL|WARN|WARNING|ERR!|npm ERR!|✖|ENOENT|EACCES|EPERM|EISDIR|ENOTDIR|EEXIST|ENOMEM|ECONNREFUSED|ETIMEDOUT)[\s:].*$/gm;

// Numeric values (integers, decimals, percentages, hex, sizes)
const NUMERIC_VAL = /\b\d+(?:\.\d+)?(?:%|px|em|rem|ms|s|[KMGT]i?B|bytes?)?\b|0x[0-9a-fA-F]+/g;

// --- Words/phrases to remove ---

// Articles
const ARTICLES = /\b(?:a|an|the)\b/gi;

// Filler words
const FILLERS = /\b(?:just|really|basically|actually|simply|very|quite|rather|somewhat|certainly|definitely|essentially|fundamentally|practically|virtually|literally|honestly|frankly|naturally|obviously|clearly|evidently|apparently|presumably|seemingly|arguably|admittedly|undoubtedly|indeed|meanwhile|furthermore|moreover|nevertheless|nonetheless|however|therefore|consequently|subsequently|additionally|accordingly)\b/gi;

// Hedging phrases
const HEDGING = /\b(?:I think|I believe|I suppose|it seems|it appears|it looks like|kind of|sort of|more or less|in a way|to some extent|to a certain degree|as far as I can tell|if I'm not mistaken|as I understand it|from my perspective|in my opinion|it might be|it could be|it may be|perhaps|maybe)\b/gi;

// Pleasantries
const PLEASANTRIES = /\b(?:sure|of course|I'd be happy to|I would be happy to|happy to help|glad to help|let me help you|I can help with that|certainly|absolutely|no problem|you're welcome|thank you for|thanks for asking|great question|good question|that's a great question)\b/gi;

// Redundant phrasing
const REDUNDANT = [
  [/\bin order to\b/gi, "to"],
  [/\bas well as\b/gi, "and"],
  [/\bdue to the fact that\b/gi, "because"],
  [/\bat this point in time\b/gi, "now"],
  [/\bin the event that\b/gi, "if"],
  [/\bfor the purpose of\b/gi, "for"],
  [/\bwith regard to\b/gi, "about"],
  [/\bwith respect to\b/gi, "about"],
  [/\bin light of the fact that\b/gi, "since"],
  [/\bit is important to note that\b/gi, "note:"],
  [/\bit should be noted that\b/gi, "note:"],
  [/\bplease note that\b/gi, "note:"],
  [/\bkeep in mind that\b/gi, "note:"],
  [/\bas a result of\b/gi, "from"],
  [/\bin addition to\b/gi, "plus"],
  [/\bon the other hand\b/gi, "but"],
  [/\bat the end of the day\b/gi, "ultimately"],
  [/\bthe fact that\b/gi, "that"],
  [/\bin the process of\b/gi, "while"],
  [/\bis able to\b/gi, "can"],
  [/\bare able to\b/gi, "can"],
  [/\bwas able to\b/gi, "could"],
  [/\bhas the ability to\b/gi, "can"],
  [/\bhave the ability to\b/gi, "can"],
  [/\bmake sure that\b/gi, "ensure"],
  [/\ba large number of\b/gi, "many"],
  [/\ba number of\b/gi, "several"],
  [/\bin spite of\b/gi, "despite"],
  [/\bfor the most part\b/gi, "mostly"],
  [/\bat this time\b/gi, "now"],
  [/\bprior to\b/gi, "before"],
  [/\bsubsequent to\b/gi, "after"],
];

// Verbose transitions / lead-ins to compress
const TRANSITIONS = /\b(?:That being said|Having said that|With that being said|As mentioned earlier|As previously mentioned|As noted above|As discussed|As you can see|As we can see|It's worth mentioning that|It's worth noting that|It is worth noting that|What this means is|This means that|This indicates that|This suggests that)\b,?\s*/gi;

/**
 * Extract protected content and replace with placeholders.
 * Returns { cleaned, protectedMap } where protectedMap maps placeholder -> original.
 */
function extractProtected(text) {
  const protectedMap = new Map();
  let counter = 0;

  const placeholder = (content) => {
    const key = `\x00PH${counter++}\x00`;
    protectedMap.set(key, content);
    return key;
  };

  // Order matters: extract larger patterns first
  let cleaned = text;

  // 1. Fenced code blocks (multi-line, greedy minimal)
  cleaned = cleaned.replace(FENCED_CODE_BLOCK, (m) => placeholder(m));

  // 2. Inline code
  cleaned = cleaned.replace(INLINE_CODE, (m) => placeholder(m));

  // 3. URLs (before file paths, since URLs can look like paths)
  cleaned = cleaned.replace(URL_PATTERN, (m) => placeholder(m));

  // 4. Shell commands
  cleaned = cleaned.replace(SHELL_CMD, (m) => placeholder(m));

  // 5. Error messages
  cleaned = cleaned.replace(ERROR_MSG, (m) => placeholder(m));

  // 6. File paths
  cleaned = cleaned.replace(FILE_PATH, (m) => placeholder(m));

  // 7. Numeric values
  cleaned = cleaned.replace(NUMERIC_VAL, (m) => placeholder(m));

  return { cleaned, protectedMap };
}

/**
 * Apply caveman-style compression to prose text.
 */
function compressProse(text) {
  let result = text;

  // Remove transitions / verbose lead-ins
  result = result.replace(TRANSITIONS, "");

  // Remove pleasantries
  result = result.replace(PLEASANTRIES, "");

  // Remove hedging phrases
  result = result.replace(HEDGING, "");

  // Remove filler words
  result = result.replace(FILLERS, "");

  // Remove articles
  result = result.replace(ARTICLES, "");

  // Apply redundant phrasing substitutions
  for (const [pattern, replacement] of REDUNDANT) {
    result = result.replace(pattern, replacement);
  }

  // Clean up: collapse multiple spaces into one
  result = result.replace(/ {2,}/g, " ");

  // Clean up: remove space before punctuation
  result = result.replace(/ ([.,;:!?])/g, "$1");

  // Clean up: remove leading/trailing spaces on lines
  result = result.replace(/^[ \t]+|[ \t]+$/gm, "");

  // Clean up: collapse multiple blank lines into one
  result = result.replace(/\n{3,}/g, "\n\n");

  return result;
}

/**
 * Restore protected content from placeholders.
 */
function restoreProtected(text, protectedMap) {
  let result = text;
  for (const [key, value] of protectedMap) {
    result = result.replace(key, value);
  }
  return result;
}

/**
 * Compress subagent output using caveman-style rules.
 * Only applies to text blocks ≥ 500 characters.
 * Preserves: code blocks, file paths, commands, URLs, errors, numeric values.
 *
 * @param {string} text - Subagent output text
 * @returns {string} - Compressed text (or original if compression doesn't reduce size)
 */
export function cavecrew(text) {
  // Passthrough: below threshold
  if (!text || text.length < THRESHOLD) {
    return text;
  }

  // Extract protected content
  const { cleaned, protectedMap } = extractProtected(text);

  // Compress prose sections
  const compressed = compressProse(cleaned);

  // Restore protected content
  const result = restoreProtected(compressed, protectedMap);

  // Only return compressed if it actually saves space
  if (result.length >= text.length) {
    return text;
  }

  return result;
}

cavecrew.filterName = "cavecrew";
