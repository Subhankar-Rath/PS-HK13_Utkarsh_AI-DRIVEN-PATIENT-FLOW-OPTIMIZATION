import "../styles/toggle.css";

function ViewToggle({ view, setView }) {
  return (
    <div className="toggleContainer">
      <div className="toggle">
        <button
          className={view === "HIS" ? "active" : ""}
          onClick={() => setView("HIS")}
        >
           Mock HIS
        </button>

        <button
          className={view === "AI" ? "active" : ""}
          onClick={() => setView("AI")}
        >
           AI View
        </button>
      </div>
    </div>
  );
}

export default ViewToggle;
