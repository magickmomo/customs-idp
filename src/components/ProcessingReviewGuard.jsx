function ProcessingReviewGuard({ onBack }) {
  return <section className="page-section"><div className="panel"><div className="eyebrow">Pack processing</div><h2>Documents are still being processed</h2><p>This pack will become available for review when extraction is complete.</p><button type="button" className="secondary" onClick={onBack}>Back to inbox</button></div></section>;
}

export { ProcessingReviewGuard };
