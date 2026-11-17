import {createRoot} from "react-dom/client";
import StationApp from "./app/station-app";
import {koreaDay} from "./lib/station";

const entry = document.getElementById("station")!;
const initialView = new URLSearchParams(location.search).get("view") === "radar" ? "radar" : "cards";
createRoot(entry).render(<StationApp initialDay={koreaDay()} initialView={initialView} memberHome="https://pajang-radio-date.mj830417686850.chatgpt.site/"/>);

if (window.parent !== window) {
  window.addEventListener("keydown", event => {
    if (event.key === "Escape" && !event.defaultPrevented && !document.querySelector("dialog[open]")) {
      event.preventDefault();
      window.parent.postMessage("pajang:close", location.origin);
    }
  });
}
