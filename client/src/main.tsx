import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { SessionProvider } from "./SessionContext";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SessionProvider>
      <App />
    </SessionProvider>
  </React.StrictMode>
);
