import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initAppTheme } from "./theme/appTheme";
import "./theme/app.css";

initAppTheme();

createRoot(document.getElementById("root")!).render(<App />);
