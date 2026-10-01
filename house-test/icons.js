const paths={
 room:'<path d="M5 13V7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v6M5 11H3v8h18v-8h-2M5 13h14v3H5M6 19v2m12-2v2"/>',
 closet:'<path d="M9 6a3 3 0 1 1 5 2c-1 1-2 1-2 3l9 5v3H3v-3l9-5"/>',
 pet:'<ellipse cx="5" cy="8" rx="2" ry="3"/><ellipse cx="10" cy="5" rx="2" ry="3"/><ellipse cx="16" cy="5" rx="2" ry="3"/><ellipse cx="21" cy="9" rx="2" ry="3"/><path d="M7 14c3-6 7-6 10 0 4 5 0 8-4 5-4 3-10 0-6-5Z"/>',
 diary:'<rect x="5" y="3" width="15" height="19" rx="2"/><path d="M9 3v19M3 7h4m-4 5h4m-4 5h4m5-9h5m-5 4h5"/>',
 ball:'<circle cx="12" cy="12" r="9"/><path d="M4 6c9-1 6 12 16 12M17 4c-9 6-3 13-10 16"/>',
 heart:'<path d="M12 21C-7 8 5-3 12 6c7-9 19 2 0 15Z"/>',
 follow:'<path d="M3 18h5c5 0 0-12 5-12h8m-4-4 4 4-4 4"/>'
};
export const icon=name=>`<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.room}</svg>`;
