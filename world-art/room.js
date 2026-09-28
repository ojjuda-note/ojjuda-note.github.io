/* Ojjuda World room materials. Keeps the editable isometric room geometry. */
(function (root) {
  "use strict";

  let sequence = 0;
  const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
  const round = (value) => Math.round(value * 100) / 100;
  const points = (vertices) => vertices.map(([x, y]) => `${round(x)},${round(y)}`).join(" ");
  const polygon = (vertices, fill, attributes = "") => `<polygon points="${points(vertices)}" fill="${fill}" ${attributes}/>`;
  const line = (a, b, attributes) => `<path d="M${round(a[0])} ${round(a[1])}L${round(b[0])} ${round(b[1])}" ${attributes}/>`;
  const shade = (hex, amount) => {
    let value = String(hex || "#eee6dc").replace(/^#/, "");
    if (value.length === 3) value = value.split("").map((c) => c + c).join("");
    const rgb = parseInt(value, 16);
    const target = amount < 0 ? 0 : 255;
    return "#" + [16, 8, 0].map((shift) => {
      const channel = (rgb >> shift) & 255;
      return Math.round(channel + (target - channel) * Math.abs(amount)).toString(16).padStart(2, "0");
    }).join("");
  };

  function install(source) {
    if (!source || typeof source.Tl !== "function") throw new TypeError("Room renderer is required");
    const project = source._ || ((x, y, z = 0) => [200 + (x - y) * 24, 170 + (x + y) * 12 - z]);
    const color = source.y || shade;
    const wallPattern = source.ob || (() => "");
    const floorPattern = source.rb || (() => "");
    const roomSize = finite(source.rt, 8);
    const wallHeight = finite(source.it, 150);
    const wallThickness = finite(source.re, .3);
    const surfaces = source.ae || {};
    const catalog = source.q || {};
    const baseType = source.jo || ((type) => catalog[type]?.base || type);
    const timeOfDay = () => typeof source.vo === "function" ? source.vo() : "day";

    const quad = (vertices, fill, attributes) => polygon(vertices.map((v) => project(...v)), fill, attributes);
    const gradient = (id, stops, attributes = 'x1="0" y1="0" x2=".75" y2="1"') =>
      `<linearGradient id="${id}" ${attributes}>${stops.map(([offset, fill, opacity]) => `<stop offset="${offset}" stop-color="${fill}"${opacity == null ? "" : ` stop-opacity="${opacity}"`}/>`).join("")}</linearGradient>`;

    function woodGrain(size, floorColor, uid) {
      let result = `<g clip-path="url(#${uid}-floor-clip)" pointer-events="none">`;
      // Every board keeps the original half-grid plank orientation and staggered joints.
      for (let row = 0; row < size * 2; row++) {
        const y = row / 2;
        const tint = row % 4 === 0 ? color(floorColor, .16) : row % 3 === 0 ? color(floorColor, -.10) : color(floorColor, .055);
        result += quad([[0,y,.015],[size,y,.015],[size,y+.5,.015],[0,y+.5,.015]], tint, `opacity="${row % 4 === 0 ? .23 : .17}"`);
        result += line(project(0,y,.025), project(size,y,.025), `stroke="${color(floorColor,.52)}" stroke-opacity=".35" stroke-width=".52" fill="none"`);
        for (let strand = 0; strand < 3; strand++) {
          const offset = .08 + strand * .135;
          const start = project(.035,y+offset,.03);
          const middle = project(size*.47,y+offset+.018*Math.sin(row+strand),.03);
          const end = project(size-.035,y+offset,.03);
          result += `<path d="M${points([start])}Q${points([middle])} ${points([end])}" fill="none" stroke="${color(floorColor,strand===1?.34:-.20)}" stroke-opacity="${strand===1?.2:.15}" stroke-width="${strand===1?.38:.26}"/>`;
        }
        // Small, varied elongated knots avoid an artificial repeating noise filter.
        if (row % 3 === 1) {
          const x = .85 + ((row * 1.79) % Math.max(1, size - 1.7));
          const y0 = y + .25;
          const start = project(x-.22,y0,.04), middle = project(x,y0+.055,.04), end = project(x+.36,y0,.04), other = project(x,y0-.055,.04);
          result += `<path d="M${points([start])}Q${points([middle])} ${points([end])}Q${points([other])} ${points([start])}" fill="none" stroke="${color(floorColor,-.28)}" stroke-opacity=".14" stroke-width=".3"/>`;
        }
      }
      return result + "</g>";
    }

    function fabricTexture(size, uid, material) {
      const dots = material === "carpet" || material === "cork";
      if (!dots) return "";
      const origin = project(0,0), x = project(1,0), y = project(0,1);
      const transform = `matrix(${(x[0]-origin[0])/32} ${(x[1]-origin[1])/32} ${(y[0]-origin[0])/32} ${(y[1]-origin[1])/32} ${origin[0]} ${origin[1]})`;
      // A tiled weave avoids hundreds of extra SVG nodes on each room redraw.
      return `<defs><pattern id="${uid}-weave" patternUnits="userSpaceOnUse" width="9" height="9" patternTransform="${transform}"><path d="M1 1h2M5 5h2" stroke="#fff" stroke-width=".7"/><path d="M2 6h2M6 2h2" stroke="#46362f" stroke-width=".6"/></pattern></defs>`+quad([[0,0,.03],[size,0,.03],[size,size,.03],[0,size,.03]],`url(#${uid}-weave)`,'opacity=".13" pointer-events="none"');
    }

    function windowLight(room, size, uid, period) {
      if (period === "night" || room.walls === false) return "";
      const windows = (room.items || room.props || []).filter((item) => {
        const type = baseType(item.type);
        return type === "window" || type === "curtainwindow" || /window/.test(type || "");
      });
      if (!windows.length) return "";
      const opacity = period === "evening" ? .08 : period === "morning" ? .17 : .14;
      let result = `<g clip-path="url(#${uid}-floor-clip)" pointer-events="none" opacity="${opacity}">`;
      for (const item of windows.slice(0, 4)) {
        const position = finite(item.t, size*.55);
        for (let pane=0; pane<2; pane++) {
          const start = position-1.23 + pane*1.30;
          const local = [[start+.12,.45],[start+1.17,.45],[start+.38,3.25],[start-.67,3.25]];
          const vertices = local.map(([along,inward]) => item.wall === "L" ? [inward,along,.08] : [along,inward,.08]);
          result += quad(vertices, `url(#${uid}-sun)`);
        }
      }
      return result + "</g>";
    }

    function renderRoom(room) {
      if (!room || !room.floorColor || (room.walls !== false && !room.wall)) return source.Tl(room);
      const size = finite(room.n, roomSize), walls = room.walls !== false;
      if (size <= 0 || size > 32) return source.Tl(room);
      const uid = `oj-room-${++sequence}`;
      const period = room.artTime || timeOfDay();
      const night = period === "night";
      const ambient = night ? .035 : period === "evening" ? .055 : .085;
      const floor = room.floorColor, wall = room.wall || "#eee6dc";
      const thickness = walls ? -wallThickness : 0;
      const floorVertices = [[0,0,0],[size,0,0],[size,size,0],[0,size,0]];
      const material = surfaces[room.fl]?.pat || room.floor;
      const leftWall = [[0,size,0],[0,0,0],[0,0,wallHeight],[0,size,wallHeight]];
      const rightWall = [[0,0,0],[size,0,0],[size,0,wallHeight],[0,0,wallHeight]];
      let result = `<defs>${gradient(`${uid}-wall-left`,[[0,color(wall,ambient*1.9)],[.65,wall],[1,color(wall,-.055)]])}${gradient(`${uid}-wall-right`,[[0,color(wall,.025)],[.55,color(wall,-.055)],[1,color(wall,-.105)]])}${gradient(`${uid}-floor`,[[0,color(floor,-.055)],[.45,color(floor,ambient*1.3)],[1,floor]],'x1=".1" y1="0" x2=".9" y2="1"')}${gradient(`${uid}-edge-left`,[[0,color(floor,-.20)],[1,color(floor,-.32)]])}${gradient(`${uid}-edge-right`,[[0,color(floor,-.29)],[1,color(floor,-.42)]])}${gradient(`${uid}-sun`,[[0,"#fff3d7",.08],[.3,"#fff7e1",.92],[1,"#fff8e9",.18]],'x1=".85" y1="0" x2=".15" y2="1"')}<clipPath id="${uid}-floor-clip">${quad(floorVertices,"#fff")}</clipPath></defs>`;

      // The actual floor silhouette, hit target and grid stay exactly in place.
      result += quad([[thickness,size,0],[size,size,0],[size,size,-14],[thickness,size,-14]],`url(#${uid}-edge-left)`);
      result += quad([[size,thickness,0],[size,size,0],[size,size,-14],[size,thickness,-14]],`url(#${uid}-edge-right)`);
      if (room.floor === "grass") {
        result += quad([[thickness,size,-5],[size,size,-5],[size,size,-14],[thickness,size,-14]],"#9C7555");
        result += quad([[size,thickness,-5],[size,size,-5],[size,size,-14],[size,thickness,-14]],"#7E5E45");
      }
      if (walls) {
        result += quad([[0,size,0],[0,size,wallHeight],[-wallThickness,size,wallHeight],[-wallThickness,size,0]],color(wall,-.15));
        result += quad([[size,0,0],[size,0,wallHeight],[size,-wallThickness,wallHeight],[size,-wallThickness,0]],color(wall,-.24));
        result += quad(leftWall,`url(#${uid}-wall-left)`)+quad(rightWall,`url(#${uid}-wall-right)`);
        result += wallPattern(room,size);
        // Soft contact depth at the shared corner, without a full-scene blur.
        for (let band=0; band<7; band++) {
          const width = .035+(band+1)*.027;
          result += quad([[0,0,7],[0,width,7],[0,width,wallHeight],[0,0,wallHeight]],"#58483f",`opacity="${.009+(6-band)*.0015}" pointer-events="none"`);
          result += quad([[0,0,7],[width,0,7],[width,0,wallHeight],[0,0,wallHeight]],"#58483f",`opacity="${.011+(6-band)*.0015}" pointer-events="none"`);
        }
        result += quad([[0,size,wallHeight],[0,0,wallHeight],[-wallThickness,-wallThickness,wallHeight],[-wallThickness,size,wallHeight]],color(wall,.43));
        result += quad([[0,0,wallHeight],[size,0,wallHeight],[size,-wallThickness,wallHeight],[-wallThickness,-wallThickness,wallHeight]],color(wall,.32));
        result += line(project(0,size,wallHeight),project(0,0,wallHeight),`stroke="${color(wall,.7)}" stroke-width=".65" fill="none" pointer-events="none"`);
        result += line(project(0,0,wallHeight),project(size,0,wallHeight),`stroke="${color(wall,.58)}" stroke-width=".65" fill="none" pointer-events="none"`);
        // A fine moulding cap and shaded skirting sit at the existing wall base.
        result += quad([[0,size,0],[0,0,0],[0,0,7],[0,size,7]],color(wall,-.115));
        result += quad([[0,0,0],[size,0,0],[size,0,7],[0,0,7]],color(wall,-.17));
        result += line(project(0,size,7),project(0,0,7),`stroke="${color(wall,.27)}" stroke-width=".9" fill="none" pointer-events="none"`);
        result += line(project(0,0,7),project(size,0,7),`stroke="${color(wall,.19)}" stroke-width=".9" fill="none" pointer-events="none"`);
      }
      result += quad(floorVertices,`url(#${uid}-floor)`,'data-floor="1"');
      if (material === "wood") result += woodGrain(size,floor,uid);
      result += `<g${material === "wood" ? ' opacity=".67"' : ""}>${floorPattern(room,size)}</g>`;
      result += fabricTexture(size,uid,material);
      if (walls) {
        // Ambient occlusion belongs beneath objects and stays visible after redecorating.
        for (let band=0; band<8; band++) {
          const width = .04+(band+1)*.035;
          result += quad([[0,0,.04],[size,0,.04],[size,width,.04],[0,width,.04]],"#493b38",`opacity="${.009+(7-band)*.001}" pointer-events="none"`);
          result += quad([[0,0,.04],[width,0,.04],[width,size,.04],[0,size,.04]],"#493b38",`opacity="${.007+(7-band)*.001}" pointer-events="none"`);
        }
      }
      result += windowLight(room,size,uid,period);
      // The front bevel makes the room read as a small solid model, not a flat tile.
      result += line(project(0,size,.1),project(size,size,.1),`stroke="${color(floor,.5)}" stroke-opacity=".7" stroke-width=".75" fill="none" pointer-events="none"`);
      result += line(project(size,size,.1),project(size,0,.1),`stroke="${color(floor,.32)}" stroke-opacity=".7" stroke-width=".7" fill="none" pointer-events="none"`);
      return result;
    }

    function lampGlow(x, y, rx, ry) {
      const uid = `oj-lamp-${++sequence}`;
      return `<defs><radialGradient id="${uid}"><stop offset="0" stop-color="#fff0ba" stop-opacity=".52"/><stop offset=".22" stop-color="#ffe6a2" stop-opacity=".30"/><stop offset=".56" stop-color="#ffe0a0" stop-opacity=".13"/><stop offset="1" stop-color="#ffe0a0" stop-opacity="0"/></radialGradient></defs><ellipse cx="${round(x)}" cy="${round(y)}" rx="${round(rx)}" ry="${round(ry)}" fill="url(#${uid})" pointer-events="none"/>`;
    }

    return { Tl: renderRoom, ab: lampGlow };
  }

  root.OjjudaRoomArt = Object.freeze({ install, version: "2026.09.28" });
})(typeof globalThis !== "undefined" ? globalThis : window);
