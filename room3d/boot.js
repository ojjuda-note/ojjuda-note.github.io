// Set the backdrop before the renderer loads; other views keep their own surfaces.
const requestedView = new URLSearchParams(location.search).get('view');
document.documentElement.dataset.view = ['avatar', 'pet', 'portrait', 'place'].includes(requestedView) ? requestedView : 'room';
import('./engine.js?v=20261001-wardrobe1').catch(error => { console.warn('Room 3D unavailable:', error.message); parent.postMessage({type:'ojjuda-room-error'},location.origin); });
