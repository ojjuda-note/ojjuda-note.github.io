import {getReadingTheme} from './related-topics.mjs?v=20261120-saju-themes1';

// Related subjects read together inside their original product and period.
// Scene objects and source topics stay intact, including A/B and deep links.
export function arrangeRelatedReadings(scenes,{mode='general'}={}) {
  const contexts=new Map();
  for(const scene of scenes) {
    const contextKey=JSON.stringify([scene.domain,scene.period?.id||'']);
    if(!contexts.has(contextKey))contexts.set(contextKey,new Map());
    const themes=contexts.get(contextKey),theme=getReadingTheme(scene,{mode});
    scene.theme=theme;
    if(!themes.has(theme.id))themes.set(theme.id,{theme,domain:scene.domain,scenes:[]});
    themes.get(theme.id).scenes.push(scene);
  }
  const order=group=>group.domain==='lifelong'&&group.theme.id==='overview'?15:group.theme.order;
  return [...contexts.values()].flatMap(themes=>[...themes.values()]
    .sort((left,right)=>order(left)-order(right)).flatMap(group=>group.scenes));
}
