import {createRoot} from "react-dom/client";
import StationApp from "./app/station-app";

const root=createRoot(document.getElementById("station")!);
const initialStation=window.pajangState;
const initialView=new URLSearchParams(location.search).get("view")==="radar"?"radar":"cards";
function render(){root.render(<StationApp initialStation={initialStation} initialView={initialView}/>);}
let frame=0;
window.addEventListener("pajang-art-ready",()=>{
  if (!frame) frame=window.requestAnimationFrame(()=>{frame=0;render();});
});
render();
