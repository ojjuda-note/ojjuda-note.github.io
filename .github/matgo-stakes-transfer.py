from pathlib import Path
import hashlib
p=Path('games/matgo.html'); original=p.read_bytes();s=original.decode()
assert hashlib.sha256(original).hexdigest()=='bbcea355797f46831f88bf2a79e1e38174b1e427a89784e5e8c7e520434b2109'
changes=[
 ('./matgo-engine.mjs?v=20261004-rules5','./matgo-engine.mjs?v=20261005-stakes1'),
 ('./matgo-wallet.mjs?v=20261004-rules5','./matgo-wallet.mjs?v=20261005-stakes1'),
 ('const wallet=createWallet(access);','const wallet=createWallet(access,{stakes:true});'),
 ('<div class="who"><b>나</b>','<div class="who"><b>나</b><span class="ppuk-count" id="stakeRate"></span>'),
 ("  $('#money').textContent=", "  $('#stakeRate').textContent='점당 '+(game.over?(wallet.current.stake_rate??game.rate):game.rate).toLocaleString()+'G';\n  $('#money').textContent="),
 ('currentRound=state.round.id;game.bank=', 'currentRound=state.round.id;game.rate=state.round.rate??100;game.bank='),
 ('1점 = ${game.rate}${UNIT}<br>', '1점 = ${game.rate.toLocaleString()}${UNIT}<br>보유 골드 단계가 오르면 판돈을 올릴지 물어봐요. 동의한 판돈은 유지되며, 골드가 0이 되면 점당 100G부터 다시 시작해요. 회원 대결은 점당 100G 고정이에요.<br>'),
 ('골드를 충전하면 다시 할 수 있어요.', '골드를 모두 잃어 판돈이 점당 100G로 초기화됐어요. 충전하면 다시 할 수 있어요.'),
 ('<p class="result-balance">내 골드 <strong>${state.gold.toLocaleString()}</strong></p>${state.gold===0?', '<p>이번 판 · 점당 ${game.rate.toLocaleString()}G</p><p class="result-balance">내 골드 <strong>${state.gold.toLocaleString()}</strong></p>${state.gold===0?')
]
for old,new in changes:
 assert s.count(old)==1, (old,s.count(old))
 s=s.replace(old,new)
assert hashlib.sha256(s.encode()).hexdigest()=='ef952f49f4e4913ef4d1b0eb90f9e0e9dc8fdcc2923600fc170616db191c08cb'
assert [line for line in original.decode().splitlines() if len(line)>10000]==[line for line in s.splitlines() if len(line)>10000]
p.write_text(s)
print({'file':str(p),'before':hashlib.sha256(original).hexdigest(),'after':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size})
