import { Link } from "react-router-dom";

/** TermsPage (Plan 73) — plain-language terms, content rights, privacy. */
const CSS = `
.tm { max-width: 760px; margin: 0 auto; padding: 2.5rem 1.3rem 5rem; color: #cfc2a4; font-family: Georgia, 'Palatino Linotype', serif; line-height: 1.6; }
.tm h1 { font-family: Cinzel, Georgia, serif; color: #f0e6c8; letter-spacing: 0.05em; margin: 0 0 0.6rem; }
.tm h2 { font-family: Cinzel, Georgia, serif; color: #d6af36; font-size: 1.15rem; margin: 1.8rem 0 0.4rem; }
.tm a { color: #ffd76a; }
`;

export default function TermsPage() {
  return (
    <div className="tm">
      <style>{CSS}</style>
      <p><Link to="/welcome">← QuestLab</Link></p>
      <h1>Terms &amp; privacy</h1>
      <p>Short version: your campaigns are yours, upload only what you have rights to, and we store the minimum needed to keep your account yours.</p>

      <h2>Your content</h2>
      <p>Everything you create or upload — campaigns, characters, maps, notes, generated art — belongs to you. QuestLab stores it to run your table and never sells, shares, or trains on it.</p>

      <h2>Map and image rights</h2>
      <p>You may only upload maps and images you own or are licensed to use at your own table (your own work, personal-use map packs you bought or back, free maps under their terms). Do not upload or redistribute other creators&rsquo; files. Uploads are private to your account. QuestLab ships no third-party map packs.</p>

      <h2>AI features</h2>
      <p>AI generation runs on third-party models and is offered to patrons with a daily allowance. Generated content is yours to use; AI output can be wrong or odd, so review it before it reaches your table.</p>

      <h2>Rules content</h2>
      <p>Game rules content is from the System Reference Document 5.2.1, used under the Creative Commons Attribution 4.0 license. QuestLab is not affiliated with Wizards of the Coast.</p>

      <h2>Accounts and privacy</h2>
      <p>Signing in with Discord or Patreon shares your account id, display name, avatar and email with QuestLab; the email identifies your campaigns and Patreon membership unlocks AI. Player links carry no personal data. We keep no payment details. Delete your campaigns any time from the app.</p>

      <h2>Reasonable use</h2>
      <p>Don&rsquo;t abuse the service, share other people&rsquo;s private data, or upload unlawful content. We may suspend accounts that do.</p>

      <h2>Warranty</h2>
      <p>QuestLab is provided as-is, built by a DM for DMs. Keep a paper backup of anything you can&rsquo;t afford to lose at the table.</p>
    </div>
  );
}
