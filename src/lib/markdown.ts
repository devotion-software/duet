import { Marked } from 'marked';
import hljs from 'highlight.js/lib/core';

// Register a curated set of common languages instead of the full ~1MB bundle.
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import sql from 'highlight.js/lib/languages/sql';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import java from 'highlight.js/lib/languages/java';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import php from 'highlight.js/lib/languages/php';
import ruby from 'highlight.js/lib/languages/ruby';
import yaml from 'highlight.js/lib/languages/yaml';
import markdownLang from 'highlight.js/lib/languages/markdown';
import diff from 'highlight.js/lib/languages/diff';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import plaintext from 'highlight.js/lib/languages/plaintext';

for (const [name, lang] of Object.entries({
	javascript,
	typescript,
	python,
	bash,
	json,
	xml,
	css,
	sql,
	go,
	rust,
	java,
	c,
	cpp,
	csharp,
	php,
	ruby,
	yaml,
	markdown: markdownLang,
	diff,
	dockerfile,
	plaintext
})) {
	hljs.registerLanguage(name, lang);
}

const marked = new Marked({
	gfm: true,
	breaks: true
});

marked.use({
	renderer: {
		code({ text, lang }) {
			const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
			let highlighted: string;
			try {
				highlighted = hljs.highlight(text, { language }).value;
			} catch {
				highlighted = text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
			}
			return `<pre class="code-block"><code class="hljs language-${language}">${highlighted}</code></pre>`;
		}
	}
});

// Lazy browser-only sanitizer (avoids pulling a DOM on the server).
let purify: typeof import('dompurify').default | null = null;

/**
 * Render markdown → sanitised HTML. Returns escaped plain text on the server
 * (descriptions are only rendered in the browser), and DOMPurify-sanitised
 * HTML in the browser so stored markdown can't inject scripts.
 */
export async function renderMarkdown(src: string | null | undefined): Promise<string> {
	if (!src) return '';
	const raw = marked.parse(src, { async: false }) as string;
	if (typeof window === 'undefined') return '';
	if (!purify) {
		purify = (await import('dompurify')).default;
		// Rendered markdown can contain raw <a target="_blank"> from user content; force
		// noopener/noreferrer so the opened page can't reach back via window.opener.
		purify.addHook('afterSanitizeAttributes', (node) => {
			if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
				node.setAttribute('rel', 'noopener noreferrer');
			}
		});
	}
	return purify.sanitize(raw, {
		ALLOWED_TAGS: [
			'h1','h2','h3','h4','h5','h6','p','br','hr','strong','em','del','s','blockquote',
			'ul','ol','li','a','code','pre','span','img','table','thead','tbody','tr','th','td','input'
		],
		ALLOWED_ATTR: ['href','title','target','rel','class','src','alt','type','checked','disabled'],
		// Only safe URL schemes for links/images.
		ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i
	});
}

/** A run of plain text, an inline code span, or a markdown link, as parsed from a title by {@link splitTitleSegments}. */
export type TitleSegment =
	| { type: 'text'; text: string }
	| { type: 'code'; text: string }
	| { type: 'link'; text: string; href: string };

const INLINE_CODE_RE = /`([^`\n]+)`/g;
const LINK_RE = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;

/** Split a task title on backtick `code` spans and `[text](url)` links for display. */
export function splitTitleSegments(title: string): TitleSegment[] {
	const segments: TitleSegment[] = [];

	let last = 0;
	let match: RegExpExecArray | null;
	INLINE_CODE_RE.lastIndex = 0;
	while ((match = INLINE_CODE_RE.exec(title))) {
		if (match.index > last) segments.push(...splitLinks(title.slice(last, match.index)));
		segments.push({ type: 'code', text: match[1] });
		last = INLINE_CODE_RE.lastIndex;
	}
	if (last < title.length) segments.push(...splitLinks(title.slice(last)));
	return segments;
}

function splitLinks(text: string): TitleSegment[] {
	const segments: TitleSegment[] = [];
	let last = 0;
	let match: RegExpExecArray | null;
	LINK_RE.lastIndex = 0;
	while ((match = LINK_RE.exec(text))) {
		if (match.index > last) segments.push({ type: 'text', text: text.slice(last, match.index) });
		segments.push({ type: 'link', text: match[1], href: match[2] });
		last = LINK_RE.lastIndex;
	}
	if (last < text.length) segments.push({ type: 'text', text: text.slice(last) });
	return segments;
}

/** Plain-text excerpt for list previews (strips markdown syntax). */
export function markdownExcerpt(src: string | null | undefined, max = 140): string {
	if (!src) return '';
	const text = src
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/`[^`]*`/g, ' ')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/^\s{0,3}#{1,6}\s+/gm, '')
		.replace(/^\s{0,3}>\s?/gm, '')
		.replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
		.replace(/(\*\*|__)(.*?)\1/g, '$2')
		.replace(/(\*|_)(.*?)\1/g, '$2')
		.replace(/~~(.*?)~~/g, '$1')
		.replace(/\s+/g, ' ')
		.trim();
	return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}
