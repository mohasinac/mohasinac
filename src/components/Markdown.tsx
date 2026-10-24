import { CodeBlock } from "@/components/CodeBlock";

/**
 * A deliberately small markdown renderer.
 *
 * 🛑 The whole point is that it produces React elements from recognised
 * structures and puts everything else in a TEXT node. There is no
 * `dangerouslySetInnerHTML` anywhere in this file, so no amount of markup in a
 * CMS field can become live HTML — and a nonce-based CSP would not have saved
 * us there, because the server itself would have emitted the markup.
 *
 * Supported: `#`–`####` headings, fenced code blocks with a language tag,
 * `-`/`*` bullet lists, `1.` ordered lists, `>` blockquotes, `|` tables,
 * `---` rules, paragraphs, and inline `` `code` ``, `**bold**` and `[text](url)`.
 * Anything else renders as the literal text that was typed, which is the
 * correct failure mode for a teaching corpus full of `<`, `>` and `&`.
 *
 * Note on style: `tsconfig` has `noUncheckedIndexedAccess`, so every indexed
 * read is `T | undefined`. Rather than assert them away, this file funnels
 * line access through `at()` and group access through `group()` — the
 * out-of-range case then degrades to an empty string instead of a crash on
 * malformed input, which for authored content is the behaviour we want.
 */

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "code"; lang: string; code: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "table"; rows: string[][] }
  | { kind: "rule" }
  | { kind: "para"; text: string };

/** A capture group, or "" when it did not participate. */
const group = (m: RegExpMatchArray | null, i: number): string => m?.[i] ?? "";

function parse(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  /** Line `k`, or "" past the end. */
  const at = (k: number): string => lines[k] ?? "";

  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = at(i);

    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code. An unterminated fence runs to the end of the document
    // rather than swallowing the parser.
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(at(i))) {
        code.push(at(i));
        i++;
      }
      i++; // closing fence
      blocks.push({ kind: "code", lang: group(fence, 1), code: code.join("\n") });
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: group(heading, 1).length,
        text: group(heading, 2).trim(),
      });
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      i++;
      continue;
    }

    // Table: a header row followed by a `|---|` separator.
    if (line.trim().startsWith("|") && /^\s*\|[\s:|-]+\|\s*$/.test(at(i + 1))) {
      const cells = (l: string): string[] =>
        l
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim());

      const rows: string[][] = [cells(line)];
      i += 2;
      while (i < lines.length && at(i).trim().startsWith("|")) {
        rows.push(cells(at(i)));
        i++;
      }
      blocks.push({ kind: "table", rows });
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = numbered !== null;
      const items: string[] = [];
      while (i < lines.length) {
        const m = ordered
          ? at(i).match(/^\s*\d+[.)]\s+(.*)$/)
          : at(i).match(/^\s*[-*]\s+(.*)$/);
        if (!m) break;
        items.push(group(m, 1));
        i++;
        // A wrapped continuation line is indented and not itself a new item.
        while (i < lines.length && /^\s{2,}\S/.test(at(i)) && !/^\s*([-*]|\d+[.)])\s/.test(at(i))) {
          const last = items.length - 1;
          items[last] = `${items[last] ?? ""} ${at(i).trim()}`;
          i++;
        }
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    if (line.startsWith(">")) {
      const text: string[] = [];
      while (i < lines.length && at(i).startsWith(">")) {
        text.push(at(i).replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ kind: "quote", text: text.join(" ") });
      continue;
    }

    // Paragraph: consecutive lines up to a blank line or the start of any
    // other block.
    const para: string[] = [];
    while (
      i < lines.length &&
      at(i).trim() &&
      !/^(#{1,4}\s|```|>|\s*[-*]\s|\s*\d+[.)]\s|-{3,}$)/.test(at(i)) &&
      !at(i).trim().startsWith("|")
    ) {
      para.push(at(i));
      i++;
    }
    if (para.length) blocks.push({ kind: "para", text: para.join(" ") });
    else i++; // defensive: never spin on a line no branch consumed
  }

  return blocks;
}

/** Inline spans. Returns React nodes, so the text itself is never interpreted. */
function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // One pass over the three inline forms; order matters only in that code
  // wins, so `` `**x**` `` stays literal.
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyBase}-i${n++}`;
    const code = m[1];
    const bold = m[2];
    const link = m[3];

    if (code) {
      out.push(
        <code key={key} className="rounded-sm bg-surface-raised px-1 py-0.5 font-mono text-[0.9em]">
          {code.slice(1, -1)}
        </code>,
      );
    } else if (bold) {
      out.push(
        <strong key={key} className="font-semibold text-text">
          {bold.slice(2, -2)}
        </strong>,
      );
    } else if (link) {
      const parts = link.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      const label = group(parts, 1);
      const href = group(parts, 2);
      /*
       * Only http(s), mailto and site-relative links. `javascript:` in an
       * href executes on click, and this text comes from the CMS — so the
       * scheme is allow-listed rather than sanitised. An unrecognised scheme
       * renders as plain text, keeping the label visible.
       */
      const safe = /^(https?:\/\/|mailto:|\/)/i.test(href);
      out.push(
        safe ? (
          <a
            key={key}
            href={href}
            {...(href.startsWith("/") ? {} : { rel: "noreferrer noopener" })}
            className="text-accent hover:underline"
          >
            {label}
          </a>
        ) : (
          <span key={key}>{label}</span>
        ),
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const HEADING_CLASS = [
  "mt-8 mb-3 text-xl font-semibold tracking-tight",
  "mt-8 mb-3 text-lg font-semibold tracking-tight",
  "mt-6 mb-2 text-base font-semibold",
  "mt-5 mb-2 font-mono text-xs uppercase tracking-wider text-text-faint",
] as const;

const HEADING_TAG = ["h2", "h3", "h4", "h5"] as const;

export function Markdown({ source }: { source: string }) {
  const blocks = parse(source);

  return (
    <div className="prose-editorial text-text-muted">
      {blocks.map((b, i) => {
        const key = `b${i}`;
        switch (b.kind) {
          case "heading": {
            const Tag = HEADING_TAG[b.level - 1] ?? "h4";
            const cls = HEADING_CLASS[b.level - 1] ?? HEADING_CLASS[3];
            return (
              <Tag key={key} className={`text-text ${cls}`}>
                {inline(b.text, key)}
              </Tag>
            );
          }
          case "code":
            return <CodeBlock key={key} code={b.code} lang={b.lang} />;
          case "list": {
            const Tag = b.ordered ? "ol" : "ul";
            return (
              <Tag
                key={key}
                className={`my-3 space-y-1.5 pl-5 ${b.ordered ? "list-decimal" : "list-disc"}`}
              >
                {b.items.map((item, j) => (
                  <li key={`${key}-${j}`}>{inline(item, `${key}-${j}`)}</li>
                ))}
              </Tag>
            );
          }
          case "quote":
            return (
              <blockquote key={key} className="my-4 border-l-2 border-accent pl-4 text-sm italic">
                {inline(b.text, key)}
              </blockquote>
            );
          case "table": {
            const [header, ...body] = b.rows;
            return (
              // Wide tables scroll inside their own box rather than making the
              // page scroll sideways.
              <div key={key} className="my-4 overflow-x-auto rounded-md border border-border">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-surface">
                      {(header ?? []).map((c, j) => (
                        <th
                          key={j}
                          className="border-b border-border px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-text-faint"
                        >
                          {inline(c, `${key}-h${j}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {body.map((row, r) => (
                      <tr key={r} className="border-b border-border last:border-0">
                        {row.map((c, j) => (
                          <td key={j} className="px-3 py-2 align-top">
                            {inline(c, `${key}-${r}-${j}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          case "rule":
            return <hr key={key} className="my-6 border-border" />;
          default:
            return (
              <p key={key} className="my-3 leading-relaxed">
                {inline(b.text, key)}
              </p>
            );
        }
      })}
    </div>
  );
}
