import { Link } from "react-router-dom";

/** TermsPage (Plan 73; Lamplit tokens in Plan 123) — plain-language terms, content rights, privacy. */
const CSS = `
.tm { max-width: 760px; margin: 0 auto; padding: 2.5rem 1.3rem 5rem; color: var(--text2); font-family: var(--font-ui); line-height: 1.6; }
.tm h1 { font-family: var(--font-story); font-weight: 700; color: var(--text); font-size: clamp(1.9rem, 6vw, 2.4rem); line-height: 1.15; margin: 0 0 0.6rem; }
.tm h2 { color: var(--text); font-size: 1.15rem; font-weight: 600; margin: 1.8rem 0 0.4rem; }
.tm a { color: var(--accent-text); }
.tm .back { display: inline-flex; align-items: center; min-height: 44px; margin: -0.6rem 0 0.4rem; }
`;

export default function TermsPage() {
  return (
    <div className="tm">
      <style>{CSS}</style>
      <Link className="back" to="/welcome">&larr; QuestLab</Link>
      <h1>Terms &amp; privacy</h1>
      <p>Short version: your campaigns are yours, upload only what you have rights to, and we store the minimum needed to keep your account yours.</p>

      <h2>Your content</h2>
      <p>Everything you create or upload — campaigns, characters, maps, notes, art you upload — belongs to you. QuestLab stores it to run your table and never sells, shares, or trains on it.</p>

      <h2>Map and image rights</h2>
      <p>You may only upload maps and images you own or are licensed to use at your own table (your own work, personal-use map packs you bought or back, free maps under their terms). Do not upload or redistribute other creators&rsquo; files. Uploads are private to your account. QuestLab ships no third-party map packs.</p>

      <h2>No generative AI</h2>
      <p>QuestLab contains no generative AI. Nothing you write or upload is sent to a model, used to train one, or generated for you by one.</p>

      <h2>Rules content</h2>
      <p>Game rules content is from the System Reference Document 5.2.1, used under the Creative Commons Attribution 4.0 license. QuestLab is not affiliated with Wizards of the Coast.</p>

      <h2>Accounts and privacy</h2>
      <p>Signing in with Discord or Patreon shares your account id, display name, avatar and email with QuestLab; the email identifies your campaigns; a Patreon membership supports the project and unlocks nothing you need to play. Player links carry no personal data. We keep no payment details. Delete your campaigns any time from the app.</p>

      <h2>Cookies and storage</h2>
      <p>QuestLab sets no cookies and runs no analytics, advertising or tracking scripts, so there is nothing to accept or reject. Your browser keeps a few things on your device so the app works the way you left it: your sign-in, the campaign you had open, the help level you picked on your phone, whether you&rsquo;ve seen the tour, and which character you last opened from a join link. Only your sign-in is ever sent back, to prove who you are. Fonts and icons come from QuestLab itself, never a third-party font or tracking service. Clearing this site&rsquo;s data in your browser removes all of it.</p>

      <h2>Reasonable use</h2>
      <p>Don&rsquo;t abuse the service, share other people&rsquo;s private data, or upload unlawful content. We may suspend accounts that do.</p>

      <h2>Warranty</h2>
      <p>QuestLab is provided as-is, built by a DM for DMs. Keep a paper backup of anything you can&rsquo;t afford to lose at the table.</p>
    </div>
  );
}
