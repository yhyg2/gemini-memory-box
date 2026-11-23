import hashlib,json,re,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
script=(ROOT/'gemini-memory-box.user.js').read_text(encoding='utf-8')
assert re.findall(r'// @match\s+(\S+)',script)==['https://gemini.google.com/*']
assert not re.search(r'@require|@connect\s+\*|\beval\s*\(|new\s+Function\s*\(|sendBeacon\s*\(|new\s+WebSocket\s*\(',script)
assert '// @updateURL    none' in script and '// @downloadURL  none' in script
assert 'gemini-memory-box' in script
assert not re.search(r'\.innerHTML\s*=|\.outerHTML\s*=|\.insertAdjacentHTML\s*\(|\.parseFromString\s*\(|\.createContextualFragment\s*\(|\.createPolicy\s*\(',script)
assert 'GM_registerMenuCommand' in script and 'GM.registerMenuCommand' in script
for path in sorted((ROOT/'qa').glob('*synthetic.zip')):
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None,path.name
        names=z.namelist()
        assert len(names)==len(set(names))
        assert not any(n.startswith('/') or '..' in n.split('/') for n in names)
        checks=json.loads(z.read('文件校验.json'))
        for item in checks['files']:
            data=z.read(item['path'])
            assert len(data)==item['size_bytes']
            assert hashlib.sha256(data).hexdigest()==item['sha256']
        for name in names:
            if not name.endswith('.html'):continue
            html=z.read(name).decode()
            assert "connect-src 'none'" in html
            assert not re.search(r'<script\b|<iframe\b|<img[^>]+src=["\']https?://',html,re.I)
            for src in re.findall(r'<img[^>]+src="([^"]+)"',html):
                from urllib.parse import unquote
                assert unquote(src) in names
        report=json.loads(z.read('导出报告.json'))
        assert report['attachments_saved']+report['attachments_failed']==report['attachments_selected']
        assert report['result']!='complete' or report['history_complete']
        print(f'{path.name}: ZIP CRC, SHA-256, local image paths, CSP and counts passed')
print('Static privacy and independent ZIP validation passed.')
