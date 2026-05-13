import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { I18nProvider } from "./i18n";
import { WalletProviders } from "./providers";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <WalletProviders>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </WalletProviders>
    </I18nProvider>
  </React.StrictMode>,
);
