// Caveman-compress utility: rewrite memory/context text into caveman-speak
// for ~46% input token savings. Preserves code blocks, paths, commands, URLs,
// and structured data (JSON/YAML/XML/tables).

import { MIN_COMPRESS_SIZE } from "../constants.js";

// --- Protected content patterns ---

// Match fenced code blocks (``` ... ```)
const FENCED_CODE_BLOCK_RE = /```[\s\S]*?```/g;

// Match inline code (`...`)
const INLINE_CODE_RE = /`[^`\n]+`/g;

// Match URLs (http://, https://, ftp://)
const URL_RE = /(?:https?|ftp):\/\/[^\s)}\]>"']+/g;

// Match file paths (Unix and Windows)
const FILE_PATH_RE = /(?:\/[\w.\-]+){2,}[\w.\-/]*|[A-Z]:\\[\w.\-\\]+/g;

// Match shell commands (lines starting with $ or >)
const SHELL_CMD_RE = /^[\t ]*[>$]\s+.+$/gm;

// Match JSON blocks (object or array spanning multiple lines)
const JSON_BLOCK_RE = /^[ \t]*[{\[][\s\S]*?^[ \t]*[}\]]/gm;

// Match YAML blocks (lines starting with key: or - item patterns, 3+ consecutive)
const YAML_BLOCK_RE = /(?:^[ \t]*(?:[\w.-]+:[ \t].*|-[ \t]+.*)(?:\n|$)){3,}/gm;

// Match XML blocks (opening + closing tags spanning multiple lines)
const XML_BLOCK_RE = /<[a-zA-Z][\s\S]*?<\/[a-zA-Z][^>]*>/g;

// Match markdown tables (lines with | separators, 2+ rows)
const MD_TABLE_RE = /(?:^\|.+\|[ \t]*\n){2,}/gm;

// --- Compression rules ---

// Articles to remove (case-insensitive, word-boundary)
const ARTICLES_RE = /\b(?:a|an|the)\b/gi;

// Filler words to remove
const FILLER_RE = /\b(?:just|really|basically|actually|simply|very|quite|rather|somewhat)\b/gi;

// Hedging phrases to remove
const HEDGING_RE = /\b(?:I think|it seems|kind of|sort of)\b/gi;

// Redundant phrasing replacements
const REDUNDANT_PHRASES = [
  [/\bin order to\b/gi, "to"],
  [/\bas well as\b/gi, "and"],
  [/\bdue to the fact that\b/gi, "because"],
];

// Clean up multiple spaces left by removals
const MULTI_SPACE_RE = /  +/g;

// Clean up space before punctuation
const SPACE_BEFORE_PUNCT_RE = / ([.,;:!?])/g;

// Clean up leading space on lines
const LEADING_SPACE_RE = /^ +/gm;

/**
 * Rewrite memory/context text into caveman-speak for input token savings.
 * Minimum 500 char threshold. Preserves code blocks, paths, commands, URLs,
 * structured data (JSON/YAML/XML/tables).
 *
 * @param {string} text - Input text to compress
 * @returns {string} - Compressed text (or original if no savings)
 */
export function cavemanCompress(text) {
  if (!text || text.length < MIN_COMPRESS_SIZE) {
    return text;
  }

  // --- Phase 1: Extract protected content and replace with placeholders ---
  const placeholders = [];
  let working = text;

  const protect = (regex) => {
    working = working.replace(regex, (match) => {
      const idx = placeholders.length;
      placeholders.push(match);
      return `\x00PH${idx}\x00`;
    });
  };

  // Order matters: extract larger blocks first to avoid partial matches
  protect(FENCED_CODE_BLOCK_RE);
  protect(JSON_BLOCK_RE);
  protect(XML_BLOCK_RE);
  protect(YAML_BLOCK_RE);
  protect(MD_TABLE_RE);
  protect(SHELL_CMD_RE);
  protect(URL_RE);
  protect(FILE_PATH_RE);
  protect(INLINE_CODE_RE);

  // --- Phase 2: Compress prose ---
  // Order: redundant phrases first (they contain articles that would be stripped),
  // then hedging, filler, articles last.

  // Replace redundant phrasing (must come before article removal)
  for (const [pattern, replacement] of REDUNDANT_PHRASES) {
    working = working.replace(pattern, replacement);
  }

  // Remove hedging phrases
  working = working.replace(HEDGING_RE, "");

  // Remove filler words
  working = working.replace(FILLER_RE, "");

  // Remove articles
  working = working.replace(ARTICLES_RE, "");

  // --- Phase 3: Clean up whitespace artifacts ---
  working = working.replace(MULTI_SPACE_RE, " ");
  working = working.replace(SPACE_BEFORE_PUNCT_RE, "$1");
  working = working.replace(LEADING_SPACE_RE, "");

  // --- Phase 4: Restore protected content ---
  working = working.replace(/\x00PH(\d+)\x00/g, (_, idx) => placeholders[Number(idx)]);

  // --- Phase 5: Return original if no savings ---
  if (working.length >= text.length) {
    return text;
  }

  return working;
}

cavemanCompress.filterName = "caveman-compress";
