import {createRoot} from "react-dom/client";
import StationApp from "./app/station-app";
const root=createRoot(document.getElementById("station")!);
root.render(<StationApp initialDay={window.pajangState.day} initialStation={window.pajangState} initialView={new URLSearchParams(location.search).get("view")==="radar"?"radar":"cards"}/>);
