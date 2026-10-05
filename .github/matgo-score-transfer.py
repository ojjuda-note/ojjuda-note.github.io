from pathlib import Path
import hashlib
p=Path('games/matgo.html'); original=p.read_bytes(); s=original.decode()
assert hashlib.sha256(original).hexdigest()=='ef952f49f4e4913ef4d1b0eb90f9e0e9dc8fdcc2923600fc170616db191c08cb'
changes=[['<span class="my-score" id="mePts" aria-label="내 점수"></span>', ''], ['id="capsMe" aria-label="내가 먹은 패"></div><div class="hand-row">', 'id="capsMe" aria-label="내가 먹은 패"></div><div class="my-score hand-score" id="mePts" role="status" aria-label="내 점수"></div><div class="hand-row">'], ['./matgo-viewport.css?v=20261003-exit1', './matgo-viewport.css?v=20261005-score1']]
for old,new in changes:
 assert s.count(old)==1, (old,s.count(old))
 s=s.replace(old,new)
assert hashlib.sha256(s.encode()).hexdigest()=='91ec200d9f4bdab3c79d457e50de85a6b916e2332b744c3ca73c21eb64b2a35f'
assert [x for x in original.decode().splitlines() if len(x)>10000]==[x for x in s.splitlines() if len(x)>10000]
p.write_text(s)
print({"path":str(p),"bytes":p.stat().st_size,"sha256":hashlib.sha256(p.read_bytes()).hexdigest()})
