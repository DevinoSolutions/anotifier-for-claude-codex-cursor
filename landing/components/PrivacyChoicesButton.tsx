"use client";

import { reopenConsentPrompt } from "@/lib/consent";

/** Footer control that opens the analytics consent prompt again, so a visitor
    can change their mind. Styled like the footer links around it. */
export default function PrivacyChoicesButton() {
  return (
    <button type="button" className="linkBtn" onClick={reopenConsentPrompt}>
      privacy choices
    </button>
  );
}
