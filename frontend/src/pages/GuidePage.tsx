import { Link } from "react-router-dom";

/**
 * GuidePage (Plan 73; rewritten in Lamplit for Plan 123) — "Your first session in 15 minutes."
 *
 * Public, no chrome. Written for a DM who just clicked a link: QuestLab is the DM
 * screen and the initiative tracker, with session prep and every player's sheet on
 * their own phone. Like /try, it never pitches the private 3D table or VTT play; a
 * TV, if there is one, shows the join QR, whose turn it is and the last roll.
 * Every step names the exact button.
 */

const CSS = `
.gd { max-width: 820px; margin: 0 auto; padding: 2.5rem 1.3rem 5rem; color: var(--text2); font-family: var(--font-ui); line-height: 1.6; }
.gd h1 { font-family: var(--font-story); font-weight: 700; color: var(--text); font-size: clamp(1.9rem, 6vw, 2.6rem); line-height: 1.1; margin: 0 0 0.6rem; }
.gd h2 { color: var(--text); font-size: 1.3rem; font-weight: 600; margin: 2.4rem 0 0.6rem; }
.gd h3 { color: var(--text); font-size: 1.05rem; font-weight: 600; margin: 1.2rem 0 0.3rem; }
.gd .lede { color: var(--text); font-size: 1.1rem; }
.gd .step { display: flex; gap: 0.8rem; align-items: flex-start; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 1rem 1.1rem; margin: 0.7rem 0; }
.gd .step > div { min-width: 0; }
.gd b { color: var(--text); font-weight: 600; }
.gd .k { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; width: 1.8rem; height: 1.8rem; border-radius: 7px; background: var(--surface3); color: var(--text); font-family: var(--font-mono); font-weight: 600; font-size: 0.95rem; }
.gd .btnref { display: inline-block; font-size: 0.9rem; font-weight: 500; line-height: 1.35; background: var(--surface2); border: 1px solid var(--border2); border-radius: 6px; padding: 0 0.4rem; color: var(--text); }
.gd .note { background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 0.75rem 1rem; margin: 0.7rem 0; }
.gd .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr)); gap: 0.8rem; }
.gd .card2 { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 0.9rem 1rem; }
.gd .card2 h3 { margin-top: 0; }
.gd ul { padding-left: 1.2rem; } .gd li { margin: 0.35rem 0; }
.gd a { color: var(--accent-text); }
.gd .top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.25rem 1rem; margin: -0.6rem 0 1rem; font-size: 0.9375rem; }
.gd .top a, .gd .top span { display: inline-flex; align-items: center; min-height: 44px; }
.gd kbd { font-family: var(--font-mono); font-size: 0.85rem; background: var(--surface2); border: 1px solid var(--border2); border-radius: 5px; padding: 0 0.35rem; color: var(--text); }
`;

export default function GuidePage() {
  return (
    <div className="gd">
      <style>{CSS}</style>
      <nav className="top" aria-label="Site">
        <Link to="/welcome">&larr; QuestLab</Link>
        <span>
          Guide&nbsp;·&nbsp;<Link to="/terms">Terms</Link>
        </span>
      </nav>
      <h1>Your first session in 15 minutes</h1>
      <p className="lede">
        QuestLab is your DM screen and initiative tracker, with every player&rsquo;s sheet on their
        own phone, all kept in step for D&amp;D 5e (2024 rules). You run the night from one screen;
        your players hold their own sheets. Here&rsquo;s the whole loop, button by button.
      </p>

      <h2>What you need</h2>
      <ul>
        <li>A laptop or tablet for you. That&rsquo;s the HUD, your DM screen. Any browser.</li>
        <li>
          Your players&rsquo; phones. No app to install and no accounts: they open a link or scan a
          QR code.
        </li>
        <li>
          Optional: a TV in the room. It can show the join QR, whose turn it is and the last roll.
          Real dice and pencils work too; QuestLab is happy either way.
        </li>
      </ul>

      <h2>The loop</h2>
      <div className="step">
        <span className="k">1</span>
        <div>
          <b>Sign in.</b> With your email on a personal setup, or Continue with Discord (or Patreon)
          on the public one, whichever the sign-in page shows. Your campaigns are tied to that
          account; nobody else can see them.
        </div>
      </div>
      <div className="step">
        <span className="k">2</span>
        <div>
          <b>Create a campaign.</b> Name, setting, tone. New here? Press{" "}
          <span className="btnref">Run the sample night</span> on the dashboard for a ready-made
          adventure with four pregenerated characters and an encounter you can run tonight.
        </div>
      </div>
      <div className="step">
        <span className="k">3</span>
        <div>
          <b>Add your players.</b> Campaign &rarr; Characters &rarr;{" "}
          <span className="btnref">Add character</span>. It walks you through species, class,
          background, scores, feats and spells with the rules checked (a character from paper goes in
          with <span className="btnref">Enter an existing sheet</span> in the &#8943; menu). Or leave{" "}
          <span className="btnref">Players can create their own characters</span> on and let them
          build their own. Then hand out the join link: copy it from the party panel in the HUD, or
          press <span className="btnref">Join QR &rarr; TV</span> and they scan the big screen. Each
          player opens it, taps their name, and their live sheet is on their phone. It remembers
          them next time.
        </div>
      </div>
      <div className="note">
        <b>Optional join code.</b> On Characters, set a short code (or press{" "}
        <span className="btnref">Generate</span>) and the join page asks for it before it lists the
        party. Say it out loud at the table, and a leaked link alone won&rsquo;t get anyone in.
      </div>
      <div className="step">
        <span className="k">4</span>
        <div>
          <b>Prep the session.</b> Campaign &rarr; Sessions keeps your arcs and sessions in order;{" "}
          <span className="btnref">Prep</span> opens tonight&rsquo;s runbook, its read-aloud text
          and your notes. For a fight, open Encounters &rarr;{" "}
          <span className="btnref">New encounter</span> and pick monsters from the SRD catalog; the
          difficulty meter updates as you add them.
        </div>
      </div>
      <div className="step">
        <span className="k">5</span>
        <div>
          <b>Run the night.</b> Sessions &rarr; <span className="btnref">Run</span> opens the HUD:
          every character&rsquo;s hit points, armor class, conditions and spell slots on one
          screen. When a fight starts, press <span className="btnref">Add</span> in the combat bar to
          load your encounter, then <span className="btnref">Roll init</span>; heroes and monsters
          sort into one initiative list, and <span className="btnref">End turn</span> moves it
          along. Damage and conditions you apply land on your players&rsquo; phones in about a
          second.
        </div>
      </div>

      <h2 id="phones">On every phone</h2>
      <p>
        Each player holds their own sheet: hit points, spells, attacks and dice, with as much help
        as they want.
      </p>
      <ul>
        <li>
          <b>Help that grows with them.</b> On first open they pick{" "}
          <span className="btnref">Teach me</span>, <span className="btnref">Remind me</span> or{" "}
          <span className="btnref">Just the numbers</span>: plain words and turn ideas for new
          players, tight numbers for veterans. They can change it any time.
        </li>
        <li>
          <b>Tap to roll.</b> Attacks, saves and checks roll from the sheet. Rolling real dice? They
          type the number instead.
        </li>
        <li>
          <b>Levelling up by the book.</b> When you grant a level, a guide on their phone walks them
          through hit points, features and spells.
        </li>
        <li>
          <b>Practice Arena.</b> New player, or new class? On the Character tab,{" "}
          <span className="btnref">Practice in the Arena</span> runs a one-on-one sparring match
          against a catalog foe with their real weapons, spells, slots and features, with the dice
          shown and a coach&rsquo;s tip when it matters. Nothing in it changes the character.
        </li>
      </ul>

      <h2 id="table">At the table</h2>
      <div className="cards">
        <div className="card2">
          <h3>Your screen</h3>
          Keep the HUD open on your laptop. Give it most of the screen and you never need to leave
          it during play.
        </div>
        <div className="card2">
          <h3>A TV, if you have one</h3>
          In the HUD, open <span className="btnref">Player display</span> &rarr;{" "}
          <span className="btnref">Projector / TV</span> on the TV. It shows the join QR, whose turn
          it is and the last roll.
        </div>
        <div className="card2">
          <h3>Players at home</h3>
          The join link works anywhere. Remote players keep their sheet open on their phone or
          laptop while you talk on your usual call.
        </div>
      </div>
      <ul>
        <li>
          <b>Notes anywhere.</b> Press <kbd>N</kbd> on any DM page for the notes dock:
          tonight&rsquo;s notes (saved as you type), the runbook and every NPC with their secrets.
          Drag it where you like, resize it from the corner, or dim it to see the HUD through it.
        </li>
        <li>
          <b>Half a monitor?</b> If your call takes the other half, press{" "}
          <span className="btnref">Pop out</span> on the dock: your notes open in a small window
          you can park beside it.
        </li>
      </ul>

      <h2 id="uploads">Your uploads</h2>
      <p>
        Upload only art you have the right to use at your own table: your own drawings, portraits
        you commissioned, packs you bought or back (under their personal-use licences). Never share
        other creators&rsquo; files through QuestLab or anywhere else. Your uploads are private to
        your account and only appear in your own campaigns.
      </p>

      <h2>No generative AI</h2>
      <p>
        QuestLab has no generative AI in it: no AI art, no AI-written NPCs, briefs or runbooks, no
        models behind any button. The rules are the System Reference Document, and the art is yours
        &mdash; your uploads and your players&rsquo; drawings. Everything is free. If it runs your
        table, back the project on Patreon; that keeps the servers on and gets you a seat in the
        Discord and your name in the credits.
      </p>
      <p>
        One honest note about how it&rsquo;s made: QuestLab is built by Justin, a software developer
        who, like most developers now, uses AI coding tools to help write and test the code. That
        stays in the workshop. Nothing in the app generates content, and nothing you or your players
        write is ever sent to an AI.
      </p>

      <h2>Common questions</h2>
      <h3>Do my players need accounts?</h3>
      <p>
        No. A player&rsquo;s link is their key; keep it in the group. They can reopen their sheet
        any time from the same phone.
      </p>
      <h3>Is my campaign private?</h3>
      <p>
        Yes. Only your signed-in account can see or change it. Player links show that
        player&rsquo;s sheet and what you share with the table, never your notes.
      </p>
      <h3>What rules does it use?</h3>
      <p>
        D&amp;D 5e (2024 rules), with SRD 5.2.1 content under CC-BY 4.0. Characters built on the
        2014 rules still work; the rules engine and the level-up guide follow 2024.
      </p>
      <h3>Something broke mid-session</h3>
      <p>
        Reload the page; everything is saved on the server. If the TV looks stale, reload its tab.
      </p>
    </div>
  );
}
