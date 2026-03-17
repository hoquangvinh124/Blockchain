import "@rainbow-me/rainbowkit/styles.css";
import "./index.css";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AppProviders } from "@/providers/AppProviders";

createRoot(document.getElementById("root")!).render(
  <AppProviders>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </AppProviders>
);

