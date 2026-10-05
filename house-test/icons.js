const paths={
 room:'<path d="M5 13V7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v6M5 11H3v8h18v-8h-2M5 13h14v3H5M6 19v2m12-2v2"/>',
 diary:'<rect x="5" y="3" width="15" height="19" rx="2"/><path d="M9 3v19M3 7h4m-4 5h4m-4 5h4m5-9h5m-5 4h5"/>',
 settings:'<path d="m9 3-.6 2.3-2 .9L4.3 5.5 2 9.5l1.7 1.6v1.8L2 14.5l2.3 4 2.1-.7 2 .9L9 21h6l.6-2.3 2-.9 2.1.7 2.3-4-1.7-1.6v-1.8L22 9.5l-2.3-4-2.1.7-2-.9L15 3Z"/><circle cx="12" cy="12" r="3"/>',
 refresh:'<path d="M20 7v5h-5 M4 17v-5h5 M6.1 6.1A8 8 0 0 1 19.5 9 M4.5 15a8 8 0 0 0 13.4 2.9"/>'
};
export const icon=name=>`<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.room}</svg>`;
