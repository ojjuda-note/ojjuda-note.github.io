"use strict";

// Draw in CSS pixels so the sun, moon and small details stay round on every panel size.
var paintClockScenery = (() => {
  const palettes = {
    dawn: {
      sky:["#25254e","#75659a","#e8acb5"], glow:"#ffbdc9", light:"#fff1d8", starlight:"#e5dcff",
      hills:["#967d9f","#75668e","#554d76"], shore:"#30334e",
      water:["#756581","#4d496d"], reflection:"#ffd2d6", orb:[.84,.34]
    },
    morning: {
      sky:["#506a94","#a7b9cf","#ffe1ac"], glow:"#ffd481", light:"#ffc159", starlight:"#fff3da",
      hills:["#bba6a3","#8e929c","#697b8a"], shore:"#37495d",
      water:["#9ca9ad","#637a8e"], reflection:"#ffe5b9", orb:[.84,.48]
    },
    noon: {
      sky:["#82c8ed","#b9e6f4","#ffefc8"], glow:"#ffe299", light:"#ffb633", starlight:"#ffffff",
      hills:["#83a9b3","#63879e","#4a6d88"], shore:"#2b425f",
      water:["#75a6ae","#4f7897"], reflection:"#fff0bf", orb:[.145,.29]
    },
    evening: {
      sky:["#35264e","#9b628f","#ffaf90"], glow:"#ffc18e", light:"#ffe2a8", starlight:"#f5d6fc",
      hills:["#bd879c","#946b8b","#705b7b"], shore:"#443a58",
      water:["#ac879e","#675979"], reflection:"#ffdbca", orb:[.85,.545]
    },
    night: {
      sky:["#121930","#292f57","#655583"], glow:"#bccdff", light:"#fff1d4", starlight:"#d8e0ff",
      hills:["#544872","#423f62","#323654"], shore:"#22293f",
      water:["#4d4969","#2b3455"], reflection:"#c7c4ee", orb:[.845,.34]
    }
  };
  const states = new WeakMap();
  const stars = [
    [.035,.23,.55],[.05,.38,1],[.077,.31,.46],[.103,.12,.57],[.13,.20,.64],
    [.17,.39,.55],[.188,.15,.7],[.218,.34,.44],[.23,.29,1],[.276,.22,.53],
    [.32,.17,.55],[.34,.35,.62],[.40,.22,.39],[.48,.13,.56],[.55,.33,.46],
    [.58,.28,.55],[.65,.35,.6],[.68,.20,.9],[.71,.10,.43],[.74,.39,.7],
    [.78,.26,.57],[.80,.16,.6],[.86,.22,.51],[.90,.45,.8],[.92,.19,.5],
    [.95,.28,1],[.978,.39,.46]
  ];
  // Each skyline is hand-placed. Ridges are higher near the edges, framing the dial.
  const ranges = [
    [[0,.62],[.055,.57],[.11,.59],[.17,.495],[.21,.55],[.25,.54],[.32,.66],[.39,.62],[.47,.69],[.57,.60],[.63,.63],[.72,.52],[.75,.57],[.80,.55],[.84,.585],[.89,.50],[.94,.55],[1,.48]],
    [[0,.67],[.065,.63],[.12,.665],[.18,.60],[.24,.63],[.32,.705],[.40,.66],[.52,.71],[.59,.64],[.65,.68],[.73,.62],[.79,.67],[.84,.65],[.91,.59],[.96,.615],[1,.58]],
    [[0,.69],[.07,.705],[.145,.74],[.22,.70],[.32,.745],[.42,.755],[.49,.73],[.56,.755],[.65,.705],[.73,.73],[.82,.685],[.90,.70],[.96,.66],[1,.675]]
  ];
  const seaLevel = .795;

  function ridge(ctx, width, height, points, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, height * seaLevel);
    ctx.lineTo(0, points[0][1] * height);
    for (let i = 1; i < points.length - 1; i++) {
      const [x,y] = points[i], next = points[i+1];
      ctx.quadraticCurveTo(x * width, y * height,
        (x + next[0]) * width / 2, (y + next[1]) * height / 2);
    }
    ctx.lineTo(width, points[points.length-1][1] * height);
    ctx.lineTo(width, height * seaLevel);
    ctx.closePath();
    ctx.fill();
  }

  function crescent(ctx, x, y, radius, color) {
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(-.34);
    ctx.scale(radius,radius);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(.28,-1);
    ctx.bezierCurveTo(-1.12,-.96,-1.34,.76,-.04,.98);
    ctx.bezierCurveTo(.39,1.06,.71,.91,.91,.69);
    ctx.bezierCurveTo(-.13,.90,-.69,-.29,.28,-1);
    ctx.fill();
    ctx.restore();
  }

  function sun(ctx, x, y, radius, color) {
    ctx.save();
    ctx.translate(x,y);
    ctx.lineCap="round";
    ctx.lineWidth=radius*.14;
    ctx.strokeStyle=color;
    ctx.beginPath();
    for(let ray=0;ray<10;ray++) {
      const angle=ray*Math.PI/5-Math.PI/2;
      const dx=Math.cos(angle),dy=Math.sin(angle);
      ctx.moveTo(dx*radius*1.23,dy*radius*1.23);
      ctx.lineTo(dx*radius*1.66,dy*radius*1.66);
    }
    ctx.stroke();
    const sunlight=ctx.createLinearGradient(0,-radius,0,radius);
    sunlight.addColorStop(0,"#ffe48a");
    sunlight.addColorStop(1,color);
    ctx.fillStyle=sunlight;
    ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }

  function deepSky(ctx, width, height, unit, palette, phase) {
    ctx.save();
    // Dust and orbital paths occupy the upper sky, fading before the central dial.
    const glow = ctx.createRadialGradient(width*.89,height*.34,0,width*.89,height*.34,width*.39);
    glow.addColorStop(0,palette.starlight+"20");
    glow.addColorStop(.6,palette.starlight+"0b");
    glow.addColorStop(1,palette.starlight+"00");
    ctx.fillStyle=glow;
    ctx.fillRect(0,0,width,height*seaLevel);
    const shimmer=ctx.createLinearGradient(0,0,width,0);
    shimmer.addColorStop(0,palette.starlight+"18");
    shimmer.addColorStop(.13,palette.starlight+"70");
    shimmer.addColorStop(.47,palette.starlight+"0a");
    shimmer.addColorStop(.78,palette.starlight+"48");
    shimmer.addColorStop(1,palette.starlight+"20");
    ctx.strokeStyle=shimmer;
    for(const offset of [0,.024]) {
      ctx.lineWidth=(offset?.45:.75)*unit;
      ctx.beginPath();
      ctx.moveTo(-width*.08,height*(.49+offset));
      ctx.bezierCurveTo(width*.29,height*(.49+offset),width*.86,height*(.17+offset),width*1.11,-height*.10);
      ctx.stroke();
    }
    ctx.fillStyle=palette.starlight;
    const intensity=phase==="night"?1:.81;
    for(const [sx,sy,radius] of stars) {
      ctx.globalAlpha=intensity*(.3+radius*.6);
      ctx.beginPath();ctx.arc(sx*width,sy*height,radius*unit,0,Math.PI*2);ctx.fill();
      if(radius<1) continue;
      // One very fine diffraction spike on either side of the clock window.
      ctx.strokeStyle=palette.starlight;ctx.lineWidth=.65*unit;
      ctx.beginPath();ctx.moveTo(sx*width,sy*height-2.6*unit);ctx.lineTo(sx*width,sy*height+2.6*unit);
      ctx.moveTo(sx*width-1.9*unit,sy*height);ctx.lineTo(sx*width+1.9*unit,sy*height);ctx.stroke();
    }
    ctx.restore();
  }

  function cloud(ctx, x, y, size, color, alpha) {
    ctx.save();
    ctx.translate(x,y);
    ctx.scale(size,size);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-30,2);
    ctx.quadraticCurveTo(-25,-1,-16,0);
    ctx.quadraticCurveTo(-12,-7,-5,-4);
    ctx.bezierCurveTo(0,-13,11,-13,14,-5);
    ctx.quadraticCurveTo(24,-6,28,0);
    ctx.quadraticCurveTo(37,0,40,2);
    ctx.quadraticCurveTo(5,4,-30,2);
    ctx.fill();
    ctx.restore();
  }

  function pine(ctx, x, y, size, color) {
    ctx.save();
    ctx.translate(x,y);
    ctx.scale(size,size);
    ctx.strokeStyle = ctx.fillStyle = color;
    ctx.lineCap = "round";
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(-3,0);ctx.quadraticCurveTo(-4,-9,0,-14);ctx.quadraticCurveTo(3,-18,0,-25);
    ctx.moveTo(-1,-12);ctx.quadraticCurveTo(-8,-13,-11,-20);
    ctx.moveTo(1,-17);ctx.quadraticCurveTo(10,-16,12,-23);
    ctx.stroke();
    // Flattened, tiered canopies recall the coastal Korean red pine.
    for (const [cx,cy,r] of [[-10,-20,7],[11,-23,6.5],[0,-26,9]]) {
      ctx.beginPath();ctx.moveTo(cx-r,cy+.5);
      ctx.bezierCurveTo(cx-r*.8,cy-2,cx-r*.64,cy-3,cx-r*.38,cy-2.6);
      ctx.bezierCurveTo(cx,cy-6,cx+r*.34,cy-4,cx+r*.46,cy-3.3);
      ctx.quadraticCurveTo(cx+r*.86,cy-3.2,cx+r,cy+.3);
      ctx.quadraticCurveTo(cx+r*.37,cy+1.8,cx-r*.25,cy+.6);
      ctx.lineTo(cx-r,cy+.5);ctx.fill();
    }
    ctx.restore();
  }

  function render(canvas, state) {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width*scale), pixelHeight = Math.round(height*scale);
    if (state.drawn === state.phase && canvas.width === pixelWidth && canvas.height === pixelHeight) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    ctx.setTransform(pixelWidth/width,0,0,pixelHeight/height,0,0);
    const phase = state.phase, p = palettes[phase], unit = Math.min(width / 385, height / 240, 1.45);
    const x = width*p.orb[0], y = height*p.orb[1], night = phase === "night", dawn = phase === "dawn";
    const sky = ctx.createLinearGradient(0,0,0,height*seaLevel);
    sky.addColorStop(0,p.sky[0]);sky.addColorStop(.65,p.sky[1]);sky.addColorStop(1,p.sky[2]);
    ctx.fillStyle = sky;ctx.fillRect(0,0,width,height);

    const daylight=phase==="morning" || phase==="noon";
    if(!daylight) deepSky(ctx,width,height,unit,p,phase);
    const radius = (night ? 12 : dawn ? 9.5 : phase === "evening" ? 16 : 13) * unit;
    const halo = ctx.createRadialGradient(x,y,radius*.6,x,y,radius*3.8);
    halo.addColorStop(0,p.glow+(night?"26":"72"));halo.addColorStop(1,p.glow+"00");
    ctx.fillStyle=halo;ctx.fillRect(x-radius*4,y-radius*4,radius*8,radius*8);
    if (night || dawn) {
      crescent(ctx,x,y,radius,p.light);
    } else {
      if(daylight) sun(ctx,x,y,radius,p.light);
      else {ctx.fillStyle=p.light;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();}
      cloud(ctx,width*(phase==="noon"?.81:.115),height*.42,unit*.72,p.starlight,.52);
      cloud(ctx,width*(phase==="noon"?.88:.18),height*.48,unit*.42,p.starlight,.32);
    }
    ranges.forEach((points,i) => ridge(ctx,width,height,points,p.hills[i]));
    const horizon = height*seaLevel, sea = ctx.createLinearGradient(0,horizon,0,height);
    sea.addColorStop(0,p.water[0]);sea.addColorStop(1,p.water[1]);
    ctx.fillStyle=sea;ctx.fillRect(0,horizon,width,height-horizon);
    ctx.lineCap="round";
    ctx.strokeStyle=p.reflection;
    for (let i=0;i<7;i++) {
      const ry=horizon+(2+i*3+i*i*.24)*unit;
      const rx=x+Math.sin(i*2)*3*unit, half=(2.5+i*1.65)*unit;
      ctx.lineWidth=(i<3?.7:1)*unit;ctx.globalAlpha=.66-i*.045;
      ctx.beginPath();ctx.moveTo(rx-half,ry);ctx.lineTo(rx+half,ry);ctx.stroke();
    }
    ctx.globalAlpha=.5;ctx.lineWidth=.8*unit;
    for (const [rx,ry,l] of [[.04,.90,.045],[.18,.865,.06],[.12,.96,.075],[.28,.945,.025],[.73,.85,.04],[.83,.96,.075],[.92,.9,.05],[.53,.97,.045]]) {
      ctx.beginPath();ctx.moveTo(width*rx,height*ry);ctx.lineTo(width*(rx+l),height*ry);ctx.stroke();
    }
    ctx.globalAlpha=1;ctx.fillStyle=p.shore;
    ctx.beginPath();ctx.moveTo(0,height*.767);ctx.quadraticCurveTo(width*.075,height*.772,width*.117,height*.8);
    ctx.quadraticCurveTo(width*.159,height*.819,width*.222,height*.826);ctx.quadraticCurveTo(width*.11,height*.844,0,height*.836);
    ctx.closePath();ctx.fill();
    pine(ctx,width*.09,height*.793,unit*.84,p.shore);
    pine(ctx,width*.043,height*.779,unit*.51,p.shore);
    ctx.beginPath();ctx.moveTo(width*.80,height*.822);
    ctx.quadraticCurveTo(width*.84,height*.816,width*.868,height*.806);
    ctx.quadraticCurveTo(width*.893,height*.799,width*.915,height*.816);
    ctx.quadraticCurveTo(width*.95,height*.82,width*.961,height*.824);
    ctx.quadraticCurveTo(width*.889,height*.828,width*.80,height*.822);ctx.fill();
    state.drawn = phase;
  }

  return function paintClockScenery(canvas, phase) {
    let state = states.get(canvas);
    if (!state) {
      state = {phase:"noon", drawn:null};
      states.set(canvas,state);
      if (typeof ResizeObserver !== "undefined") {
        state.observer = new ResizeObserver(() => render(canvas,state));
        state.observer.observe(canvas);
      }
    }
    state.phase = Object.prototype.hasOwnProperty.call(palettes,phase) ? phase : "noon";
    render(canvas,state);
  };
})();
