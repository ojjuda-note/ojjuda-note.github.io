// This only controls the entry link. Every administrator operation is checked by the server again.
export function watchAdminAccess(db, authUserId, onChange) {
  let active = true, revision = 0, timer;
  const own = user => Boolean(authUserId) && user?.id === authUserId && !user.is_anonymous;
  async function verify() {
    if (!active) return;
    const request = ++revision;
    const current = () => active && request === revision;
    onChange(false);
    try {
      const session = await db.auth.getSession();
      if (!current() || session.error || !own(session.data?.session?.user)) return;
      const identity = await db.auth.getUser(session.data.session.access_token);
      if (!current() || identity.error || !own(identity.data?.user)) return;
      // is_admin reads the server-owned administrator list, never editable user metadata.
      const result = await db.rpc('is_admin');
      if (!current() || result.error || result.data !== true) return;
      const latest = await db.auth.getSession();
      if (current() && !latest.error && own(latest.data?.session?.user)) onChange(true);
    } catch { /* A failed or interrupted check keeps the administrator entry hidden. */ }
  }
  const { data } = db.auth.onAuthStateChange((_event, session) => {
    if (!active) return;
    revision++;
    onChange(false);
    clearTimeout(timer);
    // Do not call another Auth operation while its callback is running.
    if (own(session?.user)) timer = setTimeout(() => void verify(), 0);
  });
  void verify();
  return () => {
    active = false;
    revision++;
    clearTimeout(timer);
    data?.subscription?.unsubscribe();
  };
}
