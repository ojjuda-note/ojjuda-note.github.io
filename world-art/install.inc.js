/* Installed inside World's module, after all catalog renderer extensions. */
{
  const originalArt = { Re: { ...Re }, $r: { ...$r }, Ue, Tl, ab, Od, N2 };
  try {
    const avatarArt = window.OjjudaAvatarArt.install({ Ue, jm, Im, Om, Pm, Nm, pe, ye, N2 });
    const furnitureArt = window.OjjudaFurnitureArt.install({ Re, $r, q, jo, Li, F1, Qt, _, n, Nn, V, T, Sb, y, s1, er });
    const petRenderers = window.OjjudaPetArt.install({ Re: furnitureArt.Re, q, jo, n, y });
    const roomArt = window.OjjudaRoomArt.install({ Tl, ab, ob, rb, _, n, Nn, T, y, rt, it, re, vo: () => vo(), ae, q, jo });
    if (typeof avatarArt.Ue !== 'function' || typeof roomArt.Tl !== 'function') throw new Error('World art renderer is missing');
    for (const [id, item] of Object.entries(q)) {
      // Catalog data and saved state remain owned by the original application.
      const mapping = item.kind === 'wall' ? furnitureArt.$r : petRenderers;
      if (!mapping || typeof mapping[jo(id)] !== 'function') throw new Error('World art catalog is incomplete: ' + id);
    }
    Ue = avatarArt.Ue;
    Re = petRenderers;
    $r = furnitureArt.$r;
    Tl = roomArt.Tl;
    ab = roomArt.ab || ab;
    if (avatarArt.N2) N2 = avatarArt.N2;
    if (typeof window.OjjudaPetArt.enhanceCareScene === 'function') {
      Od = item => window.OjjudaPetArt.enhanceCareScene(originalArt.Od(item));
    }
    window.OjjudaWorldArtStatus = Object.freeze({ version: '2026-09-28.1', ready: true });
    document.documentElement.dataset.worldArt = '2026-09-28.1';
  } catch (error) {
    ({ Re, $r, Ue, Tl, ab, Od, N2 } = originalArt);
    window.OjjudaWorldArtStatus = Object.freeze({ version: '2026-09-28.1', ready: false });
    document.documentElement.dataset.worldArt = 'fallback';
    console.error('World artwork could not be initialized', error);
  }
}
