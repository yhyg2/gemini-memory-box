"""Compile the local static UI template to a DOM tree, without HTML injection."""
import json
import re
from html.parser import HTMLParser

VOID={'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}

class TreeParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.nodes=[]
        self.stack=[['root',{},self.nodes]]

    def handle_starttag(self,tag,attrs):
        values={key:('' if value is None else value) for key,value in attrs}
        if tag in {'script','iframe','object','embed','img','link'} or any(k.startswith('on') or k in {'src','href','srcdoc'} for k in values):
            raise ValueError('The local UI template must not contain executable or remote content')
        node=[tag,values,[]]
        self.stack[-1][2].append(node)
        if tag not in VOID:self.stack.append(node)

    def handle_startendtag(self,tag,attrs):
        self.handle_starttag(tag,attrs)
        if tag not in VOID:self.handle_endtag(tag)

    def handle_endtag(self,tag):
        if tag in VOID:return
        if len(self.stack)<2 or self.stack[-1][0]!=tag:raise ValueError('UI template tag mismatch')
        self.stack.pop()

    def handle_data(self,text):
        if text.strip():self.stack[-1][2].append(text)

def compile_ui(root,version):
    ui=(root/'src/ui.js').read_text(encoding='utf-8')
    styles=(root/'src/style.js').read_text(encoding='utf-8')
    match=re.search(r'const UI_HTML=`([\s\S]*?)`;',ui)
    if not match:raise ValueError('UI template missing')
    values={'VERSION':version}
    for name in ['BOX_ICON','FOLDER_ICON','SHIELD_ICON']:
        icon=re.search(r"const "+name+r"='([^'\\]*)';",styles)
        if not icon:raise ValueError('Static icon missing')
        values[name]=icon[1]
    html=re.sub(r'\$\{([A-Z_]+)\}',lambda m:values[m[1]],match[1])
    if '${' in html:raise ValueError('Unknown UI interpolation')
    parser=TreeParser();parser.feed(html);parser.close()
    if len(parser.stack)!=1:raise ValueError('UI template not closed')
    return 'const UI_TREE='+json.dumps(parser.nodes,ensure_ascii=False,separators=(',',':'))+';\n'
