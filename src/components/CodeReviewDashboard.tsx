import React from "react";

interface Props {
  report: any;
}

const CodeReviewDashboard: React.FC<Props> = ({ report }) => {
  if (!report) return null;
  return (
    <div className="p-3 bg-white/5 rounded-lg border border-white/10 text-xs font-mono">
      <pre>{JSON.stringify(report, null, 2)}</pre>
    </div>
  );
};

export default CodeReviewDashboard;
