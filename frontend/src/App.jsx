import { useState } from "react";
import ViewToggle from "./components/ViewToggle";
import MockHIS from "./pages/MockHIS";
import AIDashboard from "./pages/AIDashboard";

function App() {
  const [view, setView] = useState("HIS");

  return (
    <div className="appContainer">
      <div style={{ textAlign: "center", padding: "16px 0" }}>
        <h2>AI-Driven Patient Flow Optimization</h2>
      </div>

      <ViewToggle view={view} setView={setView} />

      {view === "HIS" && <MockHIS />}
      {view === "AI" && <AIDashboard />}
    </div>
  );
}


export default App;
