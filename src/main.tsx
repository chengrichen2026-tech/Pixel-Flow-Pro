import React from "react";
import ReactDOM from "react-dom/client";
import "@xyflow/react/dist/style.css";
import { ReactFlowProvider } from "@xyflow/react";
import "./styles.css";
import "./canvas-switcher.css";
import "./memory-feedback.css";
import { App, CanvasClipboardShortcuts } from "./App";
import { PixelFlowCodexBridge } from "./codex-bridge";

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><PixelFlowCodexBridge/><CanvasClipboardShortcuts/><ReactFlowProvider><App /></ReactFlowProvider></React.StrictMode>);
