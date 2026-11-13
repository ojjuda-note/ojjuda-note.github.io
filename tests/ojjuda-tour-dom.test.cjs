// unchanged production source at line 1
    assert.equal(w.eval('Object.keys(G.level).length+Object.keys(G.fest).length'),0,'buildings and festivals removed');
    assert.equal(w.eval('G.players[1].money'),1100+w.proceeds,'creditor only receives available funds');
    assert.equal(w.notices.at(-1).title,'탈락');
    assert.equal(w.notices.at(-1).buttons[0].l,'계속하기');assert.equal(w.notices.at(-1).buttons[0].sub,'관전하기');
    assert.match(w.notices.at(-1).body,/10만/);
    assert.equal($('#eliminationStatus').classList.contains('hidden'),false);
    assert.equal($('#players .out .m').textContent,'탈락');
// unchanged production source at line 215
