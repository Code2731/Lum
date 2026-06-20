import React from "react";

const MockInspectorPanel: React.FC<Record<string, any>> = () => {
  return React.createElement("section", { "data-testid": "inspector-mock" },
    React.createElement("div", { role: "tablist", "aria-label": "Inspector 탭" })
  );
};

export default MockInspectorPanel;
