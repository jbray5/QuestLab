import { Link } from "react-router-dom";

/**
 * TermsPage (Plan 73; Lamplit tokens in Plan 123) — plain-language terms, content rights, privacy.
 * Plan 128: honest about what a player link carries, what is kept and for how
 * long, players under 16, and how to get in touch (Send feedback in the app).
 */
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

      <h2 id="no-ai">No generative AI</h2>
      <p>QuestLab contains no generative AI. Nothing you write or upload is sent to a model, used to train one, or generated for you by one: no AI art, no AI-written story, NPCs or runbooks.</p>

      <h2>Rules content</h2>
      <p>This work includes material taken from the System Reference Document 5.2.1 (&ldquo;SRD 5.2.1&rdquo;) and, for campaigns on the 2014 rules, the System Reference Document 5.1 (&ldquo;SRD 5.1&rdquo;), both by Wizards of the Coast LLC and available at <a href="https://dnd.wizards.com/resources/systems-reference-document" target="_blank" rel="noreferrer">dnd.wizards.com/resources/systems-reference-document</a>. Both are licensed under the <a href="https://creativecommons.org/licenses/by/4.0/legalcode" target="_blank" rel="noreferrer">Creative Commons Attribution 4.0 International License</a>. QuestLab is not affiliated with Wizards of the Coast.</p>
      <p>The 2014 tables were compiled with help from the open 5e-database project (MIT License, copyright Adrian Padua and Christopher Ward).</p>
      <p>The class icons a character wears until it has a picture are by Lorc and Delapouite from <a href="https://game-icons.net" target="_blank" rel="noreferrer">game-icons.net</a>, used under the <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">Creative Commons Attribution 3.0</a> license. They are drawn by people, not generated.</p>

      <h2>Accounts and privacy</h2>
      <p>Only DMs have accounts. An email-and-password account keeps your name, your email and a scrambled (hashed) form of your password, never the password itself. Signing in with Discord or Patreon shares your account id, display name, avatar and email with QuestLab. Either way, the email identifies your campaigns. A Patreon membership supports the project and unlocks nothing you need to play. We keep no payment details.</p>

      <h2 id="players">Players and player links</h2>
      <p>A player link opens one character&rsquo;s sheet, and it carries what is written on that character: the character, the player&rsquo;s name as they typed it, any notes on the character, and what the player wrote in side quests. Anyone holding the link, or the table&rsquo;s join code, can see those, so share a link only with its player. The DM can replace a link at any time, and the old one stops working. If a player tells the party about a side quest, those words go to everyone at the table.</p>
      <p>Players under 16: players never make accounts, and QuestLab never asks them for an age or an email. The name a player types is only for the table, so a club leader can use first names or initials, and keep the notes box free of anything private.</p>

      <h2>What is kept, and for how long</h2>
      <p>Campaigns and everything in them (characters, player names, notes, sessions and maps) are kept until the DM deletes the campaign, and deleting it removes them. Uploaded picture files can stay in storage for a while after that, with nothing pointing to them, until they are cleared out. Feedback notes sent from the app are kept so they can be read.</p>

      <h2>Questions and contact</h2>
      <p>Questions about your data, or something you want removed? Use <b>Send feedback</b> in the app: it is in the menu on any DM screen, and in the Journal on a player&rsquo;s phone. A person reads every note.</p>

      <h2>Cookies and storage</h2>
      <p>QuestLab sets no cookies and runs no analytics, advertising or tracking scripts, so there is nothing to accept or reject. Your browser keeps a few things on your device so the app works the way you left it: your sign-in, the campaign you had open, the help level you picked on your phone, whether you&rsquo;ve seen the tour and other one-time hints, which character you last opened from a join link, which party each player link belongs to (so a replaced link can point you back to your party), and, if you link Obsidian notes, your vault&rsquo;s name. Only your sign-in is ever sent back, to prove who you are. Fonts and icons come from QuestLab itself, never a third-party font or tracking service. Clearing this site&rsquo;s data in your browser removes all of it.</p>

      <h2 id="price">Prices</h2>
      <p>Players never pay. A player&rsquo;s link, phone sheet, the join page and the market are free for good, and no player ever makes an account.</p>
      <p>DMs are free during the beta, with no limits. After the beta, a free DM keeps every table feature with two campaigns and 250&nbsp;MB of uploads. A Patron ($4 a month or $40 a year) gets unlimited campaigns and 5&nbsp;GB of uploads. Limits are on campaigns and storage, never on table features, and going over one never deletes or hides anything: you just can&rsquo;t add more until there&rsquo;s room. We&rsquo;ll say so here and in the app before the limits start.</p>
      <p>QuestLab never takes payment itself. Patron memberships are run by Patreon under Patreon&rsquo;s terms; QuestLab only reads whether your linked Patreon membership is active and at what level.</p>

      <h2>Reasonable use</h2>
      <p>Don&rsquo;t abuse the service, share other people&rsquo;s private data, or upload unlawful content. We may suspend accounts that do.</p>

      <h2>Warranty</h2>
      <p>QuestLab is provided as-is, built by a DM for DMs. Keep a paper backup of anything you can&rsquo;t afford to lose at the table.</p>
    </div>
  );
}
