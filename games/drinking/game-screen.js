'use strict';
(() => {
  // Presentation follows accepted game state. It never advances a turn or writes
  // to a room, and reads result copy only after the game has revealed it.
  const localRounds = new WeakMap();
  let sequence = 0;
  function text(node) {
    if (!node) return '';
    const copy = node.cloneNode(true);
    copy.querySelectorAll?.('br').forEach(br => br.replaceWith('\n'));
    return (copy.textContent || '').split('\n').map(line => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean).join('\n');
  }
  const paragraphs = root => Array.from(root.querySelectorAll(':scope > p:not(.table-host)')).map(text).filter(Boolean);

  function resultCopy(kind, root, heading, state) {
    let title = text(root.querySelector(heading));
    let body = paragraphs(root).slice(0, 2).join('\n');
    if (kind === 'king') {
      const order = text(root.querySelector('.king-order h1, .king-order h2, h2'));
      const recipients = Array.from(root.querySelectorAll('.king-recipients > div')).map(row =>
        [text(row.querySelector('dt')), text(row.querySelector('dd'))].filter(Boolean).join(' · '));
      title = state.declined != null ? '이번 미션은 패스했어요' : '왕의 명령이 정해졌어요';
      body = [order, ...recipients, ...paragraphs(root).slice(0, 1)].filter(Boolean).join('\n');
    } else if (kind === 'minority') {
      const groups = Array.from(root.querySelectorAll('.breakdown > li, .results-line')).map(row =>
        Array.from(row.childNodes).map(text).filter(Boolean).join(' · ') || text(row));
      body = groups.join('\n') || body;
    } else if (kind === 'mission') {
      const words = Array.from(root.querySelectorAll('.breakdown > li, .results-line')).map(text);
      body = [paragraphs(root)[0], ...words].filter(Boolean).join('\n');
    }
    const host=text(root.querySelector('.table-host'));
    if(host&&!body.split('\n').includes(host))body=[host,body].filter(Boolean).join('\n');
    return {title: title || '이번 판 결과', body};
  }

  function native(kind, state, view) {
    const presentation = window.DrinkingPresentation;
    if (!presentation || !view) return;
    presentation.enter(kind);
    const phase = state?.phase || 'entry';
    const roundKey = ['room', kind, state?.code || 'entry', state?.round || 0].join('/');
    const card=view.querySelector('.card');
    const ui=window.DrinkingTableView;
    if(ui && card && state && phase!=='waiting'){
      const pane=card.querySelector(':scope > .inside') || card;
      let board=pane.querySelector(':scope > #game');
      if(!board){
        const focus=pane.contains(document.activeElement)?document.activeElement:null;
        board=document.createElement('div');
        board.id='game';
        for(const child of [...pane.children])if(!child.matches('.topline,.table-heading'))board.append(child);
        pane.append(board);
        if(focus?.isConnected)focus.focus({preventScroll:true});
      }
      pane.querySelector(':scope > .topline')?.remove();
      if(!card.querySelector(':scope > .table-heading')){
        const title=window.DrinkingGameGuides?.[kind]?.title || document.querySelector('header strong')?.textContent || '';
        card.prepend(ui.heading(kind,title,state.players?.length??0));
      }
      if(phase==='done'&&Number.isInteger(state.hostSeat))ui.result(board,state.players[state.hostSeat]);
    }
    const root = view.querySelector('#game') || view.querySelector('.inside') || view.querySelector('.card') || view;
    const urgent = (['bomb', 'initial'].includes(kind) && phase === 'active') ||
      (kind === 'bottle' && ['spinning', 'braking'].includes(phase)) ||
      (kind === 'stopwatch' && phase === 'measure');
    presentation.update({phase, roundKey, urgent,
      result: phase === 'done' ? {key: roundKey + '/done', ...resultCopy(kind, root, 'h1', state)} : null});
  }

  function local(kind, round, app) {
    const presentation = window.DrinkingPresentation;
    if (!presentation || !app) return;
    presentation.enter(kind, {local: true});
    const phase = round?.phase || 'intro';
    let mark;
    if (round) {
      mark = localRounds.get(round);
      if (!mark) {
        mark = {id: ++sequence, phase: null, results: 0};
        localRounds.set(round, mark);
      }
      // Bottle can be spun again using the same round object.
      if (phase === 'done' && mark.phase !== 'done') mark.results++;
      mark.phase = phase;
    }
    const roundKey = ['local', kind, mark?.id || 'intro'].join('/');
    const root = app.querySelector('.play-body') || app;
    const urgent = ['initial-live', 'watch-running', 'spinning', 'braking'].includes(phase) ||
      (kind === 'bomb' && phase === 'play');
    presentation.update({phase, roundKey, urgent,
      result: phase === 'done' ? {key: roundKey + '/done/' + mark.results,
        ...resultCopy(kind, root, 'h2', round)} : null});
  }

  window.DrinkingGameScreen = Object.freeze({native, local});
})();
