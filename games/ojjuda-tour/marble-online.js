// unchanged production source at line 1
    $('#sheet').classList.add('hidden'); $('#s2Title').textContent = '게임 결과';
    $('#s2Bust').innerHTML = ''; $('#s2Body').innerHTML = '';
    $('#sheet2').classList.add('result-view');
    $('#s2Btns').innerHTML = window.OjjudaGameResults.markup({game:'tour',outcome:!winner?'draw':room.game.winner===room.seat?'success':'failure',key:`tour:${room.id}`,metric:`${rank}위 · 자산 ${fmt(me.bankrupt?0:assets(me))}`,actions:'<button type="button" data-marble-lobby>대기실</button>'});
    $('#sheet2').classList.remove('hidden'); if(room.game.winner===room.seat)sfx('win');
  }
  async function accept(next,at=epoch) {
// unchanged production source at line 119
      if (room.status === 'finished') showResult();
      else if(room.game.players[room.seat]?.bankrupt&&eliminationKey!==room.id){
        eliminationKey=room.id;
        eliminationPopup=window.OjjudaGameResults.show({game:'tour',outcome:'failure',key:`tour-out:${room.id}`,metric:'파산 · 관전으로 전환',dismissible:true,actions:[{label:'관전하기',onClick:()=>{eliminationPopup=null;}}]});
      }
    } catch(e) { if (e !== STALE) { G = JSON.parse(JSON.stringify(room.game)); render(); } }
    finally { if (at === epoch) { animating = false; controlsKey = ''; controls(); } }
// unchanged production source at line 153
    else if (button.dataset.marbleChoice !== undefined) { const choice = room.prompt.choices[+button.dataset.marbleChoice]; if (choice) void sendMove({type:'choose',value:choice.value}); }
  };
  const quit = $('#quitBtn').onclick;
  $('#quitBtn').onclick = () => {
    if (!active()) return quit();
    if (busy || pending || room.status !== 'active' || spectating()) return;
    if (confirm('기권하면 이번 게임에서 탈락하고 관전하게 돼요. 기권할까요?')) void mutate({action:'surrender',room_id:room.id,version:room.version});
  };
  $('#s2Btns').addEventListener('click', event => { if (event.target.closest('[data-marble-lobby]') && room) { $('#sheet2').classList.add('hidden'); void mutate({action:'leave',room_id:room.id}); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && selected) void refresh(); });
// unchanged production source at line 233
