/** A citation: the title as text, then a short link to where it lives. */
export function Cite({ title, url, year }: { title: string; url: string | null; year?: number | string }) {
  let host = "";
  try {
    host = url ? new URL(url).hostname.replace(/^www\./, "") : "";
  } catch {
    host = "";
  }
  return (
    <span className="cite">
      {title}
      {year ? ` (${year})` : ""}
      {url && (
        <>
          {title ? ", " : ""}
          <a href={url}>{host || "source"}</a>
        </>
      )}
    </span>
  );
}
