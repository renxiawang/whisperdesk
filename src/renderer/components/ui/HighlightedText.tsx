import React from 'react';
import { annotateMedicalTerms } from '../../utils/medicalHighlight';

interface HighlightedTextProps {
  text: string;
  className?: string;
}

/**
 * Renders `text` with medical terms wrapped in a <mark> so they receive
 * the `.medical-term` highlight style.  Non-medical runs are emitted as
 * plain text nodes with no extra DOM nodes.
 */
function HighlightedText({ text, className }: HighlightedTextProps): React.JSX.Element {
  const segments = annotateMedicalTerms(text);
  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.isMedical ? (
          <mark
            key={i}
            className="medical-term"
            title={seg.gloss ? `医学术语 / Medical term: ${seg.gloss}` : 'Medical term'}
          >
            {seg.text}
            {seg.gloss && <span className="medical-term-zh">({seg.gloss})</span>}
          </mark>
        ) : (
          <React.Fragment key={i}>{seg.text}</React.Fragment>
        )
      )}
    </span>
  );
}

export { HighlightedText };
