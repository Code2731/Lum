import React from "react";
import { ErrorBoundary } from "./ErrorBoundary";

interface InspectorTabPanelProps {
  id: string;
  tabId: string;
  label: string;
  children: React.ReactNode;
}

const InspectorTabPanel: React.FC<InspectorTabPanelProps> = ({
  id,
  tabId,
  label,
  children,
}) => (
  <section
    id={id}
    role="tabpanel"
    aria-labelledby={tabId}
    tabIndex={0}
  >
    <ErrorBoundary label={label}>
      {children}
    </ErrorBoundary>
  </section>
);

export default InspectorTabPanel;
