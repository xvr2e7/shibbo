"""Visible text of a rendered page. With --authored, drop elements that carry data rather than copy.
Data, by this rule: specimen phrases, tables, phrase lists, example pairs, code, citations, the tell ledger,
entry titles that quote a tell, field-note quotes, and the map tooltip."""
import sys, re
from html.parser import HTMLParser
DATA_CLASSES = {"specimen", "phrases", "pair", "cite", "tip", "strip", "ledger", "facts"}
DATA_TAGS = {"table", "pre", "code", "cite", "svg", "script", "style", "noscript", "title", "canvas"}
VOID = {"br", "img", "input", "meta", "link", "hr", "source", "wbr", "area", "col", "embed", "param", "track"}
class P(HTMLParser):
    def __init__(s, authored):
        super().__init__(convert_charrefs=True); s.out=[]; s.stack=[]; s.skip=0; s.authored=authored
    def handle_starttag(s, t, a):
        if t in VOID: return
        cls=set((dict(a).get("class") or "").split())
        data = t in DATA_TAGS or (s.authored and (cls & DATA_CLASSES or (t=="h1" and "entry" in "".join(x[2] for x in s.stack))))
        s.stack.append((t, data, " ".join(cls)))
        if data: s.skip+=1
        if t in ("p","li","h1","h2","h3","div","section","tr","dt","dd","figure","aside","header","footer","nav"): s.out.append("\n\n" if t in ("p","h1","h2","h3","section") else "\n")
    def handle_endtag(s, t):
        if t in VOID: return
        while s.stack:
            tag, data, _ = s.stack.pop()
            if data: s.skip-=1
            if tag==t: break
    def handle_data(s, d):
        if not s.skip: s.out.append(d)
authored = "--authored" in sys.argv
for f in [x for x in sys.argv[1:] if not x.startswith("--")]:
    p=P(authored); p.feed(open(f).read())
    print(re.sub(r"\n{3,}", "\n\n", "".join(p.out)).strip()+"\n")
