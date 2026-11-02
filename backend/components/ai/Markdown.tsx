import { Fragment, type ReactNode } from "react";
import s from "./ai.module.css";

/**
 * Minimal, XSS-safe markdown for assistant answers: paragraphs, bullet/numbered
 * lists, fenced code, inline code, **bold**, [links](url) and [n] citation chips.
 * Never uses dangerouslySetInnerHTML; only http(s), mailto and same-site links render.
 */
export type Citation = { n: number; title: string; url: string };

export function safeHref(url: string): string | null {
  const u = url.trim();
  if (u.startsWith("/") && !u.startsWith("//")) return u;
  if (/^https?:\/\//i.test(u) || /^mailto:/i.test(u)) return u;
  return null;
}

function inline(text: string, citations: Citation[], keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[([^\]]+)\]\(([^)\s]+)\))|(\[(\d{1,2})\])|(https?:\/\/[^\s)]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${keyBase}-${i++}`;
    if (m[1]) out.push(<code key={k}>{m[1].slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{m[2].slice(2, -2)}</strong>);
    else if (m[3]) {
      const href = safeHref(m[5]!);
      out.push(href ? <a key={k} href={href} target={href.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer">{m[4]}</a> : m[4]);
    } else if (m[6]) {
      const c = citations.find((x) => x.n === Number(m![7]));
      const href = c ? safeHref(c.url) : null;
      out.push(
        c && href ? (
          <a key={k} className={s.cite} href={href} title={c.title} target={href.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer">
            {c.n}
          </a>
        ) : (
          m[6]
        ),
      );
    } else if (m[8]) {
      const href = safeHref(m[8]);
      out.push(href ? <a key={k} href={href} target="_blank" rel="noopener noreferrer">{m[8]}</a> : m[8]);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, citations = [] }: { text: string; citations?: Citation[] }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (/^```/.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!)) code.push(lines[i++]!);
      i++;
      blocks.push(
        <pre key={key++}>
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    if (/^\s*([-*]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+[.)])\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*([-*]|\d+[.)])\s+/, ""));
      const kids = items.map((it, j) => <li key={j}>{inline(it, citations, `l${key}-${j}`)}</li>);
      blocks.push(ordered ? <ol key={key++}>{kids}</ol> : <ul key={key++}>{kids}</ul>);
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^```/.test(lines[i]!) && !/^\s*([-*]|\d+[.)])\s+/.test(lines[i]!)) {
      para.push(lines[i++]!.replace(/^#{1,6}\s+/, ""));
    }
    blocks.push(
      <p key={key++}>
        {para.map((p, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(p, citations, `p${key}-${j}`)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return <>{blocks}</>;
}

/** Only the citations actually referenced as [n] in the answer. */
export function usedCitations(text: string, citations: Citation[]): Citation[] {
  const used = new Set([...text.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1])));
  return citations.filter((c) => used.has(c.n));
}
