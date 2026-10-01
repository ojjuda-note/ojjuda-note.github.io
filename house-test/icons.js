const paths={
 room:'<path d="M5 13V7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v6M5 11H3v8h18v-8h-2M5 13h14v3H5M6 19v2m12-2v2"/>',
 diary:'<rect x="5" y="3" width="15" height="19" rx="2"/><path d="M9 3v19M3 7h4m-4 5h4m-4 5h4m5-9h5m-5 4h5"/>'
};
export const icon=name=>`<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.room}</svg>`;
