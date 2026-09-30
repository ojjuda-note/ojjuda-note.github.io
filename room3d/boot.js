import('./engine.js?v=20260930-1').catch(error => { console.warn('Room 3D unavailable:', error.message); parent.postMessage({type:'ojjuda-room-error'},location.origin); });
