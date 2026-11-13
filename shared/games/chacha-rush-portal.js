// unchanged production source at line 1
      respond(session, data.nonce, 'connected', { signedIn: !!session.owner && session.owner === currentOwner() });
      return;
    }
    if (data.action === 'exit') {
      activeClose?.();
      onReturn?.();
      return;
    }
    if (data.action === 'ranking') {
      activeClose?.();
      location.assign('/features/arcade/monthly-ranking.html?game=chacha_rush');
// unchanged production source at line 92
