import {createRoot} from "react-dom/client";
import {TeenCommunityPage} from "./app/teen-feed";

const mount=document.getElementById("teen-app");
if(!mount)throw Error("missing_teen_mount");
createRoot(mount).render(<TeenCommunityPage/>);
