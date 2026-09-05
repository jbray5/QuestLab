import { Link } from "react-router-dom";

/**
 * GuidePage (Plan 73) — "Your first session in 15 minutes."
 *
 * Public, no chrome. Written for a DM who just clicked a Reddit link:
 * in-person, online, or hybrid. Every step names the exact button.
 */

const CSS = `
.gd { max-width: 820px; margin: 0 auto; padding: 2.5rem 1.3rem 5rem; color: #cfc2a4; font-family: Georgia, 'Palatino Linotype', serif; line-height: 1.6; }
.gd h1 { font-family: Cinzel, Georgia, serif; color: #f0e6c8; font-size: clamp(1.7rem, 5vw, 2.4rem); letter-spacing: 0.05em; margin: 0 0 0.3rem; }
.gd h2 { font-family: Cinzel, Georgia, serif; color: #d6af36; font-size: 1.25rem; letter-spacing: 0.05em; margin: 2.2rem 0 0.6rem; }
.gd h3 { color: #f0e6c8; margin: 1.2rem 0 0.3rem; font-size: 1.05rem; }
.gd .lede { color: #f0e6c8; font-style: italic; font-size: 1.1rem; }
.gd .step { background: rgba(26,20,38,0.7); border: 1px solid #3a2f52; border-radius: 12px; padding: 1rem 1.2rem; margin: 0.8rem 0; }
.gd .step b { color: #f0e6c8; }
.gd .k { display: inline-block; min-width: 1.6em; text-align: center; background: #d6af36; color: #100c18; border-radius: 6px; margin-right: 0.5rem; font-family: Cinzel, serif; font-weight: 700; }
.gd .btnref { font-family: 'IBM Plex Mono', monospace; font-size: 0.85rem; background: #221a33; border: 1px solid #3a2f52; border-radius: 6px; padding: 0.05rem 0.45rem; color: #ffd76a; }
.gd .note { border-left: 3px solid #c25f45; padding: 0.4rem 0.9rem; margin: 0.8rem 0; background: rgba(194,95,69,0.08); }
.gd .watch { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; margin: 0.6rem 0 0.4rem; }
.gd .watch figure { margin: 0; }
.gd .watch video { width: 100%; aspect-ratio: 16 / 9; display: block; border-radius: 10px; border: 1px solid #3a2f52; background: #0b0b10; }
.gd .watch figcaption { font-size: 0.85rem; color: #9a9078; margin-top: 0.45rem; line-height: 1.45; }
.gd .watch figcaption b { color: #f4e9c3; }
.gd .setups { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.8rem; }
.gd .setup { background: rgba(26,20,38,0.7); border: 1px solid #3a2f52; border-radius: 12px; padding: 0.9rem 1rem; }
.gd .setup h3 { margin-top: 0; }
.gd ul { padding-left: 1.2rem; } .gd li { margin: 0.3rem 0; }
.gd a { color: #ffd76a; }
.gd .top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; font-size: 0.9rem; }
`;

export default function GuidePage() {
  return (
    <div className="gd">
      <style>{CSS}</style>
      <div className="top">
        <Link to="/welcome">← QuestLab</Link>
        <span>Guide · <Link to="/terms">Terms</Link></span>
      </div>
      <h1>Your first session in 15 minutes</h1>
      <p className="lede">
        QuestLab runs the table: living character sheets on every player&rsquo;s phone, a shared
        board on a TV, projector, or screen-share, and a DM cockpit that keeps HP, initiative and
        conditions in sync. Here&rsquo;s the whole loop, button by button.
      </p>

      <h2>What you need</h2>
      <ul>
        <li>A laptop for you (the HUD). Any browser.</li>
        <li>Your players&rsquo; phones — no app install, no accounts. They open a link or scan a QR.</li>
        <li>Optional: a TV or projector for the shared board (or a screen-share, or nothing — the board also lives on phones).</li>
      </ul>

      <h2 id="watch">Watch it done</h2>
      <p>Two short captioned recordings of the real app. No narration yet; the captions carry it.</p>
      <div className="watch">
        <figure>
          <video controls playsInline preload="metadata" poster="https://lemsan3qq1nll8xj.public.blob.vercel-storage.com/maps/7da2a586-4ab6-4d38-9883-29b408fcf118-SqFlJ8IvCtc0u8CraugiH9UlmklIDM.webp">
            <source src="https://lemsan3qq1nll8xj.public.blob.vercel-storage.com/maps/b8bd32de-4e22-4b46-aabc-493006e995fb-O2mfowdtRJS5JOVnfqQqNrH1LU28kR.mp4" type="video/mp4" />
          </video>
          <figcaption><b>Set up in five minutes</b> (1:47) — sign in, create a campaign, an arc and a session, upload a map, put the QR on the TV, and a player builds a character on their phone.</figcaption>
        </figure>
        <figure>
          <video controls playsInline preload="metadata" poster="https://lemsan3qq1nll8xj.public.blob.vercel-storage.com/maps/33d9e27a-3db0-4bdc-aa9e-de476964fd62-LcZYFJ2Q7KBS3xtgVTsL5DCDvRxQaS.webp">
            <source src="https://lemsan3qq1nll8xj.public.blob.vercel-storage.com/maps/212a657f-6a08-476f-8726-872fe5df10a6-zMzVYWtBmxbgvoPbgQrwkrmgxlmxAM.mp4" type="video/mp4" />
          </video>
          <figcaption><b>Game night</b> (1:07) — the HUD, staging a map, adding foes and rolling initiative, dragging tokens, damage and conditions landing on a phone, a die landing on the TV.</figcaption>
        </figure>
      </div>

      <h2>The loop</h2>
      <div className="step"><span className="k">1</span><b>Sign in.</b> Continue with Discord (or Patreon). Your campaigns are tied to that account — nobody else can see them.</div>
      <div className="step"><span className="k">2</span><b>Create a campaign.</b> Name, setting, tone. New here? Press <span className="btnref">🎲 Create a sample campaign</span> on the dashboard to get a ready-made adventure, four pregens, a map and an encounter you can run tonight.</div>
      <div className="step"><span className="k">3</span><b>Add your players.</b> Campaign → Characters → <span className="btnref">+ Character</span>. You only need a name and class; players fill the rest in from their phones. Then show the join code: open the session&rsquo;s table and tap the <span className="btnref">📱</span> chip (or <span className="btnref">📱 QR → projector</span> from the HUD). Each player scans, taps their name, and their live sheet is on their phone — it remembers them next time.</div>
      <div className="step"><span className="k">4</span><b>Add a map.</b> Campaign → Battle Maps → <span className="btnref">+ Import maps</span>. JPG, PNG, WebP — or an MP4/WebM loop for an animated map. Big files are fine (up to 80 MB). Set the grid size once and the board draws it for you. See <a href="#maps">maps and licensing</a> below.</div>
      <div className="step"><span className="k">5</span><b>Build an encounter.</b> Sessions → your arc → <span className="btnref">💀 Encounters</span> → <span className="btnref">+ Encounter</span>, pick monsters from the SRD catalog; the difficulty meter updates as you add them.</div>
      <div className="step"><span className="k">6</span><b>Run the night.</b> Sessions → <b>HUD</b>. Stage a map (Maps tab), then in the 🎮 Live tab <span className="btnref">+ Party</span> and <span className="btnref">+ Foes (combat)</span> to put tokens on it, start combat, and go. Damage you apply lands on players&rsquo; phones in about a second; conditions you set show on the board; players shake their phones to roll and everyone watches the die land on the shared board.</div>

      <h2 id="setups">In person, online, or both</h2>
      <div className="setups">
        <div className="setup"><h3>🛋 In person</h3>Open <span className="btnref">Projector</span> from the HUD on a TV or projector. Players use their phones for sheets and dice. Real dice at the table work too — the app is happy either way.</div>
        <div className="setup"><h3>🎧 Online</h3>Share the projector link in your video call (or screen-share it). Every player opens the same link on their own screen — it updates live. Phones still carry the sheets.</div>
        <div className="setup"><h3>🔀 Hybrid</h3>TV for the room, link for the remote players. Same board, same second-by-second sync. The 3D table view is a great remote-player window.</div>
      </div>

      <h2 id="cockpit">Two screens, one cockpit</h2>
      <p>The setup most DMs land on: the players&rsquo; screen (a TV, a projector, or a shared link) shows the <b>3D table view</b>; your own screen shows the <b>HUD</b> — party HP on the left; the combat bar and initiative across the top; the live board; your notes and the beats underneath. Give it three-quarters of a monitor and you never have to leave it during play.</p>
      <ul>
        <li><b>Notes anywhere.</b> Press <b>N</b> on any DM page for the notes dock: tonight&rsquo;s notes (autosaved), the runbook script, and every NPC with their secrets. Drag it where you like, resize it from the corner, dim it to see the board through it.</li>
        <li><b>Half a monitor?</b> If Discord takes the other half, hit <span className="btnref">↗ Pop out</span> on the dock: your notes open in a small window you can park over the Discord chat column.</li>
        <li><b>Move tokens from the HUD.</b> The 🎮 Live tab is the same board the players see — drag, ping, drop markers, stand a faction down. Save the 3D Board page for set dressing before the night.</li>
      </ul>

      <h2 id="maps">Maps and licensing</h2>
      <p>Upload maps you have the right to use at your own table. That covers:</p>
      <ul>
        <li><b>Maps you made</b> — drawn, photographed, or generated with your own tools.</li>
        <li><b>Map packs you bought or back</b> (Czepeku, Dynamic Dungeons, Forgotten Adventures, DMG maps and the like) — their personal-use licenses let you use them at your table. Never share their files with other people through QuestLab or anywhere else.</li>
        <li><b>Free maps</b> from generators such as Infinity or Watabou, under their terms.</li>
      </ul>
      <div className="note"><b>QuestLab ships no third-party map packs.</b> Your uploads are private to your account and only appear on your own tables. Don&rsquo;t upload art you don&rsquo;t have rights to.</div>
      <p>Tips: keep maps under ~4000&nbsp;px on the long edge for fast loading; set the grid size to match your map&rsquo;s squares (most 4K packs are 140–160&nbsp;px); animated loops of 5–20&nbsp;MB stream smoothly.</p>

      <h2>AI features</h2>
      <p>Sheets, the table, the board, dice, the projector and phones are free, forever. AI generation runs on paid models, so it&rsquo;s included with a QuestLab Patreon membership. Three tiers, each with a daily allowance so costs stay sane; everything you generate is yours to keep, even if you stop.</p>
      <ul>
        <li><b>Hearth — $5 / month.</b> AI for prep: NPCs with secrets, monster picks, session briefs, runbooks, shop stock, item lore. 15 generations a day.</li>
        <li><b>Lantern — $12 / month.</b> Everything in Hearth, plus art — portraits, standees, backdrops, props, world maps, the players&rsquo; forge — and full Session Packs. 40 a day.</li>
        <li><b>Table — $25 / month.</b> Everything in Lantern with 120 a day, a seat in the Discord, and your name in the credits.</li>
      </ul>
      <p>Sign in with Patreon (or link it under your account) and the buttons unlock the moment your pledge is active.</p>

      <h2>Common questions</h2>
      <h3>Do my players need accounts?</h3><p>No. A player&rsquo;s link is their key; keep it in the group. They can reopen their sheet any time from the same phone.</p>
      <h3>Is my campaign private?</h3><p>Yes. Only your signed-in account can see or change it. Player links show that player&rsquo;s sheet and the shared table — never your notes.</p>
      <h3>What rules does it use?</h3><p>D&amp;D 5e, 2024 edition, with SRD 5.2.1 content under CC-BY 4.0.</p>
      <h3>Something broke mid-session</h3><p>Reload the page — everything is saved server-side. If the board looks stale, reload the projector tab.</p>
    </div>
  );
}
