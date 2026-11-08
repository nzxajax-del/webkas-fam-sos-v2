import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("WEBKAS render error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="page-shell">
          <section className="panel" role="alert">
            <h1>WEBKAS mengalami kendala</h1>
            <p className="intro">
              Tampilan aplikasi gagal dimuat. Akun dan data Anda tidak dihapus
              atau diubah oleh proses pemulihan ini.
            </p>
            <button className="primary full" type="button" onClick={() => window.location.reload()}>
              MUAT ULANG APLIKASI
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById("root");

if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </React.StrictMode>
  );
}
