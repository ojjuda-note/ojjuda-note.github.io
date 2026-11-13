// unchanged production source at line 1
      bar.append(close);
      frame = document.createElement('iframe');
      // Reopening must fetch current HTML; round rules still come from the server.
      const params = new URLSearchParams({ v: '20261112-arcade-entry-return1', open: String(Date.now()) });
      if(/^[A-Fa-f0-9]{8}$/.test(options.inviteCode||''))params.set('friend_code',options.inviteCode);
      if (/^[0-9a-f-]{36}$/i.test(options.roomId || '')) params.set('room_id', options.roomId);
      if (/^[0-9]+$/.test(String(options.roomNo || ''))) params.set('room_no', options.roomNo);
// unchanged production source at line 139
